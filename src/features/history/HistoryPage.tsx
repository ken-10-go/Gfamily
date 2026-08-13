import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import * as api from '@/lib/api';
import { displayName, type AuditLog, type Person } from '@/types/models';

const ENTITY_LABELS: Record<string, string> = {
  persons: '人物',
  parentChild: '親子関係',
  unions: '婚姻関係',
  members: 'メンバー',
};

/** サーバー側で採番中の createdAt は一時的に null になりうる。 */
function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('ja-JP') : '—';
}

const ACTION_LABELS: Record<AuditLog['action'], string> = {
  insert: '追加',
  update: '編集',
  delete: '削除',
  restore: '復元',
};

export function HistoryPage() {
  const { treeId = '' } = useParams();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [deleted, setDeleted] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextLogs, nextDeleted] = await Promise.all([
        api.listAuditLogs(treeId),
        api.listDeletedPersons(treeId),
      ]);
      setLogs(nextLogs);
      setDeleted(nextDeleted);
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

  async function handleRestore(personId: string) {
    try {
      await api.restorePerson(treeId, personId);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '復元に失敗しました');
    }
  }

  if (loading) return <p className="page__status">読み込み中…</p>;

  return (
    <main className="page">
      <Link to={`/trees/${treeId}`} className="tree-page__back">
        ← 家系図に戻る
      </Link>
      <h1>変更履歴</h1>

      {error && <p className="alert alert--error">{error}</p>}

      <section>
        <h2>ゴミ箱</h2>
        {deleted.length === 0 ? (
          <p className="note">削除された人物はありません。</p>
        ) : (
          <ul className="card-list">
            {deleted.map((person) => (
              <li key={person.id} className="card-list__item card-list__item--row">
                <span>{displayName(person)}</span>
                <button type="button" className="button" onClick={() => handleRestore(person.id)}>
                  復元
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>操作ログ</h2>
        {logs.length === 0 ? (
          <p className="note">履歴はまだありません。</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>日時</th>
                <th>対象</th>
                <th>操作</th>
                <th>実行者</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>{ENTITY_LABELS[log.entity] ?? log.entity}</td>
                  <td>{ACTION_LABELS[log.action]}</td>
                  <td>
                    <code>{log.actorId ? `${log.actorId.slice(0, 8)}…` : '不明'}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
