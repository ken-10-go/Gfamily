import { describe, expect, it } from 'vitest';

import {
  computeLayout,
  generationShiftApplies,
  generationsOf,
  NODE_HEIGHT,
  NODE_WIDTH,
  V_GAP,
  type TreeLayout,
} from '@/features/tree-view/layout';
import {
  EMPTY_PERSON,
  type ParentChild,
  type Person,
  type TreeGraph,
  type Union,
} from '@/types/models';

let counter = 0;

function person(id: string, overrides: Partial<Person> = {}): Person {
  counter += 1;
  return {
    ...EMPTY_PERSON,
    id,
    familyName: '山田',
    givenName: id,
    birthDate: `19${String(counter).padStart(2, '0')}-01-01`,
    ...overrides,
  };
}

function link(
  parentId: string,
  childId: string,
  overrides: Partial<ParentChild> = {},
): ParentChild {
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
        parentChild: [link('father', 'elder'), link('mother', 'elder'), link('father', 'younger')],
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
        unions: [union('父', '母A', { status: 'divorced' }), union('父', '母B')],
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

  it('婚姻で子が下がったとき、その親も一緒に下りてくる', () => {
    /*
     * 佐々巳 → 敏行 は1世代しかないが、敏行が順子（3世代目）と結婚して下へ引かれる。
     * 親を引き下ろす規則が無いと、佐々巳だけが最上段に取り残されて浮いて見える。
     */
    const layout = computeLayout(
      graph({
        persons: [
          person('リカ'),
          person('榮'),
          person('サツエ'),
          person('佐々巳'),
          person('ユリ子'),
          person('順子'),
          person('敏行'),
        ],
        parentChild: [
          link('リカ', 'サツエ'),
          link('榮', '順子'),
          link('サツエ', '順子'),
          link('佐々巳', '敏行'),
          link('ユリ子', '敏行'),
        ],
        unions: [union('榮', 'サツエ'), union('佐々巳', 'ユリ子'), union('敏行', '順子')],
      }),
    );

    const generationOf = (id: string) => nodeOf(layout, id).generation;

    // 同じ立場（子が同じ段にいる親）どうしは、同じ段に並ぶ
    expect(generationOf('佐々巳')).toBe(generationOf('榮'));
    expect(generationOf('ユリ子')).toBe(generationOf('サツエ'));
    // 親は子のすぐ上。段を飛ばさない
    expect(generationOf('敏行') - generationOf('佐々巳')).toBe(1);
    // 曽祖母だけが1段上に残る
    expect(generationOf('リカ')).toBe(generationOf('サツエ') - 1);
  });

  it('親は必ず子より上に置かれる', () => {
    const layout = computeLayout(
      graph({
        persons: ['祖', '親', '子', '孫', '婿'].map((id) => person(id)),
        parentChild: [link('祖', '親'), link('親', '子'), link('子', '孫'), link('婿', '孫')],
        unions: [union('婿', '子')],
      }),
    );

    for (const family of layout.families) {
      for (const parentId of family.parentIds) {
        for (const childId of family.childIds) {
          expect(nodeOf(layout, parentId).generation).toBeLessThan(
            nodeOf(layout, childId).generation,
          );
        }
      }
    }
  });

  it('手で指定した段のぶんだけ、その人を上下させる', () => {
    const layout = computeLayout(
      graph({
        persons: [person('親'), person('子'), person('孫', { generationShift: 1 })],
        parentChild: [link('親', '子'), link('子', '孫')],
      }),
    );

    // 孫だけが1段下がる。親と子はそのまま
    expect(nodeOf(layout, '親').generation).toBe(0);
    expect(nodeOf(layout, '子').generation).toBe(1);
    expect(nodeOf(layout, '孫').generation).toBe(3);
    // 縦は必ず世代の行に乗る
    expect(nodeOf(layout, '孫').y).toBe(3 * (NODE_HEIGHT + V_GAP));
  });

  it('動かすのは本人だけ。子孫は連れて行かない', () => {
    const layout = computeLayout(
      graph({
        persons: [person('親', { generationShift: -2 }), person('子'), person('孫')],
        parentChild: [link('親', '子'), link('子', '孫')],
      }),
    );

    // 上へ2段ぶん空くので、全体が下へずれて一番上が 0 になる
    expect(nodeOf(layout, '親').generation).toBe(0);
    expect(nodeOf(layout, '子').generation).toBe(3);
    expect(nodeOf(layout, '孫').generation).toBe(4);
  });

  it('上へ動かして図がはみ出しても、一番上の段が0になるようにそろえる', () => {
    const layout = computeLayout(
      graph({
        persons: [person('単独', { generationShift: -3 })],
      }),
    );

    expect(nodeOf(layout, '単独').generation).toBe(0);
    expect(nodeOf(layout, '単独').y).toBe(0);
  });

  it('親が子と同じ段や下に来る指定は、無効にして自動へ戻す', () => {
    const layout = computeLayout(
      graph({
        // 親を2段下げると子を追い越してしまう
        persons: [person('親', { generationShift: 2 }), person('子')],
        parentChild: [link('親', '子')],
      }),
    );

    expect(nodeOf(layout, '親').generation).toBe(0);
    expect(nodeOf(layout, '子').generation).toBe(1);
  });

  it('壊れる指定を無効にしても、他の人の指定は生きる', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('親', { generationShift: 5 }),
          person('子'),
          person('無関係', { generationShift: 2 }),
        ],
        parentChild: [link('親', '子')],
      }),
    );

    expect(nodeOf(layout, '親').generation).toBe(0);
    expect(nodeOf(layout, '無関係').generation).toBe(2);
  });

  it('無効になる指定でも、夫婦が別の段に置き去りにされない', () => {
    /*
     * 報告のあった不具合。嫁いだ美帆を上の段へ動かそうとすると、
     * 親と同じ段になるので指定は無効になる。ところが「連れて動く」はずの
     * 配偶者だけが動いたまま残り、夫婦の線が斜めに長く伸びていた。
     * 押すたびに離れていくので、何度も押して差が開く。
     */
    const layout = computeLayout(
      graph({
        persons: [
          person('和博'),
          person('しのぶ'),
          person('美帆', { generationShift: -1 }),
          person('達郎'),
        ],
        parentChild: [link('和博', '美帆'), link('しのぶ', '美帆')],
        unions: [union('和博', 'しのぶ'), union('美帆', '達郎')],
      }),
    );

    expect(nodeOf(layout, '美帆').generation).toBe(nodeOf(layout, '達郎').generation);
    // 指定そのものが無効なので、自動のときと同じ段に戻る
    expect(nodeOf(layout, '美帆').generation).toBe(1);
  });

  it('段をずらすと、指定していない配偶者も同じ段について来る', () => {
    const layout = computeLayout(
      graph({
        persons: [person('夫', { generationShift: 2 }), person('妻')],
        unions: [union('夫', '妻')],
      }),
    );

    expect(nodeOf(layout, '夫').generation).toBe(nodeOf(layout, '妻').generation);
  });

  it('段の番号は、描画を通さずに引ける', () => {
    const tree = graph({
      persons: [person('親'), person('子'), person('孫')],
      parentChild: [link('親', '子'), link('子', '孫')],
    });

    // 図に出している番号（LayoutNode.generation）と同じ値
    const layout = computeLayout(tree);
    const levels = generationsOf(tree);

    for (const node of layout.nodes) {
      expect(levels.get(node.person.id)).toBe(node.generation);
    }
  });

  it('効かない指定は、保存する前に見分けられる', () => {
    const tree = graph({
      persons: [person('親'), person('子')],
      parentChild: [link('親', '子')],
    });

    // 親を1段下げると子と同じ段になるので効かない。上げるぶんには効く
    expect(generationShiftApplies(tree, '親', 1)).toBe(false);
    expect(generationShiftApplies(tree, '親', -1)).toBe(true);
    // 自動に戻す（0）はいつでも通す
    expect(generationShiftApplies(tree, '親', 0)).toBe(true);
  });

  it('3世代を正しい深さに配置する', () => {
    const layout = computeLayout(
      graph({
        persons: [person('gp'), person('gm'), person('p'), person('s'), person('c')],
        parentChild: [link('gp', 'p'), link('gm', 'p'), link('p', 'c'), link('s', 'c')],
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
        unions: [union('man', 'firstWife', { status: 'divorced' }), union('man', 'secondWife')],
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
    const layout = computeLayout(graph({ persons: [person('a'), person('b'), person('c')] }));

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

  it('夫婦は男性を左、女性を右に置く', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('wife', { gender: 'female', birthDate: '1950-01-01' }),
          person('husband', { gender: 'male', birthDate: '1955-01-01' }),
          person('child', { birthDate: '1980-01-01' }),
        ],
        parentChild: [link('husband', 'child'), link('wife', 'child')],
        unions: [union('husband', 'wife')],
      }),
    );

    // 妻のほうが年上でも、男性が左に来る
    expect(nodeOf(layout, 'husband').x).toBeLessThan(nodeOf(layout, 'wife').x);
  });

  it('性別が不明な配偶者は男女の間に置く', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('female', { gender: 'female' }),
          person('unknown', { gender: 'unknown' }),
          person('male', { gender: 'male' }),
          person('child'),
        ],
        parentChild: [link('male', 'child'), link('unknown', 'child'), link('female', 'child')],
      }),
    );

    expect(nodeOf(layout, 'male').x).toBeLessThan(nodeOf(layout, 'unknown').x);
    expect(nodeOf(layout, 'unknown').x).toBeLessThan(nodeOf(layout, 'female').x);
  });

  it('手で置けるのは横だけで、縦は必ず世代の行に置く', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('parent'),
          person('moved', { position: { x: 640, y: 320 } }),
          person('auto'),
        ],
        parentChild: [link('parent', 'moved'), link('parent', 'auto')],
      }),
    );

    const moved = nodeOf(layout, 'moved');
    expect(moved.x).toBe(640);
    // 縦は世代の行のまま。カードの大きさを変えても世代がそろう
    expect(moved.y).toBe(nodeOf(layout, 'auto').y);
    expect(moved.placedByHand).toBe(true);
    expect(nodeOf(layout, 'auto').placedByHand).toBe(false);
  });

  it('手で置いたカードも含めて図の横幅を測る', () => {
    const layout = computeLayout(
      graph({ persons: [person('a'), person('far', { position: { x: 1200, y: 900 } })] }),
    );

    expect(layout.width).toBeGreaterThanOrEqual(1200);
  });

  it('家族単位に親子の種別を持たせる（線の描き分けに使う）', () => {
    const layout = computeLayout(
      graph({
        persons: [person('父'), person('母'), person('実子'), person('養子')].map((p) => p),
        parentChild: [
          link('父', '実子'),
          link('母', '実子'),
          link('父', '養子', { kind: 'adoptive' }),
          link('母', '養子', { kind: 'adoptive' }),
        ],
      }),
    );

    const family = layout.families.find((f) => f.childIds.length === 2);
    expect(family?.childKinds['実子']).toBe('biological');
    expect(family?.childKinds['養子']).toBe('adoptive');
  });

  it('片方の親とだけ縁組している子は、縁組のほうを採る', () => {
    // 連れ子：母とは実子、再婚した父とは連れ子
    const layout = computeLayout(
      graph({
        persons: [person('父'), person('母'), person('連れ子')],
        parentChild: [link('母', '連れ子'), link('父', '連れ子', { kind: 'step' })],
      }),
    );

    const family = layout.families.find((f) => f.childIds.includes('連れ子'));
    expect(family?.childKinds['連れ子']).toBe('step');
  });

  it('新しい世代の最初の子でも、親の真下に置かれる', () => {
    // 祖父母の下に父がいて、その父に子を1人追加した状態。
    // 子の世代にはまだ誰もいないので、素朴に「空いている左端」へ置くと
    // 図の左端に飛んでしまう。
    const layout = computeLayout(
      graph({
        persons: ['祖父', '祖母', '父', '叔父', '母', '新しい子'].map((id) => person(id)),
        parentChild: [
          link('祖父', '父'),
          link('祖母', '父'),
          link('祖父', '叔父'),
          link('祖母', '叔父'),
          link('父', '新しい子'),
          link('母', '新しい子'),
        ],
        unions: [union('祖父', '祖母'), union('父', '母')],
      }),
    );

    const child = nodeOf(layout, '新しい子');
    expect(child.x).toBeCloseTo((nodeOf(layout, '父').x + nodeOf(layout, '母').x) / 2, 5);
    // 図の左端（最初に置かれる位置）ではない
    expect(child.x).toBeGreaterThan(Math.min(...layout.nodes.map((n) => n.x)));
    expectNoOverlap(layout);
  });

  it('きょうだいのうち片方だけに子がいても、その親の真下に置かれる', () => {
    const layout = computeLayout(
      graph({
        persons: ['祖父', '祖母', '父', '叔父', '孫'].map((id) => person(id)),
        parentChild: [
          link('祖父', '父'),
          link('祖母', '父'),
          link('祖父', '叔父'),
          link('祖母', '叔父'),
          link('叔父', '孫'),
        ],
        unions: [union('祖父', '祖母')],
      }),
    );

    expect(nodeOf(layout, '孫').x).toBeCloseTo(nodeOf(layout, '叔父').x, 5);
    expectNoOverlap(layout);
  });

  it('手で置いた親の真下に、自動配置の子をぶら下げる', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('父', { position: { x: 900, y: 400 } }),
          person('母', { position: { x: 1100, y: 400 } }),
          person('新しい子'),
        ],
        parentChild: [link('父', '新しい子'), link('母', '新しい子')],
      }),
    );

    const child = nodeOf(layout, '新しい子');
    // 夫婦の中央、1世代ぶん下（縦は世代の行）
    expect(child.x).toBeCloseTo(1000, 5);
    expect(child.y).toBeCloseTo(NODE_HEIGHT + V_GAP, 5);
    // 自動配置のままなので、あとから並べ直せる
    expect(child.placedByHand).toBe(false);
  });

  it('子が複数いても、並びと間隔を保ったまま親の下へ寄せる', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('親', { position: { x: 800, y: 0 } }),
          person('兄', { birthDate: '1980-01-01' }),
          person('弟', { birthDate: '1985-01-01' }),
        ],
        parentChild: [link('親', '兄'), link('親', '弟')],
      }),
    );

    const older = nodeOf(layout, '兄');
    const younger = nodeOf(layout, '弟');

    expect(older.x).toBeLessThan(younger.x);
    expect((older.x + younger.x) / 2).toBeCloseTo(800, 5);
    expect(younger.x - older.x).toBeCloseTo(NODE_WIDTH + 28, 5);
  });

  it('手で置いた子は、親を動かしても動かさない', () => {
    const layout = computeLayout(
      graph({
        persons: [
          person('親', { position: { x: 900, y: 0 } }),
          person('据え置きの子', { position: { x: 100, y: 500 } }),
        ],
        parentChild: [link('親', '据え置きの子')],
      }),
    );

    const child = nodeOf(layout, '据え置きの子');
    expect(child.x).toBe(100);
    expect(child.y).toBe(NODE_HEIGHT + V_GAP);
  });

  it('親を動かしたぶんは孫にも伝わる', () => {
    const layout = computeLayout(
      graph({
        persons: [person('祖父', { position: { x: 1000, y: 0 } }), person('父'), person('孫')],
        parentChild: [link('祖父', '父'), link('父', '孫')],
      }),
    );

    expect(nodeOf(layout, '父').x).toBeCloseTo(1000, 5);
    expect(nodeOf(layout, '孫').x).toBeCloseTo(1000, 5);
    expect(nodeOf(layout, '孫').y).toBeCloseTo(2 * (NODE_HEIGHT + V_GAP), 5);
  });

  it('ignoreManualPositions を指定すると、手で置いた位置を無視して自動で並べる', () => {
    const input = graph({
      persons: [person('親'), person('子', { position: { x: 1200, y: 900 } })],
      parentChild: [link('親', '子')],
    });

    const layout = computeLayout(input, undefined, { ignoreManualPositions: true });
    const child = nodeOf(layout, '子');

    expect(child.placedByHand).toBe(false);
    expect(child.x).toBeCloseTo(nodeOf(layout, '親').x, 5);
    expect(child.y).toBeCloseTo(NODE_HEIGHT + V_GAP, 5);
    // データ側の指定は残ったまま。解除すれば元の位置に戻る
    expect(nodeOf(computeLayout(input), '子').x).toBe(1200);
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

  it('親の下へ子を寄せ直すとき、先に置かれた姻族に重ならない', () => {
    // 末子（映子）を足すと、きょうだいを親の下へ寄せる動きが、
    // 別の家系から嫁いできた配偶者（後藤夫）の上に乗ってしまっていた。
    const born = (id: string, year: number | null) =>
      person(id, { birthDate: year === null ? null : `${year}-01-01` });

    const layout = computeLayout(
      graph({
        persons: [
          born('リカ', 1905),
          born('榮', 1928),
          born('サツエ', 1931),
          born('佐々巳', 1925),
          born('ユリ子', 1928),
          born('善博', 1949),
          born('順子', 1956),
          born('映子', 1962),
          born('後藤夫', 1955),
          born('理奈', 1978),
          born('健一', 1980),
          born('理香', 1982),
          born('純也', null),
          born('奈保', 1981),
          born('和明', 1983),
          born('駿佑', 2016),
        ],
        parentChild: [
          link('リカ', 'サツエ'),
          ...['善博', '順子', '映子'].flatMap((child) => [
            link('榮', child),
            link('サツエ', child),
          ]),
          link('佐々巳', '後藤夫'),
          link('ユリ子', '後藤夫'),
          ...['理奈', '健一', '理香'].flatMap((child) => [
            link('後藤夫', child),
            link('順子', child),
          ]),
          link('健一', '駿佑'),
          link('奈保', '駿佑'),
        ],
        unions: [
          union('榮', 'サツエ'),
          union('佐々巳', 'ユリ子'),
          union('後藤夫', '順子'),
          union('純也', '理奈'),
          union('健一', '奈保'),
          union('和明', '理香'),
        ],
      }),
    );

    expectNoOverlap(layout);
  });
});
