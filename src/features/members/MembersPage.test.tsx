import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MembersPage } from '@/features/members/MembersPage';
import * as api from '@/lib/api';
import type { Invitation, TreeRole } from '@/types/models';

vi.mock('@/lib/api');

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'me', email: 'me@example.com' },
    sendPasswordReset: vi.fn(),
  }),
}));

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'inv-1',
    email: null,
    role: 'viewer',
    shared: true,
    token: 'abc123',
    acceptedCount: 1,
    acceptedUids: ['hanako'],
    label: null,
    expiresAt: TOMORROW,
    revokedAt: null,
    acceptedAt: null,
    acceptedBy: null,
    createdAt: null,
    ...overrides,
  };
}

function renderPage(role: TreeRole, invitations: Invitation[]) {
  vi.mocked(api.getMyRole).mockResolvedValue(role);
  vi.mocked(api.listMembers).mockResolvedValue([
    { userId: 'me', role: 'owner' },
    { userId: 'hanako', role: 'viewer' },
  ]);
  vi.mocked(api.listNicknames).mockResolvedValue(
    new Map([
      ['me', 'たろう'],
      ['hanako', 'はなこ'],
    ]),
  );
  vi.mocked(api.listMemberAccounts).mockResolvedValue([]);
  vi.mocked(api.listInvitations).mockResolvedValue(invitations);
  vi.mocked(api.revokeInvitation).mockResolvedValue();

  render(
    <MemoryRouter initialEntries={['/trees/t1/members']}>
      <Routes>
        <Route path="/trees/:treeId/members" element={<MembersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MembersPage の招待一覧', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('有効な共通リンクは、あとからでも URL を確かめられる', async () => {
    renderPage('owner', [invitation()]);
    expect(await screen.findByText(/invite\/abc123$/)).toBeInTheDocument();
  });

  it('取り消した招待の URL は出さない', async () => {
    renderPage('owner', [invitation({ token: null, revokedAt: new Date().toISOString() })]);
    await screen.findByText('取り消し済み');
    expect(screen.queryByText(/invite\//)).not.toBeInTheDocument();
  });

  it('期限が切れた共通リンクの URL は出さない', async () => {
    renderPage('owner', [invitation({ expiresAt: '2020-01-01T00:00:00.000Z' })]);
    await screen.findByText(/期限切れ/);
    expect(screen.queryByText(/invite\//)).not.toBeInTheDocument();
  });

  it('共通リンクは使われた人数が分かる', async () => {
    renderPage('owner', [invitation({ acceptedCount: 2 })]);
    expect(await screen.findByText(/2人が使用/)).toBeInTheDocument();
  });

  it('そのリンクから入った人を呼び名で出す', async () => {
    renderPage('owner', [invitation()]);
    const rows = await screen.findAllByRole('listitem');
    const inviteRow = rows.find((row) => row.textContent?.includes('invite/abc123'));
    expect(inviteRow?.textContent).toContain('はなこ');
  });

  it('メンバーが、どのリンクから入ったのか分かる', async () => {
    renderPage('owner', [invitation({ label: '叔父さん一家へ' })]);
    const found = await screen.findAllByText('叔父さん一家へ');
    // メンバーの行（呼び名のすぐ下）にも出ていること
    expect(found.some((node) => node.closest('.member-list__item'))).toBe(true);
  });

  it('オーナー以外には、ログイン名も参加のきっかけも出さない', async () => {
    renderPage('editor', []);
    await screen.findByText('はなこ');
    expect(screen.queryByText(/共通リンク/)).not.toBeInTheDocument();
    expect(api.listMemberAccounts).not.toHaveBeenCalled();
  });

  it('覚え書きの無い共通リンクは、発行日で見分けられる', async () => {
    renderPage('owner', [invitation({ createdAt: '2026-03-01T00:00:00.000Z' })]);
    expect(await screen.findByText(/2026\/3\/1発行の共通リンク/)).toBeInTheDocument();
  });

  it('確認したうえで取り消せる', async () => {
    renderPage('owner', [invitation()]);
    fireEvent.click(await screen.findByRole('button', { name: '取り消す' }));
    await waitFor(() => expect(api.revokeInvitation).toHaveBeenCalledWith('t1', 'inv-1'));
  });

  it('オーナー以外には招待の一覧を出さない', async () => {
    renderPage('editor', []);
    await screen.findByText('メンバーと招待');
    expect(screen.queryByText('発行済みの招待')).not.toBeInTheDocument();
    expect(api.listInvitations).not.toHaveBeenCalled();
  });
});
