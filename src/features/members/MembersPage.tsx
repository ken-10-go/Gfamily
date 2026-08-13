import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '@/features/auth/useAuth';
import * as api from '@/lib/api';
import { ROLE_LABELS, type Invitation, type TreeMember, type TreeRole } from '@/types/models';

export function MembersPage() {
  const { treeId = '' } = useParams();
  const { user } = useAuth();
  const [members, setMembers] = useState<TreeMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [role, setRole] = useState<TreeRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteRole, setInviteRole] = useState<Exclude<TreeRole, 'owner'>>('viewer');
  const [inviteEmail, setInviteEmail] = useState('');
  const [validDays, setValidDays] = useState(7);
  const [issuedLink, setIssuedLink] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const myRole = await api.getMyRole(treeId);
      setRole(myRole);
      setMembers(await api.listMembers(treeId));
      // 招待一覧はオーナーしか読めないので、権限がなければ取りに行かない
      setInvitations(myRole === 'owner' ? await api.listInvitations(treeId) : []);
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

  async function handleInvite() {
    setError(null);
    try {
      const token = await api.createInvitation(
        treeId,
        inviteRole,
        inviteEmail.trim() || null,
        validDays,
      );
      setIssuedLink(`${window.location.origin}${import.meta.env.BASE_URL}invite/${token}`);
      setInviteEmail('');
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '招待の作成に失敗しました');
    }
  }

  async function handleRoleChange(userId: string, nextRole: TreeRole) {
    try {
      await api.updateMemberRole(treeId, userId, nextRole);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '権限の変更に失敗しました');
    }
  }

  async function handleRemove(userId: string) {
    const isSelf = userId === user?.id;
    const message = isSelf
      ? 'この家系図から脱退しますか？'
      : 'このメンバーを削除しますか？';
    if (!window.confirm(message)) return;

    try {
      await api.removeMember(treeId, userId);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '削除に失敗しました');
    }
  }

  if (loading) return <p className="page__status">読み込み中…</p>;

  const isOwner = role === 'owner';

  return (
    <main className="page">
      <Link to={`/trees/${treeId}`} className="tree-page__back">
        ← 家系図に戻る
      </Link>
      <h1>メンバーと招待</h1>

      {error && <p className="alert alert--error">{error}</p>}

      <section>
        <h2>メンバー</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ユーザー</th>
              <th>権限</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.user_id}>
                <td>
                  <code>{member.user_id.slice(0, 8)}…</code>
                  {member.user_id === user?.id && <span className="badge">自分</span>}
                </td>
                <td>
                  {isOwner && member.user_id !== user?.id ? (
                    <select
                      value={member.role}
                      onChange={(event) =>
                        handleRoleChange(member.user_id, event.target.value as TreeRole)
                      }
                      aria-label="権限"
                    >
                      {(Object.keys(ROLE_LABELS) as TreeRole[]).map((value) => (
                        <option key={value} value={value}>
                          {ROLE_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    ROLE_LABELS[member.role]
                  )}
                </td>
                <td>
                  {(isOwner || member.user_id === user?.id) && (
                    <button
                      type="button"
                      className="button button--danger"
                      onClick={() => handleRemove(member.user_id)}
                    >
                      {member.user_id === user?.id ? '脱退' : '削除'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          メンバーはユーザーIDで表示されます。メールアドレスは他のメンバーに公開されません。
        </p>
      </section>

      {isOwner && (
        <section>
          <h2>招待する</h2>

          <div className="form form--inline">
            <label className="field">
              <span className="field__label">権限</span>
              <select
                value={inviteRole}
                onChange={(event) =>
                  setInviteRole(event.target.value as Exclude<TreeRole, 'owner'>)
                }
              >
                <option value="viewer">閲覧者</option>
                <option value="editor">編集者</option>
              </select>
            </label>

            <label className="field field--grow">
              <span className="field__label">宛先メール（任意・指定すると本人しか使えません）</span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="relative@example.com"
              />
            </label>

            <label className="field">
              <span className="field__label">有効日数</span>
              <input
                type="number"
                min={1}
                max={30}
                value={validDays}
                onChange={(event) => setValidDays(Number(event.target.value))}
              />
            </label>

            <button type="button" className="button button--primary" onClick={handleInvite}>
              招待リンクを発行
            </button>
          </div>

          {issuedLink && (
            <div className="alert alert--success">
              <p>招待リンクを発行しました。この内容は今だけ表示されます。</p>
              <code className="token">{issuedLink}</code>
              <button
                type="button"
                className="button"
                onClick={() => navigator.clipboard?.writeText(issuedLink)}
              >
                コピー
              </button>
            </div>
          )}

          <h3>発行済みの招待</h3>
          {invitations.length === 0 ? (
            <p className="note">まだ招待はありません。</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>権限</th>
                  <th>宛先</th>
                  <th>状態</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td>{ROLE_LABELS[invitation.role]}</td>
                    <td>{invitation.email ?? '（リンクを知っている人）'}</td>
                    <td>{invitationStatus(invitation)}</td>
                    <td>
                      {!invitation.accepted_at && !invitation.revoked_at && (
                        <button
                          type="button"
                          className="button"
                          onClick={async () => {
                            await api.revokeInvitation(invitation.id);
                            await reload();
                          }}
                        >
                          取り消す
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}

function invitationStatus(invitation: Invitation): string {
  if (invitation.revoked_at) return '取り消し済み';
  if (invitation.accepted_at) return '受諾済み';
  if (new Date(invitation.expires_at) < new Date()) return '期限切れ';
  return `有効（${new Date(invitation.expires_at).toLocaleDateString('ja-JP')}まで）`;
}
