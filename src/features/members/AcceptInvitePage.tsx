import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '@/features/auth/useAuth';
import * as api from '@/lib/api';
import { ROLE_LABELS, type InvitationPreview } from '@/types/models';

export function AcceptInvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (authLoading || !session) return;

    api
      .previewInvitation(token)
      .then(setPreview)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : '招待を確認できませんでした'),
      )
      .finally(() => setLoading(false));
  }, [token, session, authLoading]);

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
  if (!session) {
    return (
      <main className="page page--narrow">
        <h1>招待を受け取りました</h1>
        <p>受諾するにはログインが必要です。</p>
        <button
          type="button"
          className="button button--primary"
          onClick={() => navigate('/login', { state: { from: `/invite/${token}` } })}
        >
          ログインへ進む
        </button>
      </main>
    );
  }

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
        <strong>{preview.tree_name}</strong> に{ROLE_LABELS[preview.role]}として招待されています。
      </p>
      {preview.requires_email && (
        <p className="note">この招待は {preview.requires_email} 宛です。</p>
      )}

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
