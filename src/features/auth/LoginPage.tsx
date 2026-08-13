import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '@/features/auth/useAuth';
import { isFirebaseConfigured } from '@/lib/firebase';

type Mode = 'password' | 'magic-link';

export function LoginPage() {
  const { user, signInWithPassword, sendMagicLink } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      if (mode === 'password') {
        await signInWithPassword(email, password);
      } else {
        await sendMagicLink(email);
        setNotice('ログインリンクを送信しました。メールをご確認ください。');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ログインに失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page page--narrow">
      <h1>ログイン</h1>

      {!isFirebaseConfigured && (
        <p className="alert alert--error">
          Firebase の環境変数が設定されていません。<code>.env</code> を作成してから再読み込みしてください。
        </p>
      )}

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'password'}
          className={mode === 'password' ? 'tabs__tab tabs__tab--active' : 'tabs__tab'}
          onClick={() => setMode('password')}
        >
          パスワード
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'magic-link'}
          className={mode === 'magic-link' ? 'tabs__tab tabs__tab--active' : 'tabs__tab'}
          onClick={() => setMode('magic-link')}
        >
          ログインリンク
        </button>
      </div>

      <form onSubmit={handleSubmit} className="form">
        <label className="field">
          <span className="field__label">メールアドレス</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </label>

        {mode === 'password' && (
          <label className="field">
            <span className="field__label">パスワード</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        )}

        {error && <p className="alert alert--error">{error}</p>}
        {notice && <p className="alert alert--success">{notice}</p>}

        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? '処理中…' : mode === 'password' ? 'ログイン' : 'ログインリンクを送る'}
        </button>
      </form>

      <p className="note">
        このアプリは招待制です。アカウントをお持ちでない場合は、管理者に招待を依頼してください。
      </p>
    </main>
  );
}
