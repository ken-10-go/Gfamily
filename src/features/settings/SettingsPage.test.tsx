import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsPage } from '@/features/settings/SettingsPage';
import * as api from '@/lib/api';
import type { TreeRole } from '@/types/models';

vi.mock('@/lib/api');
const changePassword = vi.fn().mockResolvedValue(undefined);

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'me@example.com', providerData: [{ providerId: 'password' }] },
    signOut: vi.fn(),
    changePassword,
  }),
}));

function renderPage(role: TreeRole) {
  vi.mocked(api.getMyRole).mockResolvedValue(role);
  render(
    <MemoryRouter initialEntries={['/trees/t1/settings']}>
      <Routes>
        <Route path="/trees/:treeId/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getTree).mockResolvedValue({
      id: 't1',
      name: '寺原家',
      description: null,
      createdBy: 'me',
      e2eeSalt: null,
      roles: {},
      memberIds: [],
    });
    vi.mocked(api.updateTree).mockResolvedValue();
  });

  it('オーナーは家系図の名前を変えられる', async () => {
    renderPage('owner');
    await waitFor(() => expect(screen.getByText('家系図の名前')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '変える' }));
    fireEvent.change(screen.getByLabelText('家系図の名前'), { target: { value: '寺原本家' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(api.updateTree).toHaveBeenCalledWith('t1', { name: '寺原本家' }));
  });

  it('編集者には名前を変える手立てを出さない', async () => {
    renderPage('editor');
    await waitFor(() => expect(screen.getByText('設定')).toBeTruthy());

    expect(screen.queryByText('家系図の名前')).toBeNull();
  });

  it('パスワードで使っている人には、変える欄を出す', async () => {
    // ニックネームの人は仮のパスワードを受け取るので、まずここで決め直す
    renderPage('editor');
    await waitFor(() => expect(screen.getByText('パスワード')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('いまのパスワード'), { target: { value: 'temp1234' } });
    fireEvent.change(screen.getByLabelText('新しいパスワード（8文字以上）'), {
      target: { value: 'newpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'パスワードを変える' }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('temp1234', 'newpass123'));
  });

  it('短いパスワードは受け付けない', async () => {
    renderPage('editor');
    await waitFor(() => expect(screen.getByText('パスワード')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('いまのパスワード'), { target: { value: 'temp1234' } });
    fireEvent.change(screen.getByLabelText('新しいパスワード（8文字以上）'), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'パスワードを変える' }));

    expect(await screen.findByText('新しいパスワードは8文字以上にしてください')).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('名前を空にしても保存しない', async () => {
    renderPage('owner');
    await waitFor(() => expect(screen.getByText('家系図の名前')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '変える' }));
    fireEvent.change(screen.getByLabelText('家系図の名前'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: '保存' })).toBeNull());
    expect(api.updateTree).not.toHaveBeenCalled();
  });
});
