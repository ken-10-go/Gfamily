import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  detectHouses,
  houseChoices,
  resolveHouses,
  type DetectedHouse,
} from '@/features/tree-view/houses';
import * as api from '@/lib/api';
import { compareForDisplay } from '@/lib/relations';
import {
  displayName,
  lifespanLabel,
  ROLE_LABELS,
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

  /**
   * その人の、ある家への所属を付け外しする。1人が複数の家に属してよい。
   *
   * まだ登録されていない（自動判定のままの）家を選んだときは、その場で登録する。
   * 「先に名前を付けて固定してから所属を選ぶ」という二段構えにすると、
   * 何も登録していないあいだは選ぶものが1つも無く、行き止まりになるため。
   */
  function handleToggle(person: Person, houseId: string, belongs: boolean) {
    if (!belongs) {
      const next = person.houseIds.filter((id) => id !== houseId);
      void run(() => api.setPersonHouses(treeId, [person.id], next), '所属を変えられませんでした');
      return;
    }

    void run(async () => {
      if (houses.some((house) => house.id === houseId)) {
        await api.setPersonHouses(treeId, [person.id], [...person.houseIds, houseId]);
        return;
      }

      const group = detectHouses(graph).find((house) => house.key === houseId);
      if (!group) throw new Error('家が見つかりませんでした');

      // 顔ぶれごと固定するので、その一群に居る人はこれだけで所属が付く
      const created = await api.createHouse(treeId, group.name, group.memberIds);
      if (group.memberIds.includes(person.id)) return;

      await api.setPersonHouses(treeId, [person.id], [...person.houseIds, created]);
    }, '所属を変えられませんでした');
  }

  /** 主たる家（配置のまとまりに使う家）を先頭へ持ってくる。 */
  function handlePrimary(person: Person, houseId: string) {
    const next = [houseId, ...person.houseIds.filter((id) => id !== houseId)];
    void run(
      () => api.setPersonHouses(treeId, [person.id], next),
      '主たる家を変えられませんでした',
    );
  }

  if (loading) return <p className="page__status">読み込み中…</p>;

  const canEdit = role === 'owner' || role === 'editor';
  const assignment = resolveHouses(graph, houses);
  const detected = detectHouses(graph);
  const persons = [...graph.persons].sort(compareForDisplay);

  // 所属として選べる家。編集画面と同じ一覧を使う
  const choices = houseChoices(graph, houses);

  const houseName = (houseId: string) =>
    houses.find((house) => house.id === houseId)?.name ?? '(不明な家)';

  /** その家に属する人。自動判定と手の指定の両方を通したあとの顔ぶれ。 */
  const membersOf = (houseId: string) =>
    persons.filter(
      (person) =>
        person.houseIds.includes(houseId) ||
        (person.houseIds.length === 0 && assignment.get(person.id)?.id === houseId),
    );

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

      {/*
        権限や読み込みの結果でこの節ごと消してしまうと、「設定項目が無い」のか
        「権限が無い」のか「読み込みに失敗した」のかが画面から分からなくなる。
        見出しは必ず出し、できない理由のほうを書く。
      */}
      <h2>人物の所属</h2>
      {!canEdit && (
        <p className="note">
          所属の変更は編集者以上が行えます（いまの権限:{' '}
          {role ? ROLE_LABELS[role] : '読み込めていません'}）。
        </p>
      )}
      {persons.length === 0 ? (
        <p className="note">人物がまだ登録されていません。</p>
      ) : (
        <>
          <p className="note">
            1人が複数の家に属してかまいません（生家と婚家など）。
            <strong>先頭の「主たる家」</strong>だけが配置のまとまりに使われます。
            どれも選ばなければ、血のつながりから自動で判定します。
            まだ登録していない家（自動）を選ぶと、その場で登録されます。
          </p>

          <ul className="card-list">
            {persons.map((person) => (
              <li key={person.id} className="card-list__item">
                <div className="card-list__header">
                  <strong>
                    {displayName(person)}
                    {lifespanLabel(person) && (
                      <span className="note"> （{lifespanLabel(person)}）</span>
                    )}
                  </strong>
                  <span className="note">
                    {person.houseIds.length === 0
                      ? `自動（${assignment.get(person.id)?.name ?? '—'}）`
                      : `主たる家: ${houseName(person.houseIds[0])}`}
                  </span>
                </div>

                <div className="field field--radios">
                  {choices.map((house) => {
                    const belongs = person.houseIds.includes(house.id);
                    const primary = person.houseIds[0] === house.id;
                    // 何も選んでいない人は、自動で判定された家に居る
                    const auto =
                      person.houseIds.length === 0 && assignment.get(person.id)?.id === house.id;

                    return (
                      <span key={house.id} className="house-choice">
                        <label className="field__radio">
                          <input
                            type="checkbox"
                            checked={belongs}
                            disabled={busy || !canEdit}
                            onChange={(event) =>
                              handleToggle(person, house.id, event.target.checked)
                            }
                          />
                          <span>
                            {house.name}
                            {!house.registered && <span className="note">（未登録）</span>}
                          </span>
                          {auto && <span className="badge">自動</span>}
                        </label>
                        {belongs && !primary && canEdit && (
                          <button
                            type="button"
                            className="link-button"
                            disabled={busy}
                            onClick={() => handlePrimary(person, house.id)}
                          >
                            主にする
                          </button>
                        )}
                        {primary && <span className="badge">主</span>}
                      </span>
                    );
                  })}
                </div>
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
