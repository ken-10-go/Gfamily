import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AddRelativeForm } from '@/features/persons/AddRelativeForm';
import type { Person, TreeGraph } from '@/types/models';

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    familyName: '後藤',
    givenName: id,
    familyNameKana: 'ごとう',
    givenNameKana: null,
    maidenName: null,
    gender: 'male',
    birthDate: null,
    deathDate: null,
    birthPlace: null,
    note: null,
    isLiving: true,
    birthOrder: null,
    siblingOrder: null,
    position: null,
    surnameHistory: [],
    deletedAt: null,
    ...overrides,
  };
}

const graph = (persons: Person[]): TreeGraph => ({ persons, parentChild: [], unions: [] });

function renderFor(base: Person, relation: 'parent' | 'spouse' | 'child' = 'child') {
  render(
    <AddRelativeForm
      graph={graph([base])}
      person={base}
      relation={relation}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('AddRelativeForm', () => {
  it('姓とせいのふりがなを引き継いで初期入力にする', () => {
    renderFor(person('健一'));

    expect(field('姓').value).toBe('後藤');
    expect(field('せい（ふりがな）').value).toBe('ごとう');
  });

  it('引き継ぐ元にふりがなが無ければ空のまま', () => {
    renderFor(person('健一', { familyNameKana: null }));

    expect(field('姓').value).toBe('後藤');
    expect(field('せい（ふりがな）').value).toBe('');
  });

  it('配偶者はもう一方と逆の性別を初期選択にする', () => {
    renderFor(person('健一', { gender: 'male' }), 'spouse');

    expect((screen.getByLabelText('性別') as HTMLSelectElement).value).toBe('female');
  });
});
