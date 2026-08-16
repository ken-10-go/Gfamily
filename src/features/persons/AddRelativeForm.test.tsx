import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AddRelativeForm } from '@/features/persons/AddRelativeForm';
import { EMPTY_PERSON, type Person, type TreeGraph } from '@/types/models';

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    ...EMPTY_PERSON,
    id,
    familyName: '後藤',
    givenName: id,
    familyNameKana: 'ごとう',
    gender: 'male',
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

  it('親子の追加では、実子か縁組かを選べる', () => {
    renderFor(person('健一'), 'child');
    expect((screen.getByLabelText('親子の種別') as HTMLSelectElement).value).toBe('biological');

    renderFor(person('健一'), 'parent');
    expect(screen.getByLabelText('この人から見た続柄（実親・養親など）')).toBeTruthy();
  });

  it('配偶者の追加では親子の種別を聞かない', () => {
    renderFor(person('健一'), 'spouse');
    expect(screen.queryByLabelText('親子の種別')).toBeNull();
  });

  it('配偶者はもう一方と逆の性別を初期選択にする', () => {
    renderFor(person('健一', { gender: 'male' }), 'spouse');

    expect((screen.getByLabelText('性別') as HTMLSelectElement).value).toBe('female');
  });
});
