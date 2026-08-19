import { describe, expect, it } from 'vitest';

import { buildImportPlan, summarize } from '@/lib/importPlan';
import type { ImportData } from '@/lib/suisui';
import {
  EMPTY_PERSON,
  EMPTY_PERSON_INPUT,
  type Person,
  type PersonInput,
  type TreeGraph,
} from '@/types/models';

const person = (id: string, familyName: string, givenName: string): Person => ({
  ...EMPTY_PERSON,
  id,
  familyName,
  givenName,
});

const input = (familyName: string | null, givenName: string | null): PersonInput => ({
  ...EMPTY_PERSON_INPUT,
  familyName,
  givenName,
});

/** すでに「見本 太郎」と「見本 花子」がいて、2人は夫婦。 */
const graph: TreeGraph = {
  persons: [person('p1', '見本', '太郎'), person('p2', '見本', '花子')],
  parentChild: [],
  unions: [
    {
      id: 'u1',
      partner1Id: 'p1',
      partner2Id: 'p2',
      status: 'married',
      startDate: null,
      endDate: null,
      deletedAt: null,
    },
  ],
};

/** 書き出し側には、その2人に加えて子（次郎）がいる。 */
const data: ImportData = {
  persons: [
    { sourceId: '100', input: input('見本', '太郎') },
    { sourceId: '200', input: input('見本', '花子') },
    { sourceId: '300', input: input('見本', '次郎') },
  ],
  unions: [
    {
      sourceId: '900',
      partner1SourceId: '100',
      partner2SourceId: '200',
      childSourceIds: ['300'],
    },
  ],
  unknownEras: [],
};

describe('buildImportPlan', () => {
  const plan = buildImportPlan(graph, data);

  it('すでにいる人は、名前で突き合わせて増やさない', () => {
    expect(plan.persons.map((p) => p.existingId)).toEqual(['p1', 'p2', null]);
  });

  it('姓名の間の空白は無視して突き合わせる', () => {
    const spaced = buildImportPlan(graph, {
      ...data,
      persons: [{ sourceId: '100', input: input('見本 ', ' 太郎') }],
      unions: [],
    });

    expect(spaced.persons[0].existingId).toBe('p1');
  });

  it('名前の無い人は、突き合わせようがないので新しく作る', () => {
    const nameless = buildImportPlan(graph, {
      ...data,
      persons: [{ sourceId: '400', input: input(null, null) }],
      unions: [],
    });

    expect(nameless.persons[0].existingId).toBeNull();
  });

  it('すでにある夫婦の線は、二重に引かない', () => {
    expect(plan.unions[0].exists).toBe(true);
  });

  it('親子の線は、両方の親から1本ずつ引く', () => {
    expect(plan.links).toHaveLength(2);
    expect(plan.links.every((link) => !link.exists)).toBe(true);
  });
});

describe('summarize', () => {
  const plan = buildImportPlan(graph, data);

  it('増える人と線の数を出す', () => {
    const { added, matched, unions, links } = summarize(plan);

    expect(added.map((p) => p.input.givenName)).toEqual(['次郎']);
    expect(matched).toHaveLength(2);
    expect(unions).toHaveLength(0); // すでにある夫婦
    expect(links).toHaveLength(2);
  });

  it('取り込まない人を外すと、その人につながる線も引かない', () => {
    const { added, links } = summarize(plan, new Set(['300']));

    expect(added).toHaveLength(0);
    expect(links).toHaveLength(0);
  });
});
