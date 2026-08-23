import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '@/features/auth/useAuth';
import * as api from '@/lib/api';
import type { MemberEntry } from '@/lib/api';
import { ROLE_LABELS, type Invitation, type TreeRole } from '@/types/models';

export function MembersPage() {
  const { treeId = '' } = useParams();
  const { user, sendPasswordReset } = useAuth();
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [role, setRole] = useState<TreeRole | null>(null);
  /** uid → ログインに使っているアカウント。オーナーのときだけ引ける */
  const [accounts, setAccounts] = useState<Map<string, api.MemberAccount>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteRole, setInviteRole] = useState<Exclude<TreeRole, 'owner'>>('viewer');
  const [inviteEmail, setInviteEmail] = useState('');
  const [validDays, setValidDays] = useState(7);
  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  /** 期限まで何人でも使える共通のリンクにするか */
  const [shared, setShared] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const myRole = await api.getMyRole(treeId);
      setRole(myRole);
      setMembers(await api.listMembers(treeId));
      // 招待一覧はオーナーしか読めないので、権限がなければ取りに行かない
      setInvitations(myRole === 'owner' ? await api.listInvitations(treeId) : []);

      /*
       * 誰なのかを画面で見分けられるよう、メールアドレスを添える。
       * uid しか出ないと、権限を変える相手を取り違える。
       * Cloud Functions を通すので、まだ配っていない環境では取れないこともある。
       */
      if (myRole === 'owner') {
        try {
          const list = await api.listMemberAccounts(treeId);
          setAccounts(new Map(list.map((account) => [account.uid, account])));
        } catch {
          setAccounts(new Map());
        }
      }
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

  /**
   * パスワードの再設定メールを、本人あてに送る。
   *
   * オーナーでもパスワードそのものは見えないし、決められない。
   * 「本人に決め直してもらう」ための手立てだけを持たせる。
   */
  async function handlePasswordReset(userId: string) {
    const account = accounts.get(userId);
    if (!account?.email) return;
    if (!window.confirm(`${account.email} 宛に、パスワードを設定し直すメールを送ります。`)) return;

    setError(null);
    setNotice(null);
    try {
      await sendPasswordReset(account.email);
      setNotice(`${account.email} に再設定メールを送りました。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'メールを送れませんでした');
    }
  }

  async function handleInvite() {
    setError(null);
    try {
      const token = await api.createInvitation(
        treeId,
        inviteRole,
        inviteEmail.trim() || null,
        validDays,
        shared,
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
    const isSelf = userId === user?.uid;
    const message = isSelf ? 'この家系図から脱退しますか？' : 'このメンバーを削除しますか？';
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
      {notice && <p className="note">{notice}</p>}

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
              <tr key={member.userId}>
                <td>
                  {accounts.get(member.userId)?.email ?? <code>{member.userId.slice(0, 8)}…</code>}
                  {member.userId === user?.uid && <span className="badge">自分</span>}
                  {accounts.get(member.userId)?.providers.includes('google.com') && (
                    <span className="badge">Google</span>
                  )}
                  {accounts.get(member.userId)?.providers.includes('password') && (
                    <span className="badge">パスワード</span>
                  )}
                </td>
                <td>
                  {isOwner && member.userId !== user?.uid ? (
                    <select
                      value={member.role}
                      onChange={(event) =>
                        handleRoleChange(member.userId, event.target.value as TreeRole)
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
                <td className="card-list__actions">
                  {isOwner && accounts.get(member.userId)?.email && (
                    <button
                      type="button"
                      className="button"
                      onClick={() => handlePasswordReset(member.userId)}
                    >
                      パスワード再設定
                    </button>
                  )}
                  {(isOwner || member.userId === user?.uid) && (
                    <button
                      type="button"
                      className="button button--danger"
                      onClick={() => handleRemove(member.userId)}
                    >
                      {member.userId === user?.uid ? '脱退' : '削除'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          メールアドレスが見えるのはオーナーだけです。
          <strong>パスワードは誰にも見えません</strong>
          （再設定を押すと、本人あてに設定し直すメールが届きます）。
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

            <label className="field field--checkbox form__wide">
              <input
                type="checkbox"
                checked={shared}
                onChange={(event) => {
                  setShared(event.target.checked);
                  if (event.target.checked) setInviteEmail('');
                }}
              />
              <span>期限まで何人でも使える共通リンクにする（家族へまとめて配る）</span>
            </label>

            {!shared && (
              <label className="field field--grow">
                <span className="field__label">宛先メール（この人だけが1回使えます）</span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="relative@example.com"
                />
              </label>
            )}

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
                      {!invitation.acceptedAt && !invitation.revokedAt && (
                        <button
                          type="button"
                          className="button"
                          onClick={async () => {
                            await api.revokeInvitation(treeId, invitation.id);
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
  if (invitation.revokedAt) return '取り消し済み';
  if (invitation.acceptedAt) return '受諾済み';
  if (!invitation.expiresAt) return '—';
  const expiresAt = new Date(invitation.expiresAt);
  if (expiresAt < new Date()) return '期限切れ';
  return `有効（${expiresAt.toLocaleDateString('ja-JP')}まで）`;
}
