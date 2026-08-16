import { describe, expect, it } from 'vitest';

import { focusGraph } from '@/features/tree-view/focus';
import { EMPTY_PERSON, type ParentChild, type Person, type TreeGraph, type Union } from '@/types/models';

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    ...EMPTY_PERSON,
    id,
    familyName: '山田',
    givenName: id,
    ...overrides,
  };
}

function link(parentId: string, childId: string, overrides: Partial<ParentChild> = {}): ParentChild {
  return {
    id: `${parentId}->${childId}`,
    parentId,
    childId,
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

const ids = (graph: TreeGraph) => graph.persons.map((p) => p.id).sort();

/**
 * 祖父母 → 父・叔父 → 本人・妹／いとこ → 子
 * 父には後妻もいて、その間に異母弟がいる。
 */
const sample: TreeGraph = {
  persons: [
    '祖父',
    '祖母',
    '父',
    '母',
    '叔父',
    '本人',
    '妹',
    'いとこ',
    '子',
    '配偶者',
    '後妻',
    '異母弟',
    '無関係',
  ].map((id) => person(id)),
  parentChild: [
    link('祖父', '父'),
    link('祖母', '父'),
    link('祖父', '叔父'),
    link('祖母', '叔父'),
    link('父', '本人'),
    link('母', '本人'),
    link('父', '妹'),
    link('母', '妹'),
    link('叔父', 'いとこ'),
    link('本人', '子'),
    link('配偶者', '子'),
    link('父', '異母弟'),
    link('後妻', '異母弟'),
  ],
  unions: [union('祖父', '祖母'), union('父', '母'), union('父', '後妻'), union('本人', '配偶者')],
};

describe('focusGraph', () => {
  it('世代数 0 なら中心人物だけを返す', () => {
    const result = focusGraph(sample, '本人', {
      ancestors: 0,
      descendants: 0,
      includeSpouses: false,
    });

    expect(ids(result)).toEqual(['本人']);
    expect(result.parentChild).toEqual([]);
    expect(result.unions).toEqual([]);
  });

  it('配偶者を含める指定なら、中心人物の配偶者だけ足す', () => {
    const result = focusGraph(sample, '本人', {
      ancestors: 0,
      descendants: 0,
      includeSpouses: true,
    });

    expect(ids(result)).toEqual(['本人', '配偶者']);
    expect(result.unions.map((u) => u.id)).toEqual(['本人+配偶者']);
  });

  it('上下1世代で、親・きょうだい・子までを含める', () => {
    const result = focusGraph(sample, '本人', {
      ancestors: 1,
      descendants: 1,
      includeSpouses: false,
    });

    // 親まで上がってから下りるので、きょうだい（妹・異母弟）も範囲に入る。
    // 後妻・配偶者は「含まれた人物の親」なので、配偶者を含めない指定でも残る。
    expect(ids(result)).toEqual(
      ['子', '妹', '本人', '父', '異母弟', '母', '後妻', '配偶者'].sort(),
    );
    // 範囲外の人物につながる関係は落ちる
    expect(result.parentChild.some((pc) => pc.parentId === '祖父')).toBe(false);
    expect(result.unions.map((u) => u.id)).toEqual(['父+母', '父+後妻', '本人+配偶者']);
  });

  it('上2世代まで広げるといとこが入る', () => {
    const result = focusGraph(sample, '本人', {
      ancestors: 2,
      descendants: 1,
      includeSpouses: false,
    });

    expect(ids(result)).toContain('いとこ');
    expect(ids(result)).toContain('叔父');
    expect(ids(result)).toContain('祖父');
    expect(ids(result)).not.toContain('無関係');
  });

  it('配偶者からは先へたどらない', () => {
    const inLaw: TreeGraph = {
      persons: ['本人', '配偶者', '義父'].map((id) => person(id)),
      parentChild: [link('義父', '配偶者')],
      unions: [union('本人', '配偶者')],
    };

    const result = focusGraph(inLaw, '本人', {
      ancestors: 3,
      descendants: 3,
      includeSpouses: true,
    });

    expect(ids(result)).toEqual(['配偶者', '本人'].sort());
  });

  it('中心人物が見つからなければ空を返す', () => {
    expect(focusGraph(sample, 'いない人')).toEqual({
      persons: [],
      parentChild: [],
      unions: [],
    });
  });

  it('削除済みの人物と、その人物を指す関係は除く', () => {
    const withDeleted: TreeGraph = {
      persons: [person('本人'), person('子', { deletedAt: '2024-01-01T00:00:00.000Z' })],
      parentChild: [link('本人', '子')],
      unions: [],
    };

    const result = focusGraph(withDeleted, '本人');
    expect(ids(result)).toEqual(['本人']);
    expect(result.parentChild).toEqual([]);
  });

  it('循環したデータでも止まる', () => {
    const cyclic: TreeGraph = {
      persons: ['a', 'b'].map((id) => person(id)),
      parentChild: [link('a', 'b'), link('b', 'a')],
      unions: [],
    };

    expect(ids(focusGraph(cyclic, 'a', { ancestors: 5, descendants: 5, includeSpouses: false })))
      .toEqual(['a', 'b']);
  });

  it('入力の家系図を書き換えない', () => {
    const before = JSON.stringify(sample);
    focusGraph(sample, '本人');
    expect(JSON.stringify(sample)).toBe(before);
  });
});
