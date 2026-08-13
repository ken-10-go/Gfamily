import { describe, expect, it } from 'vitest';

import { birthOrderLabel, deriveBirthOrder, siblingsOf } from '@/lib/relations';
import type { Gender, ParentChild, Person, TreeGraph } from '@/types/models';

function person(id: string, gender: Gender, birthDate: string | null): Person {
  return {
    id,
    familyName: '山田',
    givenName: id,
    familyNameKana: null,
    givenNameKana: null,
    maidenName: null,
    gender,
    birthDate,
    deathDate: null,
    birthPlace: null,
    note: null,
    isLiving: true,
    birthOrder: null,
    surnameHistory: [],
    deletedAt: null,
  };
}

function link(parentId: string, childId: string): ParentChild {
  return {
    id: `${parentId}->${childId}`,
    parentId,
    childId,
    kind: 'biological',
    deletedAt: null,
  };
}

function graph(persons: Person[], parentChild: ParentChild[] = []): TreeGraph {
  return { persons, parentChild, unions: [] };
}

describe('deriveBirthOrder', () => {
  const father = person('父', 'male', '1930-01-01');
  const mother = person('母', 'female', '1933-01-01');

  it('男子を生年順に長男・次男・三男と数える', () => {
    const sons = [
      person('三郎', 'male', '1965-01-01'),
      person('太郎', 'male', '1960-01-01'),
      person('次郎', 'male', '1962-01-01'),
    ];
    const g = graph(
      [father, mother, ...sons],
      sons.flatMap((s) => [link('父', s.id), link('母', s.id)]),
    );

    expect(deriveBirthOrder(g, '太郎')).toBe('長男');
    expect(deriveBirthOrder(g, '次郎')).toBe('次男');
    expect(deriveBirthOrder(g, '三郎')).toBe('三男');
  });

  it('女子は男子と別に数える', () => {
    const children = [
      person('長男', 'male', '1960-01-01'),
      person('姉', 'female', '1962-01-01'),
      person('妹', 'female', '1965-01-01'),
    ];
    const g = graph(
      [father, mother, ...children],
      children.flatMap((c) => [link('父', c.id), link('母', c.id)]),
    );

    expect(deriveBirthOrder(g, '長男')).toBe('長男');
    expect(deriveBirthOrder(g, '姉')).toBe('長女');
    expect(deriveBirthOrder(g, '妹')).toBe('次女');
  });

  it('年だけの曖昧な生年でも順序を判断する', () => {
    const children = [person('兄', 'male', '1960'), person('弟', 'male', '1962-05')];
    const g = graph(
      [father, ...children],
      children.map((c) => link('父', c.id)),
    );

    expect(deriveBirthOrder(g, '兄')).toBe('長男');
    expect(deriveBirthOrder(g, '弟')).toBe('次男');
  });

  it('生年が分からない子は後ろに回る', () => {
    const children = [person('不明', 'male', null), person('既知', 'male', '1960-01-01')];
    const g = graph(
      [father, ...children],
      children.map((c) => link('父', c.id)),
    );

    expect(deriveBirthOrder(g, '既知')).toBe('長男');
    expect(deriveBirthOrder(g, '不明')).toBe('次男');
  });

  it('性別が不明な子は通し番号で数える', () => {
    const children = [person('子1', 'unknown', '1960-01-01'), person('子2', 'other', '1962-01-01')];
    const g = graph(
      [father, ...children],
      children.map((c) => link('父', c.id)),
    );

    expect(deriveBirthOrder(g, '子1')).toBe('第1子');
    expect(deriveBirthOrder(g, '子2')).toBe('第2子');
  });

  it('親の組が違えば別のきょうだいとして数える', () => {
    // 再婚した父に、それぞれの妻との子がいる場合
    const stepMother = person('後妻', 'female', '1940-01-01');
    const childA = person('前妻の子', 'male', '1960-01-01');
    const childB = person('後妻の子', 'male', '1970-01-01');

    const g = graph(
      [father, mother, stepMother, childA, childB],
      [
        link('父', '前妻の子'),
        link('母', '前妻の子'),
        link('父', '後妻の子'),
        link('後妻', '後妻の子'),
      ],
    );

    expect(deriveBirthOrder(g, '前妻の子')).toBe('長男');
    expect(deriveBirthOrder(g, '後妻の子')).toBe('長男');
  });

  it('親が登録されていなければ導けない', () => {
    const g = graph([person('孤立', 'male', '1960-01-01')]);
    expect(deriveBirthOrder(g, '孤立')).toBeNull();
  });

  it('11人目以降は第N子で表す', () => {
    const children = Array.from({ length: 11 }, (_, i) =>
      person(`子${i}`, 'male', `19${60 + i}-01-01`),
    );
    const g = graph(
      [father, ...children],
      children.map((c) => link('父', c.id)),
    );

    expect(deriveBirthOrder(g, '子9')).toBe('十男');
    expect(deriveBirthOrder(g, '子10')).toBe('第11子');
  });

  it('削除済みのきょうだいは数に入れない', () => {
    const removed = { ...person('削除済', 'male', '1958-01-01'), deletedAt: '2026-01-01T00:00:00Z' };
    const alive = person('存命', 'male', '1960-01-01');
    const g = graph([father, removed, alive], [link('父', '削除済'), link('父', '存命')]);

    expect(deriveBirthOrder(g, '存命')).toBe('長男');
  });
});

describe('siblingsOf', () => {
  it('本人を含めて年長者順に返す', () => {
    const father = person('父', 'male', '1930-01-01');
    const children = [
      person('弟', 'male', '1965-01-01'),
      person('兄', 'male', '1960-01-01'),
    ];
    const g = graph(
      [father, ...children],
      children.map((c) => link('父', c.id)),
    );

    expect(siblingsOf(g, '兄').map((p) => p.id)).toEqual(['兄', '弟']);
  });
});

describe('birthOrderLabel', () => {
  it('手動指定があればそれを優先する', () => {
    const father = person('父', 'male', '1930-01-01');
    const child = { ...person('子', 'male', '1960-01-01'), birthOrder: '二男' };
    const g = graph([father, child], [link('父', '子')]);

    expect(birthOrderLabel(g, child)).toBe('二男');
  });

  it('手動指定が無ければ自動で導く', () => {
    const father = person('父', 'male', '1930-01-01');
    const child = person('子', 'male', '1960-01-01');
    const g = graph([father, child], [link('父', '子')]);

    expect(birthOrderLabel(g, child)).toBe('長男');
  });
});
