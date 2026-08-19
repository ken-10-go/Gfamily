import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { rememberTree } from '@/features/app/lastTree';
import { Avatar } from '@/features/home/Avatar';
import * as api from '@/lib/api';
import { ageLabel } from '@/lib/japanese-date';
import { birthOrderLabel, compareForDisplay } from '@/lib/relations';
import { displayName, displayNameKana, type Person, type TreeGraph } from '@/types/models';

/**
 * 家族（人物）の一覧。
 *
 * 家系図は横に広く、目当ての人を探すのに向かない。
 * 「誰がいるか」「その人は何歳か」を縦に読める場所を分けて持つ。
 */
export function PeoplePage() {
  const { treeId = '' } = useParams();
  const [treeName, setTreeName] = useState('');
  const [graph, setGraph] = useState<TreeGraph>({ persons: [], parentChild: [], unions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const reload = useCallback(async () => {
    try {
      const [tree, loaded] = await Promise.all([api.getTree(treeId), api.loadTreeGraph(treeId)]);
      setTreeName(tree.name);
      setGraph(loaded);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    rememberTree(treeId);
    void reload();
  }, [reload, treeId]);

  const persons = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return graph.persons
      .filter((person) => !person.deletedAt)
      .filter((person) => (keyword ? matches(person, keyword) : true))
      .sort(compareForDisplay);
  }, [graph.persons, search]);

  if (loading) return <p className="page__status">読み込み中…</p>;

  return (
    <main className="home">
      <header className="home__head">
        <div>
          <p className="home__greeting">{treeName}</p>
          <h1 className="home__title">家族</h1>
        </div>
      </header>

      {error && <p className="alert alert--error">{error}</p>}

      <input
        type="search"
        className="home__search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="名前・ふりがな・旧姓で探す"
        aria-label="人物を探す"
      />

      <p className="home__label home__section">{persons.length}人</p>

      <ul className="person-list">
        {persons.map((person) => (
          <li key={person.id}>
            <Link className="person-row" to={`/trees/${treeId}?person=${person.id}`}>
              <Avatar person={person} />
              <span className="person-row__body">
                {displayNameKana(person) && (
                  <span className="person-row__kana">{displayNameKana(person)}</span>
                )}
                <span className="person-row__name">{displayName(person)}</span>
                <span className="person-row__meta">
                  {[person.birthOrder ?? birthOrderLabel(graph, person), ageLabel(person)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span
                className={person.isLiving ? 'person-row__dot' : 'person-row__dot is-gone'}
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>

      {persons.length === 0 && (
        <p className="page__status">
          {search ? '見つかりませんでした。' : 'まだ人物が登録されていません。'}
        </p>
      )}
    </main>
  );
}

/** 名前・読み・旧姓のどれかに当たれば拾う。読みで覚えている人もいるため。 */
function matches(person: Person, keyword: string): boolean {
  return [displayName(person), displayNameKana(person), person.maidenName ?? '']
    .join(' ')
    .toLowerCase()
    .includes(keyword);
}
