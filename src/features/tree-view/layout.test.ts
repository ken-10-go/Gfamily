import { describe, expect, it } from 'vitest';

import { computeLayout, NODE_WIDTH, type TreeLayout } from '@/features/tree-view/layout';
import type { ParentChild, Person, TreeGraph, Union } from '@/types/models';

let counter = 0;

function person(id: string, overrides: Partial<Person> = {}): Person {
  counter += 1;
  return {
    id,
    familyName: '山田',
    givenName: id,
    maidenName: null,
    gender: 'unknown',
    birthDate: `19${String(counter).padStart(2, '0')}-01-01`,
    deathDate: null,
    birthPlace: null,
    note: null,
    isLiving: true,
    deletedAt: null,
    ...overrides,
  };
}

function link(parentId: string, childId: string, overrides: Partial<ParentChild> = {}): ParentChild {
  return {
    id: `${parentId}->${childId}`,
    parentId: parentId,
    childId: childId,
    kind: 'biological',
    deletedAt: null,
    ...overrides,
  };
}

function union(a: string, b: string, overrides: Partial<Union> = {}): Union {
  return {
    id: `${a}+${b}`,
    partner1Id: a,
    partner2Id: b,
    status: 'married',
    startDate: null,
    endDate: null,
    deletedAt: null,
    ...overrides,
  };
}

function graph(partial: Partial<TreeGraph>): TreeGraph {
  return { persons: [], parentChild: [], unions: [], ...partial };
}

function nodeOf(layout: TreeLayout, id: string) {
  const node = layout.nodes.find((n) => n.person.id === id);
  if (!node) throw new Error(`ノードが見つかりません: ${id}`);
  return node;
}

/** 同世代のカードが重なっていないことを確認する。 */
function expectNoOverlap(layout: TreeLayout) {
  const byGeneration = new Map<number, number[]>();
  for (const node of layout.nodes) {
    const list = byGeneration.get(node.generation) ?? [];
    list.push(node.x);
    byGeneration.set(node.generation, list);
  }

  for (const [generation, xs] of byGeneration) {
    const sorted = [...xs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(
        sorted[i] - sorted[i - 1],
        `世代 ${generation} でカードが重なっています`,
      ).toBeGreaterThanOrEqual(NODE_WIDTH);
    }
  }
}

