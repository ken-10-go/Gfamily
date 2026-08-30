import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditPage } from '@/features/history/AuditPage';
import * as api from '@/lib/api';
import type { AuditLog, Person, TreeRole } from '@/types/models';

vi.mock('@/lib/api');

function person(id: string, familyName: string, givenName: string): Person {
  return {
    id,
    familyName,
    givenName,
    familyNameKana: null,
    givenNameKana: null,
    maidenName: null,
    gender: null,
    isLiving: true,
    birthDate: null,
    deathDate: null,
    birthEra: null,
    deathEra: null,
    birthDateUncertain: false,
    deathDateUncertain: false,
    birthPlace: null,
    notes: null,
    nameChanges: [],
    houseIds: [],
    siblingOrder: null,
    generationShift: 0,
    position: null,
    encryptedData: null,
    deletedAt: null,
  } as unknown as Person;
}

function log(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'l1',
    actorId: 'hanako',
    entity: 'persons',
    entityId: 'p1',
    action: 'update',
    createdAt: '2026-03-01T05:20:00.000Z',
    ...overrides,
  };
}

function renderPage(role: TreeRole, logs: AuditLog[], route = '/trees/t1/audit') {
  vi.mocked(api.getMyRole).mockResolvedValue(role);
  vi.mocked(api.listAuditLogs).mockResolvedValue(logs);
  vi.mocked(api.loadTreeGraph).mockResolvedValue({
    persons: [person('p1', '山田', '太郎')],
    parentChild: [],
    unions: [],
  });
  vi.mocked(api.listDeletedPersons).mockResolvedValue([]);
  vi.mocked(api.listMembers).mockResolvedValue([
    { userId: 'hanako', role: 'editor' },
    { userId: 'taro', role: 'owner' },
  ]);
  vi.mocked(api.listNicknames).mockResolvedValue(
    new Map([
      ['hanako', 'はなこ'],
      ['taro', 'たろう'],
    ]),
  );

  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/trees/:treeId/audit" element={<AuditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuditPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('オーナー以外には中身を出さない', async () => {
    renderPage('editor', [log()]);
    expect(await screen.findByText('この画面はオーナーだけが見られます。')).toBeInTheDocument();
    expect(api.listAuditLogs).not.toHaveBeenCalled();
  });

  it('誰が何をしたのかを、名前で読める形にする', async () => {
    renderPage('owner', [log()]);
    expect(await screen.findByText('はなこ さんが 山田 太郎 を編集しました')).toBeInTheDocument();
  });

  it('同じ日の記録は日付の見出しでまとまる', async () => {
    renderPage('owner', [log(), log({ id: 'l2', action: 'insert' })]);
    await screen.findAllByText(/はなこ さんが/);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
  });

  it('メンバーで絞り込める', async () => {
    renderPage('owner', [log(), log({ id: 'l2', actorId: 'taro' })]);
    await screen.findAllByText(/さんが/);
    fireEvent.change(screen.getByLabelText('メンバーで絞り込む'), { target: { value: 'taro' } });
    await waitFor(() =>
      expect(screen.queryByText('はなこ さんが 山田 太郎 を編集しました')).not.toBeInTheDocument(),
    );
  });

  it('URL でメンバーを指定して開ける（メンバー画面からの行き先）', async () => {
    renderPage('owner', [log(), log({ id: 'l2', actorId: 'taro' })], '/trees/t1/audit?member=taro');
    expect(await screen.findByText('たろう さんが 山田 太郎 を編集しました')).toBeInTheDocument();
    expect(screen.queryByText('はなこ さんが 山田 太郎 を編集しました')).not.toBeInTheDocument();
  });

  it('記録が無いときと、その人の記録が無いときで言い方を分ける', async () => {
    renderPage('owner', []);
    expect(await screen.findByText('まだ記録はありません。')).toBeInTheDocument();
  });

  it('絞り込んだ結果が空のときは、その人の記録が無いと伝える', async () => {
    renderPage('owner', [log()], '/trees/t1/audit?member=taro');
    expect(await screen.findByText('この方の記録はありません。')).toBeInTheDocument();
  });
});
