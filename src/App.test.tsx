import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '@/App';
import { AuthProvider } from '@/features/auth/AuthProvider';

vi.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: true,
  getFirebaseAuth: () => ({}),
  getDb: () => ({}),
  getFns: () => ({}),
}));

const { onAuthStateChanged, isSignInWithEmailLink } = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  isSignInWithEmailLink: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged,
  isSignInWithEmailLink,
  signInWithEmailLink: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: class { setCustomParameters() {} },
  sendSignInLinkToEmail: vi.fn(),
  signOut: vi.fn(),
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
    isSignInWithEmailLink.mockReturnValue(false);
    // 未ログイン状態を通知して購読解除関数を返す
    onAuthStateChanged.mockImplementation((_auth: unknown, callback: (user: null) => void) => {
      callback(null);
      return vi.fn();
    });
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
