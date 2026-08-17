import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import * as api from '@/lib/api';
import type { Bridge } from '@/lib/api';
import { compareForDisplay } from '@/lib/relations';
import { displayName, lifespanLabel, type Person, type TreeRole } from '@/types/models';

const TYPE_LABELS: Record<Bridge['bridgeType'], string> = {
  marriage: '婚姻',
  adoptive: '養子縁組',
};

/**
 * 他家とのつながり（ブリッジ）の管理。
 *
 * ⚠ 暫定の作り。相手の家系図IDを知っていれば、相手の承認なしにその場でつながる。
 * 管理すべき家族単位を決めたら、双方のオーナーの承認を挟む形へ戻すこと。
 * 戻し先は `functions/src/index.ts` の acceptBridgeConnection。
 */
export function BridgesPage() {
  const { treeId = '' } = useParams();
  const [role, setRole] = useState<TreeRole | null>(null);
  const [treeName, setTreeName] = useState('');
  const [persons, setPersons] = useState<Person[]>([]);
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // つなぐ相手
  const [otherTreeId, setOtherTreeId] = useState('');
  const [other, setOther] = useState<{ name: string; persons: Person[] } | null>(null);

  // どの人物どうしをつなぐか
  const [personId, setPersonId] = useState('');
  const [otherPersonId, setOtherPersonId] = useState('');
  const [bridgeType, setBridgeType] = useState<Bridge['bridgeType']>('marriage');

  const reload = useCallback(async () => {
    try {
      const [tree, myRole, graph, list] = await Promise.all([
        api.getTree(treeId),
        api.getMyRole(treeId),
        api.loadTreeGraph(treeId),
        api.listBridges(treeId),
      ]);
      setTreeName(tree.name);
      setRole(myRole);
      setPersons([...graph.persons].sort(compareForDisplay));
      setBridges(list);
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

  async function handlePreview() {
    setError(null);
    setOther(null);
    setOtherPersonId('');
    setBusy(true);
    try {
      const found = await api.previewTree(otherTreeId.trim());
      setOther({ name: found.name, persons: [...found.persons].sort(compareForDisplay) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '相手の家系図を読み込めませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function handleConnect() {
    const confirmed = window.confirm(
      `${other?.name} とつながります。\n\n` +
        'おたがいの家系図が、存命の方も含めてそのまま見えるようになります。\n\n' +
        'つながりはいつでも解除できます。つなぎますか？',
    );
    if (!confirmed) return;

    setError(null);
    setBusy(true);
    try {
      await api.connectTree(treeId, personId, otherTreeId.trim(), otherPersonId, bridgeType);
      setOtherTreeId('');
      setOther(null);
      setPersonId('');
      setOtherPersonId('');
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'つなげませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(bridge: Bridge) {
    if (!window.confirm('このつながりを解除しますか？（相手からも即座に見えなくなります）')) return;

    try {
      await api.revokeBridge(bridge.id);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '解除に失敗しました');
    }
  }

  if (loading) return <p className="page__status">読み込み中…</p>;

  const isOwner = role === 'owner';
  const personOptions = (list: Person[]) =>
    list.map((person) => (
      <option key={person.id} value={person.id}>
        {displayName(person)}
        {lifespanLabel(person) ? `（${lifespanLabel(person)}）` : ''}
      </option>
    ));

  return (
    <main className="page">
      <p>
        <Link to={`/trees/${treeId}`}>← {treeName || '家系図'}へ戻る</Link>
      </p>
      <h1>家どうしのつながり</h1>
      <p className="note">
        婚姻や養子縁組で他の家の家系図とつなぎます。つながると、 おたがいの家系図が
        <strong>存命の方も含めて</strong>そのまま見えるようになります。 いつでも解除できます。
      </p>

      {error && <p className="alert alert--error">{error}</p>}
      {!isOwner && <p className="note">つながりの操作はオーナーのみ行えます。</p>}

      <h2>いまのつながり</h2>
      {bridges.length === 0 ? (
        <p className="note">まだつながっている家はありません。</p>
      ) : (
        <ul className="card-list">
          {bridges.map((bridge) => (
            <li key={bridge.id} className="card-list__item">
              <div className="card-list__header">
                <strong>🤝 つながっています（{TYPE_LABELS[bridge.bridgeType]}）</strong>
                {isOwner && (
                  <button
                    type="button"
                    className="button button--danger"
                    onClick={() => void handleRevoke(bridge)}
                  >
                    解除
                  </button>
                )}
              </div>
              <p className="note">
                相手の家系図ID:{' '}
                <code>
                  {bridge.requesterTreeId === treeId ? bridge.targetTreeId : bridge.requesterTreeId}
                </code>
                {bridge.acceptedAt &&
                  ` ・ ${new Date(bridge.acceptedAt).toLocaleDateString('ja-JP')} に成立`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {isOwner && (
        <>
          <h2>家系図をつなぐ</h2>
          <p className="note">
            相手の家系図IDを貼り付けてください。相手のオーナーに、家系図を開いたときの URL の{' '}
            <code>/trees/</code> より後ろの部分を教えてもらいます。
          </p>

          <div className="form form--inline">
            <label className="field field--grow">
              <span className="field__label">相手の家系図ID</span>
              <input
                type="text"
                value={otherTreeId}
                onChange={(event) => setOtherTreeId(event.target.value)}
                placeholder="例: aBcDeFgHiJkLmNoPqRsT"
              />
            </label>
            <button
              type="button"
              className="button"
              disabled={!otherTreeId.trim() || busy}
              onClick={() => void handlePreview()}
            >
              確認
            </button>
          </div>

          {other && (
            <div className="card-list__item">
              <p>
                つなぐ相手: <strong>{other.name}</strong>
              </p>

              <div className="form__row">
                <label className="field">
                  <span className="field__label">こちらの家系図で、つながる人物</span>
                  <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
                    <option value="">選んでください</option>
                    {personOptions(persons)}
                  </select>
                </label>

                <label className="field">
                  <span className="field__label">{other.name} で、つながる人物</span>
                  <select
                    value={otherPersonId}
                    onChange={(event) => setOtherPersonId(event.target.value)}
                  >
                    <option value="">選んでください</option>
                    {personOptions(other.persons)}
                  </select>
                </label>

                <label className="field">
                  <span className="field__label">つながりの種類</span>
                  <select
                    value={bridgeType}
                    onChange={(event) => setBridgeType(event.target.value as Bridge['bridgeType'])}
                  >
                    <option value="marriage">婚姻</option>
                    <option value="adoptive">養子縁組</option>
                  </select>
                </label>
              </div>

              <div className="form__actions">
                <button
                  type="button"
                  className="button button--primary"
                  disabled={!personId || !otherPersonId || busy}
                  onClick={() => void handleConnect()}
                >
                  {busy ? 'つないでいます…' : 'この2人でつなぐ'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
