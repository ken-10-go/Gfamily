import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import * as api from '@/lib/api';
import type { Bridge, BridgePreview } from '@/lib/api';
import { compareForDisplay } from '@/lib/relations';
import { displayName, lifespanLabel, type Person, type TreeRole } from '@/types/models';

const TYPE_LABELS: Record<Bridge['bridgeType'], string> = {
  marriage: '婚姻',
  adoptive: '養子縁組',
};

/**
 * 他家とのつながり（ブリッジ）の管理。
 *
 * 双方のオーナーが承認して初めてつながる。つながったあとも相手に見えるのは
 * 「故人だけ」で、生存者の情報は渡らない。解除すればその場で見えなくなる。
 */
export function BridgesPage() {
  const { treeId = '' } = useParams();
  const [role, setRole] = useState<TreeRole | null>(null);
  const [treeName, setTreeName] = useState('');
  const [persons, setPersons] = useState<Person[]>([]);
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 申請する側
  const [personId, setPersonId] = useState('');
  const [bridgeType, setBridgeType] = useState<Bridge['bridgeType']>('marriage');
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  // 承認する側
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<BridgePreview | null>(null);
  const [acceptPersonId, setAcceptPersonId] = useState('');

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

  async function handleIssue() {
    setError(null);
    try {
      setIssuedToken(await api.createBridgeInvitation(treeId, personId, bridgeType));
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '合言葉の発行に失敗しました');
    }
  }

  async function handlePreview() {
    setError(null);
    setPreview(null);
    try {
      const found = await api.previewBridgeInvitation(token.trim());
      if (!found) {
        setError('合言葉が無効か、有効期限が切れています');
        return;
      }
      setPreview(found);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '確認に失敗しました');
    }
  }

  async function handleAccept() {
    const confirmed = window.confirm(
      `${preview?.treeName} とつながります。\n\n` +
        'こちらの家系図の「故人」の情報だけが相手に見えるようになります。' +
        '生存している方の情報（本籍地・住所などを含む）は渡りません。\n\n' +
        'つながりはいつでも解除できます。承認しますか？',
    );
    if (!confirmed) return;

    setError(null);
    try {
      await api.acceptBridgeConnection(token.trim(), treeId, acceptPersonId);
      setToken('');
      setPreview(null);
      setAcceptPersonId('');
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '承認に失敗しました');
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

  return (
    <main className="page">
      <p>
        <Link to={`/trees/${treeId}`}>← {treeName || '家系図'}へ戻る</Link>
      </p>
      <h1>家どうしのつながり</h1>
      <p className="note">
        婚姻や養子縁組で他の家の家系図とつながります。つながったあとも、
        相手に見えるのは<strong>故人だけ</strong>です。生存している方の情報は渡りません。
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
                <strong>
                  {bridge.status === 'accepted' ? '🤝 つながっています' : '⏳ 承認待ち'}（
                  {TYPE_LABELS[bridge.bridgeType]}）
                </strong>
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
                {bridge.requesterTreeId === treeId ? 'こちらから申請' : '相手からの申請'}
                {bridge.acceptedAt && ` ・ ${new Date(bridge.acceptedAt).toLocaleDateString('ja-JP')} に成立`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {isOwner && (
        <>
          <h2>つなぐ相手に合言葉を渡す</h2>
          <p className="note">
            自分の家系図の「接続の起点になる人物」を選んで合言葉を発行し、相手の家の
            オーナーに伝えてください。相手が承認するとつながります。
          </p>

          <div className="form form--inline">
            <label className="field field--grow">
              <span className="field__label">接続の起点</span>
              <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
                <option value="">選んでください</option>
                {persons.map((person) => (
                  <option key={person.id} value={person.id}>
                    {displayName(person)}
                    {lifespanLabel(person) ? `（${lifespanLabel(person)}）` : ''}
                  </option>
                ))}
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

            <button
              type="button"
              className="button button--primary"
              disabled={!personId}
              onClick={() => void handleIssue()}
            >
              合言葉を発行
            </button>
          </div>

          {issuedToken && (
            <div className="alert alert--success">
              <p>この合言葉は今だけ表示されます。相手のオーナーに安全な方法で伝えてください。</p>
              <code className="token">{issuedToken}</code>
            </div>
          )}

          <h2>受け取った合言葉で承認する</h2>
          <div className="form form--inline">
            <label className="field field--grow">
              <span className="field__label">合言葉</span>
              <input
                type="text"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="相手から受け取った文字列"
              />
            </label>
            <button
              type="button"
              className="button"
              disabled={!token.trim()}
              onClick={() => void handlePreview()}
            >
              確認
            </button>
          </div>

          {preview && (
            <div className="card-list__item">
              <p>
                <strong>{preview.treeName}</strong> の <strong>{preview.personName}</strong> さんと、
                {TYPE_LABELS[preview.bridgeType]}でつながります。
              </p>

              <label className="field">
                <span className="field__label">こちらの家系図で、つながる人物</span>
                <select
                  value={acceptPersonId}
                  onChange={(event) => setAcceptPersonId(event.target.value)}
                >
                  <option value="">選んでください</option>
                  {persons.map((person) => (
                    <option key={person.id} value={person.id}>
                      {displayName(person)}
                      {lifespanLabel(person) ? `（${lifespanLabel(person)}）` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form__actions">
                <button
                  type="button"
                  className="button button--primary"
                  disabled={!acceptPersonId}
                  onClick={() => void handleAccept()}
                >
                  つながりを承認する
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
