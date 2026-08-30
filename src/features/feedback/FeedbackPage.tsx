import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '@/features/auth/useAuth';
import * as api from '@/lib/api';
import {
  FEEDBACK_STATUS_LABELS,
  type Feedback,
  type FeedbackStatus,
  type TreeRole,
} from '@/types/models';

/**
 * ご意見・不具合の窓口。
 *
 * 入口は本文の欄ひとつだけにしてある。送る前に「不具合か要望か」を選ばせると
 * そこで手が止まるし、読めば分かる。版と端末の目印は裏で添える。
 *
 * 投稿は家族みんなが読める。同じことが何度も届きにくく、
 * 出した側からも「見られている」ことが分かるため。
 */
export function FeedbackPage() {
  const { treeId = '' } = useParams();
  const { user } = useAuth();
  const [items, setItems] = useState<Feedback[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [role, setRole] = useState<TreeRole | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  /** 片付いたものは畳んでおく。未対応が埋もれないように */
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [list, myRole] = await Promise.all([api.listFeedback(treeId), api.getMyRole(treeId)]);
      setItems(list);
      setRole(myRole);
      setNames(await api.listNicknames(list.map((entry) => entry.createdBy)));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await api.createFeedback(treeId, body);
      setBody('');
      setSent(true);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '送れませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(id: string, status: FeedbackStatus) {
    try {
      await api.updateFeedback(treeId, id, { status });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '状態を変えられませんでした');
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('この投稿を消しますか？')) return;
    try {
      await api.deleteFeedback(treeId, id);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '消せませんでした');
    }
  }

  if (loading) return <p className="page__status">読み込み中…</p>;

  const isOwner = role === 'owner';
  const open = items.filter((entry) => entry.status !== 'done');
  const done = items.filter((entry) => entry.status === 'done');

  const nameOf = (uid: string) => names.get(uid) ?? '（名前未設定）';

  function card(entry: Feedback) {
    return (
      <li key={entry.id} className="feedback__item">
        <p className="feedback__meta">
          <span className={`badge badge--${entry.status}`}>
            {FEEDBACK_STATUS_LABELS[entry.status]}
          </span>
          <span className="note">
            {nameOf(entry.createdBy)}
            {entry.createdAt && `・${new Date(entry.createdAt).toLocaleDateString('ja-JP')}`}
          </span>
        </p>
        <p className="feedback__body">{entry.body}</p>
        {entry.reply && <p className="feedback__reply">↳ {entry.reply}</p>}
        <div className="card-list__actions">
          {isOwner && (
            <select
              value={entry.status}
              aria-label="対応の状況"
              onChange={(event) => handleStatus(entry.id, event.target.value as FeedbackStatus)}
            >
              {(Object.keys(FEEDBACK_STATUS_LABELS) as FeedbackStatus[]).map((value) => (
                <option key={value} value={value}>
                  {FEEDBACK_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          )}
          {(isOwner || entry.createdBy === user?.uid) && (
            <button
              type="button"
              className="button button--danger"
              onClick={() => handleDelete(entry.id)}
            >
              消す
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <main className="page">
      <p>
        <Link to={`/trees/${treeId}/settings`}>← 設定へ戻る</Link>
      </p>
      <h1>ご意見・不具合</h1>

      {error && <p className="alert alert--error">{error}</p>}

      {/* 送る前に読めるようにする。知っていれば困らなかった、が多いため */}
      <p className="note">
        段の動かし方や家のまとめ方など、分かりにくいところは
        <Link to={`/trees/${treeId}/guide`}>使い方ガイド</Link> にまとめてあります。
      </p>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field field--grow">
          <span className="field__label">気づいたことを書いてください</span>
          <textarea
            rows={4}
            maxLength={1000}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setSent(false);
            }}
            placeholder="うまくいかないこと・こうしてほしいこと"
          />
        </label>
        <button type="submit" className="button button--primary" disabled={busy || !body.trim()}>
          送る
        </button>
      </form>
      {sent && <p className="alert alert--success">ありがとうございます。届きました。</p>}

      <h2>届いているもの</h2>
      {open.length === 0 ? (
        <p className="note">いまは何もありません。</p>
      ) : (
        <ul className="feedback">{open.map(card)}</ul>
      )}

      {done.length > 0 && (
        <>
          <button type="button" className="button" onClick={() => setShowDone(!showDone)}>
            {showDone ? '対応済みを隠す' : `対応済みも見る（${done.length}）`}
          </button>
          {showDone && <ul className="feedback">{done.map(card)}</ul>}
        </>
      )}
    </main>
  );
}
