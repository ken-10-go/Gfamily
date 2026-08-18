import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PersonForm } from '@/features/persons/PersonForm';
import { EMPTY_PERSON, type Person } from '@/types/models';

function person(overrides: Partial<Person> = {}): Person {
  return { ...EMPTY_PERSON, id: '本人', familyName: '後藤', givenName: '健一', ...overrides };
}

function renderForm(props: Partial<Parameters<typeof PersonForm>[0]> = {}) {
  return render(<PersonForm submitLabel="保存" onSubmit={vi.fn()} onCancel={vi.fn()} {...props} />);
}

const tab = (name: string) => screen.getByRole('tab', { name });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const radio = (label: string) => screen.getByRole('radio', { name: label }) as HTMLInputElement;

describe('PersonForm', () => {
  it('基本情報のタブから始まり、文化的補足の欄は隠れている', () => {
    renderForm();

    expect(tab('基本情報').getAttribute('aria-selected')).toBe('true');
    expect(field('姓')).toBeVisible();
    expect(field('出生地')).not.toBeVisible();
  });

  it('タブを行き来しても入力した値は消えない', () => {
    renderForm();

    fireEvent.change(field('姓'), { target: { value: '後藤' } });
    fireEvent.click(tab('文化的補足'));
    fireEvent.change(field('出生地'), { target: { value: '北海道' } });
    fireEvent.click(tab('基本情報'));

    expect(field('姓').value).toBe('後藤');
    // 隠れているだけで、値は DOM に残っている
    expect(field('出生地').value).toBe('北海道');
  });

  it('姓も名も空で保存すると、基本情報のタブへ戻して知らせる', async () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });

    fireEvent.click(tab('文化的補足'));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(screen.getByText('姓か名のどちらかは入力してください')).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(tab('基本情報').getAttribute('aria-selected')).toBe('true');
  });

  it('旧姓は基本情報の側に置く（氏名と一緒に埋めるものなので）', () => {
    renderForm();

    expect(field('旧姓')).toBeVisible();
  });

  it('機微な情報の欄は出さない', () => {
    renderForm({ initial: person() });

    for (const label of ['本籍地', '現住所', '戒名・法名・法号']) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it('機微な情報を持つ人物を保存しても、暗号文はそのまま残す', async () => {
    const encryptedData = { iv: 'AAA', tag: 'BBB', ciphertext: 'CCC' };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ initial: person({ encryptedData }), onSubmit });

    fireEvent.change(field('名'), { target: { value: '健二' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ givenName: '健二', encryptedData });
  });

  it('性別はラジオで選ぶ', () => {
    renderForm({ initial: person({ gender: 'male' }) });

    expect(radio('男性').checked).toBe(true);

    fireEvent.click(radio('女性'));
    expect(radio('女性').checked).toBe(true);
    expect(radio('男性').checked).toBe(false);
  });

  it('まだ登録していない家も、そのまま選べる', () => {
    // 「家の管理で先に固定してから選ぶ」の二段構えは手間が大きすぎて使えない
    renderForm({
      initial: person(),
      autoHouseName: '寺原家',
      houses: [{ id: 'auto-key', name: '寺原家', registered: false }],
    });

    fireEvent.click(tab('文化的補足'));
    expect(screen.getByText('属する家')).toBeTruthy();

    const choice = screen.getByRole('checkbox', { name: /寺原家/ }) as HTMLInputElement;
    fireEvent.click(choice);
    expect(choice.checked).toBe(true);
  });

  it('選んだ家は保存の内容に入る（登録は保存する側が行う）', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({
      initial: person(),
      onSubmit,
      houses: [{ id: 'auto-key', name: '寺原家', registered: false }],
    });

    fireEvent.click(tab('文化的補足'));
    fireEvent.click(screen.getByRole('checkbox', { name: /寺原家/ }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].houseIds).toEqual(['auto-key']);
  });

  it('登録された家があれば、複数選べて先頭が主になる', () => {
    renderForm({
      initial: person(),
      houses: [
        { id: 'h1', name: '寺原家', registered: true },
        { id: 'h2', name: '後藤家', registered: true },
      ],
    });

    fireEvent.click(tab('文化的補足'));
    fireEvent.click(screen.getByRole('checkbox', { name: /後藤家/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /寺原家/ }));

    // 先に選んだ後藤家が主（先頭）
    expect(screen.getByRole('checkbox', { name: /後藤家/ }).parentElement?.textContent).toContain(
      '主',
    );
  });

  it('削除ボタンは、削除の手立てを渡されたときだけ出す', () => {
    const { unmount } = renderForm({ initial: person(), onDelete: vi.fn() });
    expect(screen.getByRole('button', { name: /この人物を削除する/ })).toBeTruthy();
    unmount();

    renderForm({ initial: person() });
    expect(screen.queryByRole('button', { name: /この人物を削除する/ })).toBeNull();
  });
});
