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
    familyNameKana: null,
    givenNameKana: null,
    maidenName: null,
    gender: 'unknown',
    birthDate: `19${String(counter).padStart(2, '0')}-01-01`,
    deathDate: null,
    birthPlace: null,
    note: null,
    isLiving: true,
    birthOrder: null,
    siblingOrder: null,
    surnameHistory: [],
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

  it('きょうだいが自分の家族を持っていても、左から年長者順に並ぶ', () => {
    // それぞれが所帯を持つ兄弟。ID の並び順に引きずられて弟が左に来てはいけない。
    const layout = computeLayout(
      graph({
        persons: [
          person('parent', { birthDate: '1920-01-01' }),
          person('z-elder', { birthDate: '1950-01-01' }),
          person('a-younger', { birthDate: '1955-01-01' }),
          person('z-elder-spouse', { birthDate: '1952-01-01' }),
          person('a-younger-spouse', { birthDate: '1957-01-01' }),
          person('elder-child', { birthDate: '1980-01-01' }),
          person('younger-child', { birthDate: '1985-01-01' }),
        ],
        parentChild: [
          link('parent', 'z-elder'),
          link('parent', 'a-younger'),
          link('z-elder', 'elder-child'),
          link('z-elder-spouse', 'elder-child'),
          link('a-younger', 'younger-child'),
          link('a-younger-spouse', 'younger-child'),
        ],
        unions: [union('z-elder', 'z-elder-spouse'), union('a-younger', 'a-younger-spouse')],
      }),
    );

    expect(nodeOf(layout, 'z-elder').x).toBeLessThan(nodeOf(layout, 'a-younger').x);
    expect(nodeOf(layout, 'elder-child').x).toBeLessThan(nodeOf(layout, 'younger-child').x);
    expectNoOverlap(layout);
  });

  it('年だけの曖昧な生年でも年長者が左に来る', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('parent', { birthDate: '1900' }),
          person('younger', { birthDate: '1935-06' }),
          person('elder', { birthDate: '1930' }),
        ],
        parentChild: [link('parent', 'younger'), link('parent', 'elder')],
      }),
    );

    expect(nodeOf(layout, 'elder').x).toBeLessThan(nodeOf(layout, 'younger').x);
  });

  it('生年が分からない子は年長者の右に置く', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('parent', { birthDate: '1900' }),
          person('unknown', { birthDate: null }),
          person('known', { birthDate: '1930' }),
        ],
        parentChild: [link('parent', 'unknown'), link('parent', 'known')],
      }),
    );

    expect(nodeOf(layout, 'known').x).toBeLessThan(nodeOf(layout, 'unknown').x);
  });

  it('片親しか登録されていない子が混ざっても年長者順に並ぶ', () => {
    // 配偶者を登録する前に長男を、登録した後に次男を追加した、という入力順で起こる。
    // 親の組が違うため別の家族単位になるが、表示上は同じきょうだいとして並べたい。
    const layout = computeLayout(
      graph({
        persons: [
          person('father', { birthDate: '1920-01-01' }),
          person('mother', { birthDate: '1925-01-01' }),
          person('elder', { birthDate: '1950-01-01' }),
          person('younger', { birthDate: '1955-01-01' }),
        ],
        parentChild: [
          link('father', 'elder'),
          link('father', 'younger'),
          link('mother', 'younger'),
        ],
        unions: [union('father', 'mother')],
      }),
    );

    expect(nodeOf(layout, 'elder').x).toBeLessThan(nodeOf(layout, 'younger').x);
    expectNoOverlap(layout);
  });

  it('年長の子だけ両親が揃っている場合でも年長者順に並ぶ', () => {
    // 上のケースと親の揃い方が逆。家族単位のキー順に引きずられてはいけない。
    const layout = computeLayout(
      graph({
        persons: [
          person('father', { birthDate: '1950-01-01' }),
          person('mother', { birthDate: '1953-01-01' }),
          person('elder', { birthDate: '1978-01-01' }),
          person('younger', { birthDate: '1982-01-01' }),
        ],
        parentChild: [
          link('father', 'elder'),
          link('mother', 'elder'),
          link('father', 'younger'),
        ],
        unions: [union('father', 'mother')],
      }),
    );

    expect(nodeOf(layout, 'elder').x).toBeLessThan(nodeOf(layout, 'younger').x);
    expectNoOverlap(layout);
  });

  it('きょうだいの配偶者の年齢に引きずられず、きょうだいの生年順に並ぶ', () => {
    // 妹の夫が兄より年上、という珍しくない組み合わせ
    const layout = computeLayout(
      graph({
        persons: [
          person('father', { birthDate: '1950-01-01' }),
          person('sister1', { birthDate: '1978-01-01' }),
          person('brother', { birthDate: '1980-01-01' }),
          person('sister2', { birthDate: '1982-01-01' }),
          person('sister2-husband', { birthDate: '1970-01-01' }),
          person('brother-wife', { birthDate: '1981-01-01' }),
        ],
        parentChild: [
          link('father', 'sister1'),
          link('father', 'brother'),
          link('father', 'sister2'),
        ],
        unions: [union('sister2', 'sister2-husband'), union('brother', 'brother-wife')],
      }),
    );

    expect(nodeOf(layout, 'sister1').x).toBeLessThan(nodeOf(layout, 'brother').x);
    expect(nodeOf(layout, 'brother').x).toBeLessThan(nodeOf(layout, 'sister2').x);
    expectNoOverlap(layout);
  });

  it('報告された並び（1978→1982→1980）が年齢順になる', () => {
    // 姉妹には父母を、長男には父だけを紐づけたデータ。
    // 別のきょうだい集団として扱われると 1978 → 1982 → 1980 の順に並んでしまう。
    const layout = computeLayout(
      graph({
        persons: [
          person('父', { birthDate: '1950-01-01' }),
          person('母', { birthDate: '1953-01-01' }),
          person('理奈', { birthDate: '1978-01-01', gender: 'female' }),
          person('健一', { birthDate: '1980-01-01', gender: 'male' }),
          person('理香', { birthDate: '1982-01-01', gender: 'female' }),
        ],
        parentChild: [
          link('父', '理奈'),
          link('母', '理奈'),
          link('父', '健一'),
          link('父', '理香'),
          link('母', '理香'),
        ],
        unions: [union('父', '母')],
      }),
    );

    const order = ['理奈', '健一', '理香'].map((id) => nodeOf(layout, id).x);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expectNoOverlap(layout);
  });

  it('再婚した父の2つの家族は統合せず、別のきょうだいとして扱う', () => {
    // {父,母A} と {父,母B} は互いに部分集合でないので、まとめてはいけない
    const layout = computeLayout(
      graph({
        persons: [
          person('父', { birthDate: '1940-01-01' }),
          person('母A', { birthDate: '1942-01-01' }),
          person('母B', { birthDate: '1955-01-01' }),
          person('前妻の子', { birthDate: '1965-01-01' }),
          person('後妻の子', { birthDate: '1980-01-01' }),
        ],
        parentChild: [
          link('父', '前妻の子'),
          link('母A', '前妻の子'),
          link('父', '後妻の子'),
          link('母B', '後妻の子'),
        ],
        unions: [
          union('父', '母A', { status: 'divorced' }),
          union('父', '母B'),
        ],
      }),
    );

    const withChildren = layout.families.filter((f) => f.childIds.length > 0);
    expect(withChildren).toHaveLength(2);
    expect(nodeOf(layout, '前妻の子').x).toBeLessThan(nodeOf(layout, '後妻の子').x);
    expectNoOverlap(layout);
  });

  it('どちらの親の子か決められない場合は推測せず別に扱う', () => {
    // 父が2度結婚していて、片方の子は父しか分からない。どちらの家族にも吸収しない。
    const layout = computeLayout(
      graph({
        persons: [
          person('父', { birthDate: '1940-01-01' }),
          person('母A', { birthDate: '1942-01-01' }),
          person('母B', { birthDate: '1955-01-01' }),
          person('母Aの子', { birthDate: '1965-01-01' }),
          person('母Bの子', { birthDate: '1980-01-01' }),
          person('母不明の子', { birthDate: '1970-01-01' }),
        ],
        parentChild: [
          link('父', '母Aの子'),
          link('母A', '母Aの子'),
          link('父', '母Bの子'),
          link('母B', '母Bの子'),
          link('父', '母不明の子'),
        ],
        unions: [union('父', '母A'), union('父', '母B')],
      }),
    );

    expect(layout.nodes).toHaveLength(6);
    expectNoOverlap(layout);
  });

  it('つながりのない複数の家系でも、年長の家系が左に来る', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('z-old-parent', { birthDate: '1900-01-01' }),
          person('z-old-child', { birthDate: '1930-01-01' }),
          person('a-new-parent', { birthDate: '1940-01-01' }),
          person('a-new-child', { birthDate: '1970-01-01' }),
        ],
        parentChild: [link('z-old-parent', 'z-old-child'), link('a-new-parent', 'a-new-child')],
      }),
    );

    expect(nodeOf(layout, 'z-old-parent').x).toBeLessThan(nodeOf(layout, 'a-new-parent').x);
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

  it('カードの寸法を指定すると間隔がそれに従う', () => {
    // 縦書きやUIサイズの変更でカードの縦横比が変わる
    const narrow = computeLayout(
      graph({
        persons: [person('parent'), person('childA'), person('childB')],
        parentChild: [link('parent', 'childA'), link('parent', 'childB')],
      }),
      { nodeWidth: 60, nodeHeight: 200, hGap: 10, vGap: 40 },
    );

    const [a, b] = ['childA', 'childB'].map((id) => nodeOf(narrow, id));
    expect(Math.abs(b.x - a.x)).toBe(70);
    expect(nodeOf(narrow, 'childA').y).toBe(240);
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
