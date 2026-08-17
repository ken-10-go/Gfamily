import { describe, expect, it } from 'vitest';

import {
  bloodGroups,
  detectHouses,
  houseNameOf,
  houseSizes,
  resolveHouses,
} from '@/features/tree-view/houses';
import {
  EMPTY_PERSON,
  type House,
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

/**
 * 寺原家（リカ→サツエ→順子）と後藤家（佐々巳→敏行）が、
 * 敏行と順子の婚姻でつながっている。
 */
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

const sorted = (groups: string[][]) =>
  groups.map((group) => [...group].sort()).sort((a, b) => a[0].localeCompare(b[0]));

describe('bloodGroups', () => {
  it('婚姻ではつながず、親子でたどった一群に分ける', () => {
    // 敏行と順子は夫婦だが、生家は別。ここで1つにまとめてはいけない
    expect(sorted(bloodGroups(sample))).toEqual([
      ['サツエ', 'リカ', '順子'].sort(),
      ['佐々巳', '敏行'].sort(),
    ]);
  });

  it('誰ともつながっていない人は、その人だけの一群になる', () => {
    const lonely: TreeGraph = { persons: [person('独り', '山田')], parentChild: [], unions: [] };
    expect(bloodGroups(lonely)).toEqual([['独り']]);
  });

  it('削除済みの人物と、その人物を指す関係は数えない', () => {
    const withDeleted: TreeGraph = {
      persons: [person('親', '山田'), person('子', '山田', { deletedAt: '2024-01-01T00:00:00Z' })],
      parentChild: [link('親', '子')],
      unions: [],
    };

    expect(bloodGroups(withDeleted)).toEqual([['親']]);
  });

  it('親子の向きは見ない。上へも下へもつながる', () => {
    const chain: TreeGraph = {
      persons: ['祖', '親', '子'].map((id) => person(id, '山田')),
      parentChild: [link('祖', '親'), link('親', '子')],
      unions: [],
    };

    expect(bloodGroups(chain)).toHaveLength(1);
  });
});

describe('houseNameOf', () => {
  it('いちばん多い姓から「◯◯家」とする', () => {
    const members = [person('a', '寺原'), person('b', '寺原'), person('c', '後藤')];
    expect(houseNameOf(members)).toBe('寺原家');
  });

  it('姓が1つも無ければ、名前のない家とする', () => {
    expect(houseNameOf([person('a', ''), { ...EMPTY_PERSON, id: 'b' }])).toBe('名前のない家');
  });
});

describe('detectHouses', () => {
  it('人数の多い順に、名前を付けて返す', () => {
    const houses = detectHouses(sample);

    expect(houses.map((house) => house.name)).toEqual(['寺原家', '後藤家']);
    expect(houses[0].memberIds).toHaveLength(3);
  });

  it('顔ぶれが同じなら、並び順が変わっても同じ識別子になる', () => {
    const shuffled: TreeGraph = {
      ...sample,
      persons: [...sample.persons].reverse(),
      parentChild: [...sample.parentChild].reverse(),
    };

    const keys = (graph: TreeGraph) =>
      detectHouses(graph)
        .map((house) => house.key)
        .sort();

    expect(keys(shuffled)).toEqual(keys(sample));
  });
});

describe('resolveHouses', () => {
  it('指定が無ければ、自動で判定した家に入る', () => {
    const assignment = resolveHouses(sample);

    expect(assignment.get('順子')?.name).toBe('寺原家');
    expect(assignment.get('順子')?.pinned).toBe(false);
    expect(assignment.get('敏行')?.name).toBe('後藤家');
  });

  it('手で指定した家が、自動の判定より優先される', () => {
    // 嫁いだ順子を、婚家の後藤家として扱いたい場合
    const houses: House[] = [{ id: 'h1', name: '後藤家（婚家）' }];
    const graph: TreeGraph = {
      ...sample,
      persons: sample.persons.map((p) => (p.id === '順子' ? { ...p, houseId: 'h1' } : p)),
    };

    const assignment = resolveHouses(graph, houses);
    expect(assignment.get('順子')).toEqual({ id: 'h1', name: '後藤家（婚家）', pinned: true });
    // 生家のほうは自動判定のまま
    expect(assignment.get('サツエ')?.pinned).toBe(false);
  });

  it('消えた家を指していても壊れず、自動判定に戻る', () => {
    const graph: TreeGraph = {
      ...sample,
      persons: sample.persons.map((p) => (p.id === '順子' ? { ...p, houseId: '消えた' } : p)),
    };

    expect(resolveHouses(graph, []).get('順子')?.name).toBe('寺原家');
  });

  it('全員がどこかの家に属する', () => {
    const assignment = resolveHouses(sample);
    expect(assignment.size).toBe(sample.persons.length);
  });
});

describe('houseSizes', () => {
  it('家ごとの人数を数える', () => {
    const sizes = houseSizes(resolveHouses(sample));

    expect([...sizes.values()].sort()).toEqual([2, 3]);
  });
});
