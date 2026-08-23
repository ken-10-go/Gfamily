import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '@/features/auth/useAuth';
import * as api from '@/lib/api';
import type { MemberEntry } from '@/lib/api';
import { isNicknameAccount } from '@/lib/nickname';
import { ROLE_LABELS, type Invitation, type TreeRole } from '@/types/models';

export function MembersPage() {
  const { treeId = '' } = useParams();
  const { user, sendPasswordReset } = useAuth();
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [role, setRole] = useState<TreeRole | null>(null);
  /** uid → ログインに使っているアカウント。オーナーのときだけ引ける */
  const [accounts, setAccounts] = useState<Map<string, api.MemberAccount>>(new Map());
  /** uid → 呼び名。誰でも読める。オーナー以外はこれだけで人を見分ける */
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteRole, setInviteRole] = useState<Exclude<TreeRole, 'owner'>>('viewer');
  const [inviteEmail, setInviteEmail] = useState('');
  const [validDays, setValidDays] = useState(7);
  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  /** 期限まで何人でも使える共通のリンクにするか */
  const [shared, setShared] = useState(true);
  /** 何のために配るリンクかの覚え書き。リンクが増えたときに見分けるためのもの */
  const [inviteLabel, setInviteLabel] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  /** 発行した仮のパスワード。画面を離れるまでのあいだだけ出す */
  const [temporary, setTemporary] = useState<{ name: string; password: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const myRole = await api.getMyRole(treeId);
      setRole(myRole);
      const list = await api.listMembers(treeId);
      setMembers(list);
      setNicknames(await api.listNicknames(list.map((member) => member.userId)));
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
   * パスワードを設定し直す手立て。相手の入り方で分かれる。
   *
   * ・メールアドレスで使っている人 … 本人あてに再設定メールを送る（誰にも中身は見えない）
   * ・ニックネームで使っている人 … メールが届かないので、**仮のパスワードを1度だけ出す**。
   *   オーナーが電話や口頭など別の手段で伝え、受け取った人は設定で変える。
   */
  async function handlePasswordReset(userId: string) {
    const account = accounts.get(userId);
    if (!account) return;

    const name = nameOf(userId);
    setError(null);
    setNotice(null);
    setTemporary(null);

    try {
      if (account.email && !isNicknameAccount(account.email)) {
        if (!window.confirm(`${account.email} 宛に、パスワードを設定し直すメールを送ります。`)) {
          return;
        }
        await sendPasswordReset(account.email);
        setNotice(`${account.email} に再設定メールを送りました。`);
        return;
      }

      if (!window.confirm(`${name} さんのパスワードを、仮のものに置き換えます。`)) return;

      const password = await api.resetMemberPassword(treeId, userId);
      setTemporary({ name, password });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'パスワードを変えられませんでした');
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
        inviteLabel.trim() || null,
      );
      setIssuedLink(inviteUrl(token));
      setInviteEmail('');
      setInviteLabel('');
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

  /**
   * 画面に出す呼び名。自分で決めた名前があればそれを使う。
   * 決めていない人は、登録時の名前（表示名）→「名前未設定」の順に落とす。
   */
  const nameOf = (userId: string) =>
    nicknames.get(userId) ?? accounts.get(userId)?.displayName ?? '（名前未設定）';

  /**
   * この人がどの招待リンクから入ったか。
   *
   * 共通リンクは何人も通るので、「誰がどの配布から来たのか」は
   * 招待の側に残した `acceptedUids` からしか辿れない。
   */
  const joinedViaOf = (userId: string) => {
    const from = invitations.find((entry) => entry.acceptedUids.includes(userId));
    if (!from) return '—';
    if (from.label) return from.label;
    if (from.email) return `${from.email} 宛の招待`;
    const issued = from.createdAt ? new Date(from.createdAt).toLocaleDateString('ja-JP') : '';
    return issued ? `${issued}発行の共通リンク` : '共通リンク';
  };

  /** ログインに使っている名前。オーナーの管理画面にだけ出す */
  const accountNameOf = (userId: string) => {
    const email = accounts.get(userId)?.email;
    if (!email) return `${userId.slice(0, 8)}…`;
    // ニックネームのために作ったアドレスは、@ より前だけを出す（尻尾は共通で意味がない）
    return isNicknameAccount(email) ? email.split('@')[0] : email;
  };

  return (
    <main className="page">
      <Link to={`/trees/${treeId}`} className="tree-page__back">
        ← 家系図に戻る
      </Link>
      <h1>メンバーと招待</h1>

      {error && <p className="alert alert--error">{error}</p>}
      {notice && <p className="note">{notice}</p>}
      {temporary && (
        <div className="alert alert--success">
          <p>
            <strong>{temporary.name}</strong> さんの仮のパスワードです。
            この場でしか出ないので、電話などで本人へ伝えてください。
          </p>
          <p>
            <code>{temporary.password}</code>
          </p>
          <p className="note">受け取った方は、設定の「パスワードを変える」で決め直せます。</p>
        </div>
      )}

      <section>
        <h2>メンバー</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ユーザー</th>
              {isOwner && <th>参加のきっかけ</th>}
              <th>権限</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.userId}>
                <td>
                  {/* 呼び名で見分ける。ログインに使う名前はオーナーにだけ出す */}
                  <strong>{nameOf(member.userId)}</strong>
                  {member.userId === user?.uid && <span className="badge">自分</span>}
                  {isOwner && accounts.has(member.userId) && (
                    <>
                      <br />
                      <span className="note">
                        <code>{accountNameOf(member.userId)}</code>
                        {accounts.get(member.userId)?.providers.includes('google.com')
                          ? '（Google）'
                          : '（パスワード）'}
                      </span>
                    </>
                  )}
                </td>
                {isOwner && (
                  <td>
                    <span className="note">{joinedViaOf(member.userId)}</span>
                  </td>
                )}
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
                  {/*
                    パスワードで入っている人にだけ出す。
                    Google の人のパスワードはこちらでは扱えない（向こうの持ち物）。
                  */}
                  {isOwner &&
                    member.userId !== user?.uid &&
                    accounts.get(member.userId)?.providers.includes('password') && (
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
          一覧に出るのは、それぞれが設定に入れた呼び名です（設定 → 呼び名で変えられます）。
          <strong>ログインに使う名前が見えるのはオーナーだけ</strong>で、
          <strong>パスワードは誰にも見えません</strong>。
          忘れた人には、メールで使っている方には再設定メールを、
          ニックネームで使っている方には仮のパスワードを出せます。
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

            <label className="field field--grow">
              <span className="field__label">覚え書き（任意・どこへ配るか）</span>
              <input
                type="text"
                maxLength={30}
                value={inviteLabel}
                onChange={(event) => setInviteLabel(event.target.value)}
                placeholder="叔父さん一家へ"
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
              <p>
                招待リンクを発行しました。共通リンクは下の一覧からいつでも見直せます
                （宛先つきの招待はこの1回だけの表示です）。
              </p>
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
                  <th>宛先・覚え書き</th>
                  <th>参加した人</th>
                  <th>状態</th>
                  <th>リンク</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td>{ROLE_LABELS[invitation.role]}</td>
                    <td>
                      {invitation.label ? (
                        <strong>{invitation.label}</strong>
                      ) : (
                        (invitation.email ?? '（リンクを知っている人）')
                      )}
                      {invitation.label && invitation.email && (
                        <>
                          <br />
                          <span className="note">{invitation.email}</span>
                        </>
                      )}
                    </td>
                    <td>
                      {invitation.acceptedUids.length === 0 ? (
                        <span className="note">まだ誰も</span>
                      ) : (
                        invitation.acceptedUids.map((uid) => nameOf(uid)).join('、')
                      )}
                    </td>
                    <td>{invitationStatus(invitation)}</td>
                    <td>
                      {invitation.token && isUsable(invitation) ? (
                        <div className="invite-link">
                          <code className="token">{inviteUrl(invitation.token)}</code>
                          <button
                            type="button"
                            className="button"
                            onClick={() =>
                              navigator.clipboard?.writeText(inviteUrl(invitation.token ?? ''))
                            }
                          >
                            コピー
                          </button>
                        </div>
                      ) : (
                        <span className="note">
                          {invitation.shared ? '発行時のみ表示' : '（宛先つき）'}
                        </span>
                      )}
                    </td>
                    <td>
                      {!invitation.acceptedAt && !invitation.revokedAt && (
                        <button
                          type="button"
                          className="button"
                          onClick={async () => {
                            if (!window.confirm('この招待リンクを使えなくしますか？')) return;
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

/** 招待トークンから、配る URL を組み立てる。 */
function inviteUrl(token: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}invite/${token}`;
}

/** まだ使える招待か（取り消し済み・使い切り・期限切れでない）。 */
function isUsable(invitation: Invitation): boolean {
  if (invitation.revokedAt) return false;
  if (!invitation.shared && invitation.acceptedAt) return false;
  if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) return false;
  return true;
}

function invitationStatus(invitation: Invitation): string {
  if (invitation.revokedAt) return '取り消し済み';
  if (invitation.acceptedAt) return '受諾済み';
  const used =
    invitation.shared && invitation.acceptedCount > 0
      ? `・${invitation.acceptedCount}人が使用`
      : '';
  if (!invitation.expiresAt) return `—${used}`;
  const expiresAt = new Date(invitation.expiresAt);
  if (expiresAt < new Date()) return `期限切れ${used}`;
  return `有効（${expiresAt.toLocaleDateString('ja-JP')}まで）${used}`;
}
