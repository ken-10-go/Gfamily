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

  it('未登録の家を選ぶと、その場で登録して所属させる', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('人物の所属')).toBeTruthy());

    fireEvent.click(screen.getAllByRole('checkbox', { name: /寺原家/ })[0]);

    await waitFor(() => expect(api.createHouse).toHaveBeenCalled());
    expect(vi.mocked(api.createHouse).mock.calls[0][1]).toBe('寺原家');
  });
});
