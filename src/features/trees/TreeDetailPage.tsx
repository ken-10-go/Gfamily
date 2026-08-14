import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { PersonForm } from '@/features/persons/PersonForm';
import { PersonPanel } from '@/features/persons/PersonPanel';
import { TreeCanvas } from '@/features/tree-view/TreeCanvas';
import * as api from '@/lib/api';
import {
  displayName,
  displayNameKana,
  lifespanLabel,
  ROLE_LABELS,
  type PersonInput,
  type Tree,
  type TreeGraph,
  type TreeRole,
} from '@/types/models';

const EMPTY_GRAPH: TreeGraph = { persons: [], parentChild: [], unions: [] };

export function TreeDetailPage() {
  const { treeId = '' } = useParams();
  const [tree, setTree] = useState<Tree | null>(null);
  const [role, setRole] = useState<TreeRole | null>(null);
  const [graph, setGraph] = useState<TreeGraph>(EMPTY_GRAPH);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [search, setSearch] = useState('');

  const reload = useCallback(async () => {
    try {
      const [nextTree, nextRole, nextGraph] = await Promise.all([
        api.getTree(treeId),
        api.getMyRole(treeId),
        api.loadTreeGraph(treeId),
      ]);
      setTree(nextTree);
      setRole(nextRole);
      setGraph(nextGraph);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const canEdit = role === 'owner' || role === 'editor';
  const selected = graph.persons.find((p) => p.id === selectedId) ?? null;

  /** ドラッグで入れ替えたきょうだいの順を保存する。 */
  async function handleReorderSiblings(orderedIds: string[]) {
    try {
      await api.setSiblingOrder(treeId, orderedIds);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '並び順の保存に失敗しました');
    }
  }

  async function handleCreatePerson(input: PersonInput) {
    const created = await api.createPerson(treeId, input);
    await reload();
    setSelectedId(created.id);
    setAddingPerson(false);
  }

  // 読みでも引けるようにする。旧姓を覚えている人を探す場面もあるので姓の履歴も対象にする。
  const keyword = search.trim().toLowerCase();
  const matches = keyword
    ? graph.persons.filter((person) =>
        [
          displayName(person),
          displayNameKana(person),
          person.maidenName ?? '',
          ...person.surnameHistory.map((record) => record.familyName),
        ]
          .join(' ')
          .toLowerCase()
          .includes(keyword),
      )
    : [];

  if (loading) {
    return <p className="page__status">読み込み中…</p>;
  }

  if (error) {
    return (
      <main className="page">
        <p className="alert alert--error">{error}</p>
        <Link to="/">一覧に戻る</Link>
      </main>
    );
  }

  return (
    <div className="tree-page">
      <header className="tree-page__header">
        <div>
          <Link to="/" className="tree-page__back">
            ← 一覧
          </Link>
          <h1>{tree?.name}</h1>
          {role && <span className="badge">{ROLE_LABELS[role]}</span>}
        </div>

        <div className="tree-page__tools">
          <div className="search">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="名前で検索"
              aria-label="人物を検索"
            />
            {matches.length > 0 && (
              <ul className="search__results">
                {matches.slice(0, 8).map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setSelectedId(person.id);
                        setSearch('');
                      }}
                    >
                      {displayName(person)}
                      <span className="search__meta">{lifespanLabel(person)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canEdit && (
            <button
              type="button"
              className="button button--primary"
              onClick={() => setAddingPerson(true)}
            >
              人物を追加
            </button>
          )}
          <Link to={`/trees/${treeId}/members`} className="button">
            メンバー
          </Link>
          <Link to={`/trees/${treeId}/history`} className="button">
            変更履歴
          </Link>
        </div>
      </header>

      <div className="tree-page__body">
        <TreeCanvas
          graph={graph}
          selectedPersonId={selectedId}
          onSelectPerson={setSelectedId}
          canReorder={canEdit}
          onReorderSiblings={handleReorderSiblings}
        />

        {addingPerson ? (
          <aside className="panel">
            <h2>人物を追加</h2>
            <PersonForm
              submitLabel="追加"
              onSubmit={handleCreatePerson}
              onCancel={() => setAddingPerson(false)}
            />
          </aside>
        ) : selected ? (
          <PersonPanel
            treeId={treeId}
            graph={graph}
            person={selected}
            canEdit={canEdit}
            onSelectPerson={setSelectedId}
            onChanged={reload}
          />
        ) : (
          <aside className="panel panel--placeholder">
            <p>人物を選ぶと詳細が表示されます。</p>
            {!canEdit && <p className="note">閲覧のみの権限です。</p>}
          </aside>
        )}
      </div>
    </div>
  );
}
