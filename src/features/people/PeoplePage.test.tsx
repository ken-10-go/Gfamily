import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PeoplePage } from '@/features/people/PeoplePage';
import * as api from '@/lib/api';
import { EMPTY_PERSON, type Person, type TreeGraph } from '@/types/models';

vi.mock('@/lib/api');

const person = (id: string, familyName: string, givenName: string, kana: string): Person => ({
  ...EMPTY_PERSON,
  id,
  familyName,
  givenName,
  familyNameKana: kana,
  birthDate: '1950',
});

const graph: TreeGraph = {
  persons: [
    person('p1', '寺原', 'サツエ', 'てらばら'),
    person('p2', '後藤', '敏行', 'ごとう'),
    { ...person('p3', '後藤', '順子', 'ごとう'), deletedAt: '2020-01-01' },
  ],
  parentChild: [],
  unions: [],
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/trees/t1/people']}>
      <Routes>
        <Route path="/trees/:treeId/people" element={<PeoplePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PeoplePage', () => {
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
    vi.mocked(api.loadTreeGraph).mockResolvedValue(graph);
  });

  it('削除した人を除いて並べ、家系図の画面へつなぐ', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('寺原 サツエ')).toBeTruthy());
    expect(screen.queryByText('後藤 順子')).toBeNull();
    expect(screen.getByText('2人')).toBeTruthy();

    const link = screen.getByRole('link', { name: /寺原 サツエ/ }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/trees/t1?person=p1');
  });

  it('ふりがなでも探せる', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('寺原 サツエ')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('人物を探す'), { target: { value: 'ごとう' } });

    expect(screen.getByText('後藤 敏行')).toBeTruthy();
    expect(screen.queryByText('寺原 サツエ')).toBeNull();
  });
});
