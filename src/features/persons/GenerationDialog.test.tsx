import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GenerationDialog } from '@/features/persons/GenerationDialog';
import { EMPTY_PERSON, type Person } from '@/types/models';

const person = (overrides: Partial<Person> = {}): Person => ({
  ...EMPTY_PERSON,
  id: 'p1',
  familyName: '井川',
  givenName: '達郎',
  ...overrides,
});

describe('GenerationDialog', () => {
  it('いま何段目かを出し、入れた番号をそのまま渡す', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <GenerationDialog person={person()} current={2} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    expect(screen.getByText(/いま 2 段目/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('移したい段'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'この段へ移す' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(1));
  });

  it('ずらしているときは、そのぶんと「自動に戻す」を出す', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <GenerationDialog
        person={person({ generationShift: 3 })}
        current={5}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/自動から \+3 段ずらしています/)).toBeTruthy();

    // 自動に戻すと、ずらした 3 段ぶん戻った段を指定することになる
    fireEvent.click(screen.getByRole('button', { name: '自動に戻す' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(2));
  });

  it('負の段は受け付けない', () => {
    render(
      <GenerationDialog person={person()} current={0} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('移したい段'), { target: { value: '-1' } });
    expect(screen.getByRole('button', { name: 'この段へ移す' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
