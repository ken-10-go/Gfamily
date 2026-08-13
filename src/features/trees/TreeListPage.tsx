import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import * as api from '@/lib/api';
import type { Tree } from '@/types/models';

export function TreeListPage() {
  const navigate = useNavigate();
  const [trees, setTrees] = useState<Tree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTrees(await api.listTrees());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    try {
      const treeId = await api.createTree(name.trim());
      navigate(`/trees/${treeId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '作成に失敗しました');
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="page">
      <h1>家系図一覧</h1>

      {error && <p className="alert alert--error">{error}</p>}

      <form onSubmit={handleCreate} className="form form--inline">
        <label className="field field--grow">
          <span className="field__label">新しい家系図を作る</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例: 山田家"
            maxLength={120}
          />
        </label>
        <button type="submit" className="button button--primary" disabled={creating || !name.trim()}>
          作成
        </button>
      </form>

      {loading ? (
        <p className="page__status">読み込み中…</p>
      ) : trees.length === 0 ? (
        <p className="page__status">
          参加している家系図がありません。上のフォームから作成するか、招待リンクを受け取ってください。
        </p>
      ) : (
        <ul className="card-list">
          {trees.map((tree) => (
            <li key={tree.id} className="card-list__item">
              <Link to={`/trees/${tree.id}`} className="card-list__title">
                {tree.name}
              </Link>
              {tree.description && <p className="card-list__meta">{tree.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
