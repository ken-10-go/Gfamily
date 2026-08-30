import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Avatar } from '@/features/home/Avatar';
import * as api from '@/lib/api';
import { displayName, lifespanLabel, type Person, type TreeRole } from '@/types/models';

/**
 * ゴミ箱と、変更の記録の後始末。
 *
 * 記録の中身は出さない。誰がいつ何をしたかを並べても、家族で使ううえでは
 * ほとんど読まれず、場所だけを取っていた。
 * 残しているのは「戻す」「消す」という後始末の手立てのほう。
 */
export function HistoryPage() {
  const { treeId = '' } = useParams();
  const [deleted, setDeleted] = useState<Person[]>([]);
  const [logs, setLogs] = useState(0);
  const [role, setRole] = useState<TreeRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextDeleted, count, myRole] = await Promise.all([
        api.listDeletedPersons(treeId),
        api.countAuditLogs(treeId),
        api.getMyRole(treeId),
      ]);
      setDeleted(nextDeleted);
      setLogs(count);
      setRole(myRole);
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

  async function run(work: () => Promise<void>, failure: string) {
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      await work();
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : failure);
    } finally {
      setBusy(false);
    }
  }

  function handleRestore(person: Person) {
    void run(() => api.restorePerson(treeId, person.id), '復元に失敗しました');
  }

  /** ゴミ箱から完全に消す。戻せないので、名前を見せて確かめる。 */
  function handlePurge(person: Person) {
    const name = displayName(person);
    if (
      !window.confirm(
        `「${name}」を完全に削除します。\nこの人につながる親子・婚姻の線も消え、元に戻せません。`,
      )
    ) {
      return;
    }

    void run(async () => {
      await api.purgePerson(treeId, person.id);
      setDone(`「${name}」を完全に削除しました。`);
    }, '削除に失敗しました');
  }

  /** 変更の記録を丸ごと消す。オーナーだけが行える。 */
  function handleClearLogs() {
    if (!window.confirm(`変更の記録 ${logs} 件をすべて消します。元に戻せません。`)) return;

    void run(async () => {
      const removed = await api.clearAuditLogs(treeId);
      setDone(`変更の記録 ${removed} 件を消しました。`);
    }, '記録を消せませんでした');
  }

  if (loading) return <p className="page__status">読み込み中…</p>;

  const isOwner = role === 'owner';

  return (
    <main className="page">
      <p>
        <Link to={`/trees/${treeId}/settings`}>← 設定へ戻る</Link>
      </p>
      <h1>ゴミ箱</h1>

      {error && <p className="alert alert--error">{error}</p>}
      {done && <p className="note">{done}</p>}

      {deleted.length === 0 ? (
        <p className="note">削除された人物はありません。</p>
      ) : (
        <ul className="person-list">
          {deleted.map((person) => (
            <li key={person.id} className="person-row">
              <Avatar person={person} />
              <span className="person-row__body">
                <span className="person-row__name">{displayName(person)}</span>
                <span className="person-row__meta">{lifespanLabel(person)}</span>
              </span>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => handleRestore(person)}
              >
                戻す
              </button>
              {isOwner && (
                <button
                  type="button"
                  className="button button--danger"
                  disabled={busy}
                  onClick={() => handlePurge(person)}
                >
                  完全に削除
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!isOwner && deleted.length > 0 && (
        <p className="note">完全に削除できるのはオーナーだけです。</p>
      )}

      <h2>変更の記録</h2>
      <p className="note">
        誰がいつ何を変えたかを {logs} 件ぶん残しています。
        {isOwner && (
          <>
            {' '}
            中身は <Link to={`/trees/${treeId}/audit`}>変更履歴</Link> で見られます。
          </>
        )}
      </p>

      {isOwner ? (
        <button
          type="button"
          className="button button--danger"
          disabled={busy || logs === 0}
          onClick={handleClearLogs}
        >
          記録をすべて消す
        </button>
      ) : (
        <p className="note">記録を消せるのはオーナーだけです。</p>
      )}
    </main>
  );
}
