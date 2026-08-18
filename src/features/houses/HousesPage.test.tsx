import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HousesPage } from '@/features/houses/HousesPage';
import * as api from '@/lib/api';
import { EMPTY_PERSON, type Person, type TreeGraph } from '@/types/models';

vi.mock('@/lib/api');

const person = (id: string, familyName: string): Person => ({
  ...EMPTY_PERSON,
  id,
  givenName: id,
  familyName,
});

const graph: TreeGraph = {
  persons: [person('サツエ', '寺原'), person('順子', '寺原')],
  parentChild: [
    { id: 'a', parentId: 'サツエ', childId: '順子', kind: 'biological', deletedAt: null },
  ],
  unions: [],
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/trees/t1/houses']}>
      <Routes>
        <Route path="/trees/:treeId/houses" element={<HousesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HousesPage', () => {
  beforeEach(() => {
    // 呼び出しの記録と window.prompt の差し替えを毎回まっさらにする
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.mocked(api.getTree).mockResolvedValue({
      id: 't1',
      name: '寺原家',
      description: null,
      createdBy: 'me',
      e2eeSalt: null,
      roles: {},
      memberIds: [],
    });
    vi.mocked(api.getMyRole).mockResolvedValue('owner');
    vi.mocked(api.loadTreeGraph).mockResolvedValue(graph);
    vi.mocked(api.listHouses).mockResolvedValue([]);
    vi.mocked(api.createHouse).mockResolvedValue('h1');
    vi.mocked(api.setPersonHouses).mockResolvedValue();
  });

  it('家をまだ登録していなくても、人物の所属を決められる', async () => {
    renderPage();

    // 「先に固定してから選ぶ」の二段構えだと、ここが空で行き止まりになっていた
    await waitFor(() => expect(screen.getByText('人物の所属')).toBeTruthy());
    expect(screen.getAllByRole('checkbox', { name: /寺原家/ }).length).toBeGreaterThan(0);
  });

  it('自動判定に無い家を、名前だけ決めて作れる', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('後藤家（分家）');
    renderPage();

    await waitFor(() => expect(screen.getByText('いまの家')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '家を追加' }));

    await waitFor(() => expect(api.createHouse).toHaveBeenCalledWith('t1', '後藤家（分家）'));
  });

  it('閲覧のみでも、節ごと消さずに理由を出す', async () => {
    vi.mocked(api.getMyRole).mockResolvedValue('viewer');
    renderPage();

    await waitFor(() => expect(screen.getByText('人物の所属')).toBeTruthy());
    expect(screen.getByText(/所属の変更は編集者以上が行えます/)).toBeTruthy();
    expect(screen.getAllByRole('checkbox')[0].hasAttribute('disabled')).toBe(true);
  });

  it('未登録の家を選ぶと、その場で登録して所属させる', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('人物の所属')).toBeTruthy());

    fireEvent.click(screen.getAllByRole('checkbox', { name: /寺原家/ })[0]);

    await waitFor(() => expect(api.createHouse).toHaveBeenCalled());
    expect(vi.mocked(api.createHouse).mock.calls[0][1]).toBe('寺原家');
  });
});
