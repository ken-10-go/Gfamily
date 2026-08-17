import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { detectHouses, resolveHouses, type DetectedHouse } from '@/features/tree-view/houses';
import * as api from '@/lib/api';
import { compareForDisplay } from '@/lib/relations';
import {
  displayName,
  lifespanLabel,
  type House,
  type Person,
  type TreeGraph,
  type TreeRole,
} from '@/types/models';

/**
 * 家の管理。
 *
 * 家は、婚姻の線を外して親子だけでたどった一群として**自動で決まる**。
 * この画面は、その判定を確かめて、食い違うところだけを手で直すためのもの。
 * 何もしなくても家系図は成り立つので、既定では触らなくてよい。
 */
export function HousesPage() {
  const { treeId = '' } = useParams();
  const [role, setRole] = useState<TreeRole | null>(null);
  const [treeName, setTreeName] = useState('');
  const [graph, setGraph] = useState<TreeGraph>({ persons: [], parentChild: [], unions: [] });
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [tree, myRole, loaded, list] = await Promise.all([
        api.getTree(treeId),
        api.getMyRole(treeId),
        api.loadTreeGraph(treeId),
        api.listHouses(treeId),
      ]);
      setTreeName(tree.name);
      setRole(myRole);
      setGraph(loaded);
      setHouses(list);
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

  /** 自動で見つけた一群に名前を付けて、その顔ぶれを固定する。 */
  function handlePin(detected: DetectedHouse) {
    const name = window.prompt('この家の名前', detected.name)?.trim();
    if (!name) return;

    void run(async () => {
      await api.createHouse(treeId, name, detected.memberIds);
    }, '家を登録できませんでした');
  }

  function handleRename(house: House) {
    const name = window.prompt('家の名前', house.name)?.trim();
    if (!name || name === house.name) return;

    void run(() => api.renameHouse(treeId, house.id, name), '名前を変えられませんでした');
  }

  function handleDelete(house: House) {
    if (!window.confirm(`「${house.name}」の登録を解除しますか？（人物は消えません）`)) return;

    void run(() => api.deleteHouse(treeId, house.id), '解除できませんでした');
  }

  function handleMove(person: Person, houseId: string) {
    void run(
      () => api.setPersonHouses(treeId, [person.id], houseId || null),
      '所属を変えられませんでした',
    );
  }

  if (loading) return <p className="page__status">読み込み中…</p>;

  const canEdit = role === 'owner' || role === 'editor';
  const assignment = resolveHouses(graph, houses);
  const detected = detectHouses(graph);
  const persons = [...graph.persons].sort(compareForDisplay);

  /** その家に属する人。自動判定と手の指定の両方を通したあとの顔ぶれ。 */
  const membersOf = (houseId: string) =>
    persons.filter((person) => assignment.get(person.id)?.id === houseId);

  return (
    <main className="page">
      <p>
        <Link to={`/trees/${treeId}`}>← {treeName || '家系図'}へ戻る</Link>
      </p>
      <h1>家の管理</h1>
      <p className="note">
        家は、婚姻の線を外して<strong>親子だけをたどった一群</strong>として自動で決まります。
        名前はその一群でいちばん多い姓から付けます。
        改姓や婿養子で実感と食い違うときだけ、下で直してください。
      </p>

      {error && <p className="alert alert--error">{error}</p>}
      {!canEdit && <p className="note">家の変更は編集者以上が行えます。</p>}

      <h2>いまの家</h2>
      {detected.length === 0 ? (
        <p className="note">まだ人物が登録されていません。</p>
      ) : (
        <ul className="card-list">
          {detected.map((group) => {
            // 手で別の家へ移した人を除いた、実際の顔ぶれ
            const members = membersOf(group.key);
            if (members.length === 0) return null;

            return (
              <li key={group.key} className="card-list__item">
                <div className="card-list__header">
                  <strong>
                    {group.name}（{members.length}人）
                  </strong>
                  {canEdit && (
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => handlePin(group)}
                    >
                      名前を付けて固定
                    </button>
                  )}
                </div>
                <p className="note">自動で判定した家です。{memberSummary(members)}</p>
              </li>
            );
          })}

          {houses.map((house) => (
            <li key={house.id} className="card-list__item">
              <div className="card-list__header">
                <strong>
                  {house.name}（{membersOf(house.id).length}人）
                </strong>
                {canEdit && (
                  <span className="card-list__actions">
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => handleRename(house)}
                    >
                      名前を変える
                    </button>
                    <button
                      type="button"
                      className="button button--danger"
                      disabled={busy}
                      onClick={() => handleDelete(house)}
                    >
                      解除
                    </button>
                  </span>
                )}
              </div>
              <p className="note">手で登録した家です。{memberSummary(membersOf(house.id))}</p>
            </li>
          ))}
        </ul>
      )}

      {canEdit && houses.length > 0 && (
        <>
          <h2>人物の所属</h2>
          <p className="note">
            自動の判定と実感が食い違う人だけ、属する家を選び直してください。
            「自動」に戻すと、また血のつながりから判定します。
          </p>

          <ul className="card-list">
            {persons.map((person) => (
              <li key={person.id} className="card-list__item card-list__header">
                <span>
                  {displayName(person)}
                  {lifespanLabel(person) && (
                    <span className="note"> （{lifespanLabel(person)}）</span>
                  )}
                </span>
                <select
                  value={person.houseId ?? ''}
                  disabled={busy}
                  aria-label={`${displayName(person)} の家`}
                  onChange={(event) => handleMove(person, event.target.value)}
                >
                  <option value="">自動（{assignment.get(person.id)?.name ?? '—'}）</option>
                  {houses.map((house) => (
                    <option key={house.id} value={house.id}>
                      {house.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

/** 顔ぶれを数人だけ並べて、どの家か見当が付くようにする。 */
function memberSummary(members: Person[]): string {
  const names = members.slice(0, 4).map(displayName);
  const rest = members.length - names.length;
  return names.join('・') + (rest > 0 ? ` ほか${rest}人` : '');
}
