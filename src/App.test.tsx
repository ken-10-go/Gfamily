import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '@/App';
import { AuthProvider } from '@/features/auth/AuthProvider';

const getSession = vi.fn();
const onAuthStateChange = vi.fn();

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({
    auth: {
      getSession,
      onAuthStateChange,
    },
  }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('App', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: null } });
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it('未ログインでトップを開くとログイン画面へ送られる', async () => {
    renderAt('/');

    expect(await screen.findByRole('heading', { name: 'ログイン' })).toBeInTheDocument();
  });

  it('未ログインで家系図を開こうとしてもログイン画面へ送られる', async () => {
    renderAt('/trees/abc');

    expect(await screen.findByRole('heading', { name: 'ログイン' })).toBeInTheDocument();
  });

  it('未知のパスでは404表示になる', async () => {
    renderAt('/unknown');

    expect(
      await screen.findByRole('heading', { name: 'ページが見つかりません' }),
    ).toBeInTheDocument();
  });

  it('招待ページは未ログインでもログイン導線を出す', async () => {
    renderAt('/invite/sometoken');

    expect(await screen.findByRole('heading', { name: '招待を受け取りました' })).toBeInTheDocument();
  });
});
