import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '@/features/auth/useAuth';
import { nicknameProblem } from '@/lib/nickname';
import * as api from '@/lib/api';
import { ROLE_LABELS, type InvitationPreview } from '@/types/models';

export function AcceptInvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;

    api
      .previewInvitation(token)
      .then(setPreview)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : '招待を確認できませんでした'),
      )
      .finally(() => setLoading(false));
  }, [token, user, authLoading]);

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    try {
      const treeId = await api.acceptInvitation(token);
      navigate(`/trees/${treeId}`, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '招待を受諾できませんでした');
    } finally {
      setAccepting(false);
    }
  }

  if (authLoading) return <p className="page__status">読み込み中…</p>;

  // 招待の確認にもログインが必要。トークンは復帰先URLに残るので、ログイン後にここへ戻る。
  if (!user) return <JoinPanel token={token} />;

  if (loading) return <p className="page__status">招待を確認中…</p>;

  if (!preview) {
    return (
      <main className="page page--narrow">
        <h1>招待が見つかりません</h1>
        <p className="alert alert--error">
          この招待リンクは無効か、有効期限が切れているか、すでに使われています。
        </p>
        <button type="button" className="button" onClick={() => navigate('/')}>
          一覧へ
        </button>
      </main>
    );
  }

  return (
    <main className="page page--narrow">
      <h1>家系図への招待</h1>
      <p>
        <strong>{preview.treeName}</strong> に{ROLE_LABELS[preview.role]}として招待されています。
      </p>
      {preview.requiresEmail && <p className="note">この招待は {preview.requiresEmail} 宛です。</p>}

      {error && <p className="alert alert--error">{error}</p>}

      <button
        type="button"
        className="button button--primary"
        onClick={handleAccept}
        disabled={accepting}
      >
        {accepting ? '処理中…' : '参加する'}
      </button>
    </main>
  );
}

/**
 * 招待リンクから、この場でアプリに入れるようにする。
 *
 * Google アカウントを持っていない家族もいるので、**入り方を選べる**ようにする。
 *   ・Google のアカウントでそのまま入る
 *   ・メールアドレスとパスワードを自分で決めて登録する
 *   ・すでに登録済みならログインする
 *
 * パスワードは Firebase 側に預けるだけで、管理者にも私たちにも見えない
 * （忘れたときは再設定メールで本人が入れ直す）。
 */
function JoinPanel({ token }: { token: string }) {
  const { signInWithGoogle, signInWithEmail, signInWithNickname } = useAuth();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'うまくいきませんでした');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (mode === 'register') {
        if (password.length < 8) throw new Error('パスワードは8文字以上にしてください');
        const problem = nicknameProblem(nickname);
        if (problem) throw new Error(problem);

        /*
         * 登録は Cloud Functions を通す。
         * 誰でもアカウントを作れる状態にはしていないので、
         * 「有効な招待を持っているか」を向こうで確かめてから作ってもらう。
         */
        const email = await api.registerWithInvitation(token, nickname, password);
        await signInWithEmail(email, password);
      } else {
        await signInWithNickname(nickname, password);
      }
      // 入れたら、この画面がそのまま「参加する」に切り替わる（招待の印は URL に残っている）
    });
  }

  return (
    <main className="page page--narrow">
      <h1>家系図への招待</h1>
      <p className="note">
        参加するには、アプリに入る方法を決めてください。 どちらで入っても、見えるものは同じです。
      </p>

      {error && <p className="alert alert--error">{error}</p>}
      {notice && <p className="note">{notice}</p>}

      <button
        type="button"
        className="button button--google"
        disabled={busy}
        onClick={() => void run(signInWithGoogle)}
      >
        Google アカウントで入る
      </button>

      <p className="divider">または</p>

      <div className="tabs" role="tablist">
        {(
          [
            ['register', 'はじめて（登録する）'],
            ['login', '登録済み（ログイン）'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            className={mode === value ? 'tabs__tab tabs__tab--active' : 'tabs__tab'}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field form__wide">
          <span className="field__label">
            {mode === 'register' ? 'ニックネーム（ログインに使う名前）' : 'ニックネーム'}
          </span>
          <input
            type="text"
            value={nickname}
            autoComplete="username"
            required
            placeholder="例: たろう"
            onChange={(event) => setNickname(event.target.value)}
          />
        </label>

        <label className="field form__wide">
          <span className="field__label">
            パスワード{mode === 'register' ? '（8文字以上）' : ''}
          </span>
          <input
            type="password"
            value={password}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <div className="form__actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {mode === 'register' ? '登録して参加へ進む' : 'ログイン'}
          </button>
          {mode === 'login' && (
            <span className="note">
              パスワードを忘れたときは、招待してくれた方に仮のパスワードを出してもらってください。
            </span>
          )}
        </div>
      </form>

      <p className="note">
        招待リンクには期限があります。切れていたら、送ってくれた方に新しいリンクを頼んでください。
      </p>
    </main>
  );
}
