import { describe, expect, it } from 'vitest';

import {
  collapseHouses,
  collapsedHouseId,
  collapsedHouseTarget,
} from '@/features/tree-view/collapse';
import { resolveHouses } from '@/features/tree-view/houses';
import { computeLayout } from '@/features/tree-view/layout';
import { cardMetrics, DEFAULT_VIEW_SETTINGS } from '@/features/tree-view/useViewSettings';
import {
  EMPTY_PERSON,
  type ParentChild,
  type Person,
  type TreeGraph,
  type Union,
} from '@/types/models';

const person = (id: string, familyName: string, overrides: Partial<Person> = {}): Person => ({
  ...EMPTY_PERSON,
  id,
  familyName,
  givenName: id,
  ...overrides,
});

const link = (parentId: string, childId: string): ParentChild => ({
  id: `${parentId}->${childId}`,
  parentId,
  childId,
  kind: 'biological',
  deletedAt: null,
});

const union = (a: string, b: string): Union => ({
  id: `${a}+${b}`,
  partner1Id: a,
  partner2Id: b,
  status: 'married',
  startDate: null,
  endDate: null,
  deletedAt: null,
});

/** 寺原家（リカ→サツエ→順子）と後藤家（佐々巳→敏行）が、婚姻でつながっている。 */
const sample: TreeGraph = {
  persons: [
    person('リカ', '寺原'),
    person('サツエ', '寺原'),
    person('順子', '寺原'),
    person('佐々巳', '後藤'),
    person('敏行', '後藤'),
  ],
  parentChild: [link('リカ', 'サツエ'), link('サツエ', '順子'), link('佐々巳', '敏行')],
  unions: [union('敏行', '順子')],
};

const metrics = cardMetrics(DEFAULT_VIEW_SETTINGS);
const assignment = resolveHouses(sample);
const teraharaId = assignment.get('順子')!.id;

describe('collapsedHouseTarget', () => {
  it('畳んだカードの ID から家の識別子が取り出せる', () => {
    expect(collapsedHouseTarget(collapsedHouseId('h1'))).toBe('h1');
    expect(collapsedHouseTarget('順子')).toBeNull();
  });
});

describe('collapseHouses', () => {
  it('何も畳まなければ、そのまま返す', () => {
    expect(collapseHouses(sample, assignment, new Set())).toBe(sample);
  });

  it('畳んだ家の人物が1枚のカードに置き換わる', () => {
    const collapsed = collapseHouses(sample, assignment, new Set([teraharaId]));
    const ids = collapsed.persons.map((p) => p.id).sort();

    expect(ids).toEqual(['佐々巳', '敏行', collapsedHouseId(teraharaId)].sort());
    expect(collapsed.persons.find((p) => p.id === collapsedHouseId(teraharaId))?.familyName).toBe(
      '寺原家（3人）',
    );
  });

  it('家の中で閉じた線は落とし、外へのつながりは1枚につなぎ替える', () => {
    const collapsed = collapseHouses(sample, assignment, new Set([teraharaId]));
    const card = collapsedHouseId(teraharaId);

    // リカ→サツエ・サツエ→順子はどちらも寺原家の中なので消える
    expect(collapsed.parentChild).toEqual([link('佐々巳', '敏行')]);
    // 敏行と順子の婚姻は、家どうしのつながりとして残る
    expect(collapsed.unions).toHaveLength(1);
    expect([collapsed.unions[0].partner1Id, collapsed.unions[0].partner2Id].sort()).toEqual(
      ['敏行', card].sort(),
    );
  });

  it('同じ相手への線が重ならない（畳んで同じ行き先になった分はまとめる）', () => {
    const graph: TreeGraph = {
      ...sample,
      // 佐々巳がサツエと順子の両方の親、という極端な形にしても線は1本
      parentChild: [...sample.parentChild, link('佐々巳', 'サツエ'), link('佐々巳', '順子')],
    };

    const collapsed = collapseHouses(graph, resolveHouses(graph), new Set([teraharaId]));
    const toCard = collapsed.parentChild.filter(
      (pc) => pc.childId === collapsedHouseId(teraharaId),
    );
    expect(toCard).toHaveLength(1);
  });

  it('夫婦でもあり親子でもある線は落とす（段が延々と下がるのを防ぐ）', () => {
    // 順子は後藤家へ嫁いでいる。後藤家を畳むと、順子は
    // 「後藤家の配偶者」であると同時に「後藤家（の子）の親」になる。
    const graph: TreeGraph = {
      persons: [...sample.persons, person('理奈', '後藤')],
      parentChild: [...sample.parentChild, link('敏行', '理奈'), link('順子', '理奈')],
      unions: sample.unions,
    };
    const map = resolveHouses(graph);
    const gotoId = map.get('敏行')!.id;

    const collapsed = collapseHouses(graph, map, new Set([gotoId]));
    const card = collapsedHouseId(gotoId);

    // 親としての線は落とし、婚姻のほうを残す
    expect(collapsed.parentChild.some((pc) => pc.parentId === '順子')).toBe(false);
    expect(
      collapsed.unions.some(
        (u) =>
          [u.partner1Id, u.partner2Id].includes('順子') &&
          [u.partner1Id, u.partner2Id].includes(card),
      ),
    ).toBe(true);

    // 「子は親より下」と「夫婦は同じ段」が食い違わないので、段は増えない
    const layout = computeLayout(collapsed, metrics);
    const rows = new Set(layout.nodes.map((node) => node.y));
    expect(rows.size).toBeLessThanOrEqual(3);
  });

  it('畳む家に誰も居なければ、そのまま返す', () => {
    expect(collapseHouses(sample, assignment, new Set(['存在しない家']))).toBe(sample);
  });
});

describe('畳んだ家を実際に配置する', () => {
  it('段が減り、つながりの相手はそのまま残る', () => {
    const before = computeLayout(sample, metrics);
    const after = computeLayout(collapseHouses(sample, assignment, new Set([teraharaId])), metrics);

    expect(after.nodes).toHaveLength(3);
    // 3世代あった寺原家が1枚になるので、図の高さが縮む
    expect(after.height).toBeLessThan(before.height);
    // 婚姻の線は畳んだ1枚との間に残る
    expect(after.couples).toHaveLength(1);
  });
});
