import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { lastTreeId, rememberTree } from '@/features/app/lastTree';
import { Avatar } from '@/features/home/Avatar';
import { detectHouses } from '@/features/tree-view/houses';
import { useAuth } from '@/features/auth/useAuth';
import * as api from '@/lib/api';
import { compareForDisplay } from '@/lib/relations';
import { type Tree, type TreeGraph } from '@/types/models';

/**
 * ホーム。開いている家系図の入口と、家族の顔ぶれを1画面にまとめる。
 *
 * 家系図そのものは横に広く、スマホでは全体を掴みにくい。
 * 「誰がいるか」はここで縦に読めるようにして、図は必要なときに開く。
 */
export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [trees, setTrees] = useState<Tree[]>([]);
  const [current, setCurrent] = useState<Tree | null>(null);
  const [graph, setGraph] = useState<TreeGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listTrees();
      setTrees(list);

      // 直前に開いていたものを優先し、無ければ先頭
      const remembered = lastTreeId();
      const tree = list.find((entry) => entry.id === remembered) ?? list[0] ?? null;
      setCurrent(tree);
      setGraph(tree ? await api.loadTreeGraph(tree.id) : null);
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
      rememberTree(treeId);
      navigate(`/trees/${treeId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '作成に失敗しました');
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <p className="page__status">読み込み中…</p>;

  const persons = graph
    ? graph.persons.filter((person) => !person.deletedAt).sort(compareForDisplay)
    : [];
  const generations = graph ? countGenerations(graph) : 0;
  const houseCount = graph ? detectHouses(graph).length : 0;

  return (
    <main className="home">
      <header className="home__head">
        <div>
          <p className="home__greeting">後藤家親戚専用</p>
          <h1 className="home__title">{current?.name ?? '家系図'}</h1>
        </div>
        <span className="home__me" aria-hidden="true">
          {(user?.email ?? '?').slice(0, 1).toUpperCase()}
        </span>
      </header>

      {error && <p className="alert alert--error">{error}</p>}

      {current && graph && (
        <Link className="home__preview" to={`/trees/${current.id}`}>
          {/* 家系図の大きさを数字で3つ。中を開かなくても、いまの規模が分かる */}
          <div className="stats">
            <Stat value={persons.length} label="人" />
            <Stat value={generations} label="世代" />
            <Stat value={houseCount} label="家" />
          </div>
          <div className="home__faces">
            {persons.slice(0, 6).map((person) => (
              <Avatar key={person.id} person={person} size={34} />
            ))}
          </div>
          <span className="home__open">家系図をひらく →</span>
        </Link>
      )}

      {trees.length > 1 && (
        <>
          <h2 className="home__label home__section">ほかの家系図</h2>
          <ul className="person-list">
            {trees
              .filter((tree) => tree.id !== current?.id)
              .map((tree) => (
                <li key={tree.id}>
                  <Link className="person-row" to={`/trees/${tree.id}`}>
                    <span className="person-row__body">
                      <span className="person-row__name">{tree.name}</span>
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </>
      )}

      <form onSubmit={handleCreate} className="home__create">
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
        <button
          type="submit"
          className="button button--primary"
          disabled={creating || !name.trim()}
        >
          作成
        </button>
      </form>
    </main>
  );
}

/** 数字ひとつぶんのタイル。人数・世代・家の3つを並べる。 */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="stats__tile">
      <span className="stats__value">{value}</span>
      <span className="stats__label">{label}</span>
    </span>
  );
}

/** 何世代ぶんの家系かを、親子の線をたどった深さで数える。 */
function countGenerations(graph: TreeGraph): number {
  const parents = new Map<string, string[]>();
  for (const pc of graph.parentChild) {
    if (pc.deletedAt) continue;
    parents.set(pc.childId, [...(parents.get(pc.childId) ?? []), pc.parentId]);
  }

  const depth = new Map<string, number>();
  const depthOf = (id: string, seen = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id) as number;
    if (seen.has(id)) return 0;
    seen.add(id);

    const above = (parents.get(id) ?? []).map((parentId) => depthOf(parentId, seen));
    const value = above.length === 0 ? 1 : Math.max(...above) + 1;
    depth.set(id, value);
    return value;
  };

  const living = graph.persons.filter((person) => !person.deletedAt);
  return living.length === 0 ? 0 : Math.max(...living.map((person) => depthOf(person.id)));
}
