import { describe, expect, it } from 'vitest';

import {
  ancestorsOf,
  birthOrderLabel,
  compareForDisplay,
  connectionProblem,
  deriveBirthOrder,
  siblingsOf,
  wouldCreateCycle,
} from '@/lib/relations';
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
    siblingOrder: null,
    position: null,
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

describe('接続の検査', () => {
  const father = person('父', 'male', '1930-01-01');
  const child = person('子', 'male', '1960-01-01');
  const grandchild = person('孫', 'male', '1990-01-01');
  const outsider = person('他人', 'female', '1962-01-01');

  const family = graph(
    [father, child, grandchild, outsider],
    [link('父', '子'), link('子', '孫')],
  );

  it('先祖をすべて集める', () => {
    expect([...ancestorsOf(family, '孫')].sort()).toEqual(['子', '父']);
    expect([...ancestorsOf(family, '父')]).toEqual([]);
  });

  it('自分の先祖を自分の子にしようとすると循環になる', () => {
    // 孫の子として父をつなぐと、父→子→孫→父 と巡ってしまう
    expect(wouldCreateCycle(family, '孫', '父')).toBe(true);
    expect(wouldCreateCycle(family, '孫', '子')).toBe(true);
  });

  it('自分自身は循環とみなす', () => {
    expect(wouldCreateCycle(family, '子', '子')).toBe(true);
  });

  it('関係のない人物とは循環しない', () => {
    expect(wouldCreateCycle(family, '子', '他人')).toBe(false);
  });

  it('循環したデータを渡しても止まる', () => {
    const looped = graph(
      [person('a', 'male', null), person('b', 'male', null)],
      [link('a', 'b'), link('b', 'a')],
    );

    expect([...ancestorsOf(looped, 'a')].sort()).toEqual(['a', 'b']);
  });

  it('つなげない理由を返す', () => {
    expect(connectionProblem(family, '子', '子', 'parent')).toContain('自分自身');
    expect(connectionProblem(family, '子', '父', 'parent')).toContain('すでに親子');
    expect(connectionProblem(family, '父', '孫', 'parent')).toContain('先祖と子孫');
    expect(connectionProblem(family, '子', '他人', 'parent')).toBeNull();
  });

  it('配偶者の重複を弾く', () => {
    const married = {
      ...family,
      unions: [
        {
          id: 'u1',
          partner1Id: '子',
          partner2Id: '他人',
          status: 'married' as const,
          startDate: null,
          endDate: null,
          deletedAt: null,
        },
      ],
    };

    expect(connectionProblem(married, '子', '他人', 'spouse')).toContain('すでに配偶者');
    expect(connectionProblem(married, '他人', '子', 'spouse')).toContain('すでに配偶者');
    expect(connectionProblem(married, '子', '孫', 'spouse')).toBeNull();
  });

  it('削除済みの関係は無かったものとして扱う', () => {
    const removed = graph(
      [father, child],
      [{ ...link('父', '子'), deletedAt: '2026-01-01T00:00:00Z' }],
    );

    expect(connectionProblem(removed, '子', '父', 'parent')).toBeNull();
  });
});

describe('compareForDisplay', () => {
  const withOrder = (id: string, birthDate: string | null, siblingOrder: number | null) => ({
    ...person(id, 'male', birthDate),
    siblingOrder,
  });

  it('手動で並べ替えた順を生年より優先する', () => {
    const elder = withOrder('兄', '1960-01-01', 1);
    const younger = withOrder('弟', '1965-01-01', 0);

    expect([elder, younger].sort(compareForDisplay).map((p) => p.id)).toEqual(['弟', '兄']);
  });

  it('手動指定のある人物を、指定の無い人物より前に置く', () => {
    const ordered = withOrder('指定あり', '1970-01-01', 0);
    const auto = withOrder('指定なし', '1960-01-01', null);

    expect([auto, ordered].sort(compareForDisplay).map((p) => p.id)).toEqual(['指定あり', '指定なし']);
  });

  it('手動指定が無ければ生年順にする', () => {
    const elder = withOrder('兄', '1960-01-01', null);
    const younger = withOrder('弟', '1965-01-01', null);

    expect([younger, elder].sort(compareForDisplay).map((p) => p.id)).toEqual(['兄', '弟']);
  });

  it('同じ並び順の指定なら生年で決める', () => {
    const elder = withOrder('兄', '1960-01-01', 3);
    const younger = withOrder('弟', '1965-01-01', 3);

    expect([younger, elder].sort(compareForDisplay).map((p) => p.id)).toEqual(['兄', '弟']);
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

  it('画面上で並べ替えても続柄は生まれた順のまま変わらない', () => {
    // ドラッグで弟を左に持ってきても、弟が長男になってはいけない
    const father = person('父', 'male', '1930-01-01');
    const elder = { ...person('兄', 'male', '1960-01-01'), siblingOrder: 1 };
    const younger = { ...person('弟', 'male', '1965-01-01'), siblingOrder: 0 };
    const g = graph([father, elder, younger], [link('父', '兄'), link('父', '弟')]);

    expect(birthOrderLabel(g, elder)).toBe('長男');
    expect(birthOrderLabel(g, younger)).toBe('次男');
  });
});