describe('computeLayout', () => {
  it('人物がいなければ空のレイアウトを返す', () => {
    const layout = computeLayout(graph({}));

    expect(layout.nodes).toEqual([]);
    expect(layout.width).toBe(0);
  });

  it('単独の人物を1件配置する', () => {
    const layout = computeLayout(graph({ persons: [person('a')] }));

    expect(layout.nodes).toHaveLength(1);
    expect(nodeOf(layout, 'a').generation).toBe(0);
    expect(nodeOf(layout, 'a').y).toBe(0);
  });

  it('子は親より1つ下の世代に置かれる', () => {
    const layout = computeLayout(
      graph({
        persons: [person('parent'), person('child')],
        parentChild: [link('parent', 'child')],
      }),
    );

    expect(nodeOf(layout, 'parent').generation).toBe(0);
    expect(nodeOf(layout, 'child').generation).toBe(1);
    expect(nodeOf(layout, 'child').y).toBeGreaterThan(nodeOf(layout, 'parent').y);
  });

  it('配偶者は同じ世代に揃えられる', () => {
    // 婿入りのように、片方だけ親が登録されているケース
    const layout = computeLayout(
      graph({
        persons: [person('grandparent'), person('husband'), person('wife')],
        parentChild: [link('grandparent', 'husband')],
        unions: [union('husband', 'wife')],
      }),
    );

    expect(nodeOf(layout, 'wife').generation).toBe(nodeOf(layout, 'husband').generation);
    expect(nodeOf(layout, 'wife').generation).toBe(1);
  });

  it('夫婦は子の中央の上に置かれる', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('father'),
          person('mother'),
          person('child1'),
          person('child2'),
          person('child3'),
        ],
        parentChild: [
          link('father', 'child1'),
          link('mother', 'child1'),
          link('father', 'child2'),
          link('mother', 'child2'),
          link('father', 'child3'),
          link('mother', 'child3'),
        ],
        unions: [union('father', 'mother')],
      }),
    );

    const parentsCenter = (nodeOf(layout, 'father').x + nodeOf(layout, 'mother').x) / 2;
    const childXs = ['child1', 'child2', 'child3'].map((id) => nodeOf(layout, id).x);
    const childrenCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;

    expect(parentsCenter).toBeCloseTo(childrenCenter, 5);
    expectNoOverlap(layout);
  });

  it('きょうだいを1つの家族単位にまとめる', () => {
    const layout = computeLayout(
      graph({
        persons: [person('father'), person('mother'), person('child1'), person('child2')],
        parentChild: [
          link('father', 'child1'),
          link('mother', 'child1'),
          link('father', 'child2'),
          link('mother', 'child2'),
        ],
      }),
    );

    const withChildren = layout.families.filter((f) => f.childIds.length > 0);
    expect(withChildren).toHaveLength(1);
    expect(withChildren[0].childIds).toEqual(['child1', 'child2']);
    expect(withChildren[0].parentIds).toHaveLength(2);
  });

  it('きょうだいを生年順に並べる', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('parent', { birthDate: '1950-01-01' }),
          person('younger', { birthDate: '1985-01-01' }),
          person('older', { birthDate: '1980-01-01' }),
        ],
        parentChild: [link('parent', 'younger'), link('parent', 'older')],
      }),
    );

    expect(nodeOf(layout, 'older').x).toBeLessThan(nodeOf(layout, 'younger').x);
  });

  it('3世代を正しい深さに配置する', () => {
    const layout = computeLayout(
      graph({
        persons: [person('gp'), person('gm'), person('p'), person('s'), person('c')],
        parentChild: [
          link('gp', 'p'),
          link('gm', 'p'),
          link('p', 'c'),
          link('s', 'c'),
        ],
        unions: [union('gp', 'gm'), union('p', 's')],
      }),
    );

    expect(nodeOf(layout, 'gp').generation).toBe(0);
    expect(nodeOf(layout, 'p').generation).toBe(1);
    expect(nodeOf(layout, 'c').generation).toBe(2);
    expectNoOverlap(layout);
  });

  it('再婚（複数の家族単位に属する親）でもカードが重ならない', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('man'),
          person('firstWife'),
          person('secondWife'),
          person('childA'),
          person('childB'),
        ],
        parentChild: [
          link('man', 'childA'),
          link('firstWife', 'childA'),
          link('man', 'childB'),
          link('secondWife', 'childB'),
        ],
        unions: [
          union('man', 'firstWife', { status: 'divorced' }),
          union('man', 'secondWife'),
        ],
      }),
    );

    expect(layout.nodes).toHaveLength(5);
    expect(layout.couples).toHaveLength(2);
    expectNoOverlap(layout);
  });

  it('養子縁組も親子関係として扱う', () => {
    const layout = computeLayout(
      graph({
        persons: [person('parent'), person('adopted')],
        parentChild: [link('parent', 'adopted', { kind: 'adoptive' })],
      }),
    );

    expect(nodeOf(layout, 'adopted').generation).toBe(1);
  });

  it('削除済みの人物と、それを指す関係を除外する', () => {
    const layout = computeLayout(
      graph({
        persons: [person('alive'), person('removed', { deletedAt: '2026-01-01T00:00:00Z' })],
        parentChild: [link('alive', 'removed')],
        unions: [union('alive', 'removed')],
      }),
    );

    expect(layout.nodes).toHaveLength(1);
    expect(layout.couples).toHaveLength(0);
  });

  it('削除済みの関係を無視する', () => {
    const layout = computeLayout(
      graph({
        persons: [person('a'), person('b')],
        parentChild: [link('a', 'b', { deletedAt: '2026-01-01T00:00:00Z' })],
      }),
    );

    expect(nodeOf(layout, 'b').generation).toBe(0);
  });

  it('データが循環していても停止し、全員を配置する', () => {
    // 本来ありえないが、壊れたインポートデータで起こりうる
    const layout = computeLayout(
      graph({
        persons: [person('a'), person('b'), person('c')],
        parentChild: [link('a', 'b'), link('b', 'c'), link('c', 'a')],
      }),
    );

    expect(layout.nodes).toHaveLength(3);
    expect(layout.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });

  it('つながりのない人物どうしも重ならない', () => {
    const layout = computeLayout(
      graph({ persons: [person('a'), person('b'), person('c')] }),
    );

    expectNoOverlap(layout);
    expect(layout.width).toBeGreaterThan(NODE_WIDTH * 2);
  });

  it('左端が0から始まるようにX座標を正規化する', () => {
    const layout = computeLayout(
      graph({
        persons: [person('parent'), person('child')],
        parentChild: [link('parent', 'child')],
      }),
    );

    const leftMost = Math.min(...layout.nodes.map((n) => n.x - NODE_WIDTH / 2));
    expect(leftMost).toBeCloseTo(0, 5);
  });
});
