import { describe, expect, it } from 'vitest';

import {
  placeholderTarget,
  spousePlaceholderId,
  withSpousePlaceholders,
} from '@/features/tree-view/placeholders';
import {
  EMPTY_PERSON,
  type ParentChild,
  type Person,
  type TreeGraph,
  type Union,
} from '@/types/models';

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    ...EMPTY_PERSON,
    id,
    familyName: '山田',
    givenName: id,
    gender: 'male',
    ...overrides,
  };
}

const link = (parentId: string, childId: string): ParentChild => ({
  id: `${parentId}>${childId}`,
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

const ids = (graph: TreeGraph) => graph.persons.map((p) => p.id);

describe('withSpousePlaceholders', () => {
  it('配偶者のいない人に空カードを1枚足す', () => {
    const graph: TreeGraph = {
      persons: [person('父'), person('子')],
      parentChild: [link('父', '子')],
      unions: [],
    };

    const result = withSpousePlaceholders(graph);

    expect(ids(result)).toContain(spousePlaceholderId('父'));
    expect(ids(result)).toContain(spousePlaceholderId('子'));
    // 枠と本人は夫婦としてつなぎ、隣に並ぶようにする
    expect(result.unions).toHaveLength(2);
  });

  it('配偶者が登録済みの人には出さない', () => {
    const graph: TreeGraph = {
      persons: [person('父'), person('母', { gender: 'female' }), person('子')],
      parentChild: [link('父', '子'), link('母', '子')],
      unions: [union('父', '母')],
    };

    const result = withSpousePlaceholders(graph);

    expect(ids(result)).not.toContain(spousePlaceholderId('父'));
    expect(ids(result)).not.toContain(spousePlaceholderId('母'));
    expect(ids(result)).toContain(spousePlaceholderId('子'));
  });

  it('親子のつながりが無い人には出さない（枠だけが並ぶのを防ぐ）', () => {
    const graph: TreeGraph = {
      persons: [person('ひとり')],
      parentChild: [],
      unions: [],
    };

    expect(withSpousePlaceholders(graph)).toBe(graph);
  });

  it('枠の性別は相手と逆にする', () => {
    const graph: TreeGraph = {
      persons: [person('父', { gender: 'male' }), person('子')],
      parentChild: [link('父', '子')],
      unions: [],
    };

    const placeholder = withSpousePlaceholders(graph).persons.find(
      (p) => p.id === spousePlaceholderId('父'),
    );
    expect(placeholder?.gender).toBe('female');
  });

  it('入力の家系図を書き換えない', () => {
    const graph: TreeGraph = {
      persons: [person('父'), person('子')],
      parentChild: [link('父', '子')],
      unions: [],
    };
    const before = JSON.stringify(graph);

    withSpousePlaceholders(graph);
    expect(JSON.stringify(graph)).toBe(before);
  });
});

describe('placeholderTarget', () => {
  it('空カードなら相手の人物IDを返す', () => {
    expect(placeholderTarget(spousePlaceholderId('abc'))).toBe('abc');
  });

  it('実在の人物なら null', () => {
    expect(placeholderTarget('abc')).toBeNull();
  });
});
