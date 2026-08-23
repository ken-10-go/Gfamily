import { createHash, randomBytes } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  onDocumentWritten,
  type FirestoreEvent,
  type Change,
} from 'firebase-functions/v2/firestore';
import type { DocumentSnapshot } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

const REGION = 'asia-northeast1';
const MAX_VALID_DAYS = 30;

type TreeRole = 'owner' | 'editor' | 'viewer';

const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

/** 呼び出し元の uid を取り出す。未ログインなら弾く。 */
function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'ログインが必要です');
  }
  return auth.uid;
}

async function requireOwner(treeId: string, uid: string): Promise<void> {
  const snapshot = await db.doc(`trees/${treeId}`).get();
  if (!snapshot.exists) {
    throw new HttpsError('not-found', '家系図が見つかりません');
  }
  const roles = (snapshot.get('roles') ?? {}) as Record<string, TreeRole>;
  if (roles[uid] !== 'owner') {
    throw new HttpsError('permission-denied', 'この操作を行う権限がありません');
  }
}

/** ツリーのメンバー全員の uid。ブリッジの閲覧許可を配るのに使う。 */
async function memberIdsOf(treeId: string): Promise<string[]> {
  const snapshot = await db.doc(`trees/${treeId}`).get();
  return (snapshot.get('memberIds') ?? []) as string[];
}

/**
 * 家系図を、配下の人物・関係・招待・監査ログごと完全に削除する。
 *
 * Firestore はドキュメントを消してもサブコレクションが残る。クライアントから
 * ツリー文書だけを削除すると、個人情報が「誰からも見えないが消えてもいない」状態で
 * 残り続けてしまうため、削除はここに集約している（ルール側でも直接削除を禁じている）。
 */
export const deleteTree = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const { treeId } = (request.data ?? {}) as { treeId?: string };

  if (!treeId) {
    throw new HttpsError('invalid-argument', '家系図が指定されていません');
  }

  await requireOwner(treeId, uid);

  const treeRef = db.doc(`trees/${treeId}`);

  // ツリー文書を先に消す。配下の削除で監査ログのトリガーが発火するが、
  // トリガー側は親ツリーの不在を見て記録をやめるため、新しいログが増えない。
  await treeRef.delete();
  await db.recursiveDelete(treeRef);

  // トリガーが動き終わるまで待ってから、取りこぼしを掃除する。
  // 監査ログには削除された人物の氏名や生年月日が入っているため、残してはいけない。
  await new Promise((resolve) => setTimeout(resolve, 3000));
  await db.recursiveDelete(treeRef);

  return { ok: true };
});

/**
 * 招待を発行し、平文トークンを1度だけ返す。
 * DB にはハッシュしか保存しないので、Firestore が漏洩してもトークンは復元できない。
 */
export const createInvitation = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const { treeId, role, email, validDays, shared } = (request.data ?? {}) as {
    treeId?: string;
    role?: TreeRole;
    email?: string | null;
    validDays?: number;
    /** 期限までなら何人でも使えるリンクにするか（家族へまとめて配るとき） */
    shared?: boolean;
  };

  if (!treeId) {
    throw new HttpsError('invalid-argument', '家系図が指定されていません');
  }
  // オーナー権限の招待は作らせない。オーナーの委譲はメンバー管理から明示的に行う。
  if (role !== 'viewer' && role !== 'editor') {
    throw new HttpsError('invalid-argument', '権限は閲覧者か編集者を指定してください');
  }
  const days = validDays ?? 7;
  if (!Number.isInteger(days) || days < 1 || days > MAX_VALID_DAYS) {
    throw new HttpsError('invalid-argument', `有効期限は1〜${MAX_VALID_DAYS}日で指定してください`);
  }

  await requireOwner(treeId, uid);

  const normalizedEmail = email?.trim().toLowerCase() || null;

  // 宛先が分かっている招待は、その人のアカウントを先に用意しておく。
  //
  // 本番プロジェクトでは自己サインアップを無効化しているため（disabledUserSignup）、
  // アカウントが存在しない人は Google ログインもできない。招待時に枠を作っておくことで、
  // 「招待された人だけが Google でログインできる」状態になる。
  if (normalizedEmail) {
    await ensureUserExists(normalizedEmail);
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);

  /*
   * 宛先を決めた招待は1人で使い切り。共通のリンクは期限まで何人でも使える。
   * 家族へまとめて配るときは、1人ずつリンクを作るより共通のほうが現実的で、
   * 期限を短くしておけば配りっぱなしの危険も抑えられる。
   */
  const isShared = Boolean(shared) && !normalizedEmail;

  await db.collection(`trees/${treeId}/invitations`).add({
    tokenHash: hashToken(token),
    role,
    email: normalizedEmail,
    shared: isShared,
    expiresAt,
    revokedAt: null,
    acceptedAt: null,
    acceptedBy: null,
    acceptedCount: 0,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { token };
});

/**
 * 招待先のアカウントを用意する。既にあれば何もしない。
 *
 * パスワードは設定しない。招待された人は Google ログイン、またはログインリンクで入る。
 * 既存アカウントに同じメールアドレスの Google ログインを行うと、新規作成ではなく
 * そのアカウントに紐づくことをエミュレータで確認済み。
 */
async function ensureUserExists(email: string): Promise<void> {
  try {
    await getAuth().getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') {
      await getAuth().createUser({ email, emailVerified: false });
      return;
    }
    throw error;
  }
}

/**
 * メンバーの一覧に、ログインに使っているメールアドレスを添えて返す。
 *
 * Firestore には uid しか持っていないので、誰なのかを画面で見分けられない。
 * 突き合わせは Admin SDK にしかできないため、ここで行う。
 * **パスワードは扱わない**（Firebase も生のパスワードを持たない）。
 * オーナーだけが呼べる。
 */
export const listMemberAccounts = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const { treeId } = (request.data ?? {}) as { treeId?: string };
  if (!treeId) {
    throw new HttpsError('invalid-argument', '家系図が指定されていません');
  }

  await requireOwner(treeId, uid);

  const ids = await memberIdsOf(treeId);
  if (ids.length === 0) return { members: [] };

  const found = await getAuth().getUsers(ids.map((id) => ({ uid: id })));
  const byUid = new Map(found.users.map((user) => [user.uid, user]));

  return {
    members: ids.map((id) => {
      const user = byUid.get(id);
      return {
        uid: id,
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
        // どの入り方で使っているか（Google か、メールとパスワードか）
        providers: user?.providerData.map((entry) => entry.providerId) ?? [],
        lastSignInAt: user?.metadata.lastSignInTime ?? null,
        disabled: user?.disabled ?? false,
      };
    }),
  };
});

/**
 * メンバーのログインを止める／戻す。
 *
 * 抜けてもらうだけならメンバーから外せばよいが、
 * 「アカウントごと使えなくしたい」ときのための手立て。オーナーだけが呼べる。
 */
export const setMemberDisabled = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const { treeId, targetUid, disabled } = (request.data ?? {}) as {
    treeId?: string;
    targetUid?: string;
    disabled?: boolean;
  };

  if (!treeId || !targetUid) {
    throw new HttpsError('invalid-argument', '対象が指定されていません');
  }
  if (targetUid === uid) {
    throw new HttpsError('invalid-argument', '自分のアカウントは止められません');
  }

  await requireOwner(treeId, uid);

  const ids = await memberIdsOf(treeId);
  if (!ids.includes(targetUid)) {
    throw new HttpsError('permission-denied', 'この家系図のメンバーではありません');
  }

  await getAuth().updateUser(targetUid, { disabled: Boolean(disabled) });
  return { ok: true };
});

/**
 * メンバーのパスワードを、仮のものに置き換える。
 *
 * ニックネームで使っている人にはメールが届かないので、再設定メールを送れない。
 * 代わりにオーナーが仮のパスワードを発行し、**電話や口頭など別の手段で**本人へ伝える。
 * 返すのはこの1回だけで、どこにも残さない。受け取った人は設定で変えられる。
 *
 * オーナーだけが呼べる。自分自身には使えない（締め出しを防ぐ）。
 */
export const resetMemberPassword = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const { treeId, targetUid } = (request.data ?? {}) as { treeId?: string; targetUid?: string };

  if (!treeId || !targetUid) {
    throw new HttpsError('invalid-argument', '対象が指定されていません');
  }
  if (targetUid === uid) {
    throw new HttpsError('invalid-argument', '自分のパスワードは設定から変えてください');
  }

  await requireOwner(treeId, uid);

  const ids = await memberIdsOf(treeId);
  if (!ids.includes(targetUid)) {
    throw new HttpsError('permission-denied', 'この家系図のメンバーではありません');
  }

  // 読み上げて伝えることがあるので、見間違えの多い文字（0/O・1/l）は使わない
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  const password = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');

  await getAuth().updateUser(targetUid, { password });
  return { password };
});

export const revokeInvitation = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const { treeId, invitationId } = (request.data ?? {}) as {
    treeId?: string;
    invitationId?: string;
  };

  if (!treeId || !invitationId) {
    throw new HttpsError('invalid-argument', '招待が指定されていません');
  }

  await requireOwner(treeId, uid);
  await db.doc(`trees/${treeId}/invitations/${invitationId}`).update({
    revokedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

/**
 * 招待リンクを開いた時点の表示用。ツリー名と権限だけを返し、個人情報は返さない。
 * 受諾者はまだメンバーではなくルール上 invitations を読めないため、ここで代行する。
 */
export const previewInvitation = onCall({ region: REGION }, async (request) => {
  requireUid(request.auth);
  const { token } = (request.data ?? {}) as { token?: string };
  if (!token) {
    throw new HttpsError('invalid-argument', 'トークンがありません');
  }

  const invitation = await findValidInvitation(token);
  if (!invitation) return null;

  const tree = await invitation.ref.parent.parent?.get();

  return {
    treeName: (tree?.get('name') as string | undefined) ?? '',
    role: invitation.get('role') as TreeRole,
    requiresEmail: (invitation.get('email') as string | null) ?? null,
  };
});

/** 招待を受諾してメンバーになる。成功するとツリーIDを返す。 */
export const acceptInvitation = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const { token } = (request.data ?? {}) as { token?: string };
  if (!token) {
    throw new HttpsError('invalid-argument', 'トークンがありません');
  }

  const invitation = await findValidInvitation(token);
  // 招待が存在しない場合と失効している場合で応答を変えない（トークン探索の手がかりを与えない）
  if (!invitation) {
    throw new HttpsError('not-found', '招待リンクが無効か、有効期限が切れています');
  }

  const requiredEmail = invitation.get('email') as string | null;
  if (requiredEmail && requiredEmail !== request.auth?.token.email?.toLowerCase()) {
    throw new HttpsError('permission-denied', 'この招待は別のメールアドレス宛です');
  }

  const treeRef = invitation.ref.parent.parent;
  if (!treeRef) {
    throw new HttpsError('internal', '招待の参照が壊れています');
  }
  const role = invitation.get('role') as TreeRole;

  // メンバー追加と受諾済みの記録は、二重受諾を防ぐためトランザクションでまとめる
  const isShared = invitation.get('shared') === true;

  await db.runTransaction(async (tx) => {
    const current = await tx.get(invitation.ref);
    // 共通のリンクは使い切らない。期限と取り消しだけで管理する
    if ((!isShared && current.get('acceptedAt')) || current.get('revokedAt')) {
      throw new HttpsError('not-found', '招待リンクが無効か、有効期限が切れています');
    }

    tx.update(treeRef, {
      [`roles.${uid}`]: role,
      memberIds: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(invitation.ref, {
      // 誰が最後に使ったかは記録するが、共通のリンクは閉じない
      acceptedAt: isShared ? (current.get('acceptedAt') ?? null) : FieldValue.serverTimestamp(),
      acceptedBy: uid,
      acceptedCount: FieldValue.increment(1),
      lastAcceptedAt: FieldValue.serverTimestamp(),
    });
    tx.set(treeRef.collection('auditLogs').doc(), {
      actorId: uid,
      entity: 'members',
      entityId: uid,
      action: 'insert',
      changes: { after: { role, via: 'invitation' } },
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { treeId: treeRef.id };
});

async function findValidInvitation(token: string): Promise<DocumentSnapshot | null> {
  const found = await db
    .collectionGroup('invitations')
    .where('tokenHash', '==', hashToken(token))
    .limit(1)
    .get();

  const invitation = found.docs[0];
  if (!invitation) return null;

  const expiresAt = invitation.get('expiresAt') as Timestamp | undefined;
  const isExpired = !expiresAt || expiresAt.toMillis() < Date.now();
  const usedUp = invitation.get('shared') !== true && invitation.get('acceptedAt');
  if (isExpired || invitation.get('revokedAt') || usedUp) {
    return null;
  }

  return invitation;
}

// --- 他家とのつながり（ダブル・ハンドシェイク） ------------------------------
//
// ⚠ この節の4つの関数は、いまアプリから呼ばれていない（デプロイもされていない）。
//   管理すべき家族の単位を決めるまでのあいだ、つながりは src/lib/api.ts の
//   connectTree / previewTree / revokeBridge がクライアントから直接作っている。
//   締め直すときの戻り先がここなので、消さずに残してある。
//   手順は firestore.rules の treeBridges のコメントを参照。
//
// A家とB家は既定では完全に別のデータ空間にいる。婚姻や養子縁組で系図がつながる
// ときだけ、双方のオーナーが承認して初めて「相手の故人だけを見られる」状態にする。
// 承認前・解除後は一切見えない。
//
// ルール側から1回の exists() で判定できるよう、承認時に
// /treeBridges/{treeId}_{uid} という認可用の文書を配る（grant と呼ぶ）。
// 解除時はこれを物理削除するので、権限は即座に失効する。

interface BridgeData {
  requesterTreeId: string;
  requesterPersonId: string;
  requesterUid: string;
  targetTreeId: string;
  targetPersonId: string;
  bridgeType: 'marriage' | 'adoptive';
  status: 'pending' | 'accepted' | 'rejected';
}

const grantId = (treeId: string, uid: string) => `${treeId}_${uid}`;

/**
 * 接続を申請し、相手に渡す合言葉（トークン）を1度だけ返す。
 * 招待と同じく、DB にはハッシュしか保存しない。
 */
export const createBridgeInvitation = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const { treeId, personId, bridgeType, validDays } = (request.data ?? {}) as {
    treeId?: string;
    personId?: string;
    bridgeType?: 'marriage' | 'adoptive';
    validDays?: number;
  };

  if (!treeId || !personId) {
    throw new HttpsError('invalid-argument', '接続の起点となる人物を指定してください');
  }
  if (bridgeType !== 'marriage' && bridgeType !== 'adoptive') {
    throw new HttpsError('invalid-argument', '接続の種類が正しくありません');
  }
  const days = validDays ?? 7;
  if (!Number.isInteger(days) || days < 1 || days > MAX_VALID_DAYS) {
    throw new HttpsError('invalid-argument', `有効期限は1〜${MAX_VALID_DAYS}日で指定してください`);
  }

  await requireOwner(treeId, uid);

  const person = await db.doc(`trees/${treeId}/persons/${personId}`).get();
  if (!person.exists || person.get('deletedAt')) {
    throw new HttpsError('not-found', '起点の人物が見つかりません');
  }

  const token = randomBytes(32).toString('hex');

  await db.collection('treeBridges').add({
    tokenHash: hashToken(token),
    requesterTreeId: treeId,
    requesterPersonId: personId,
    requesterUid: uid,
    // 相手は承認時に決まる。申請の時点では分からない
    targetTreeId: null,
    targetPersonId: null,
    bridgeType,
    status: 'pending',
    expiresAt: Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000),
    createdAt: FieldValue.serverTimestamp(),
    acceptedAt: null,
  });

  return { token };
});

/** 受け取った合言葉の中身を見る。承認する前に、どの家の誰との接続かを確かめるため。 */
export const previewBridgeInvitation = onCall({ region: REGION }, async (request) => {
  requireUid(request.auth);
  const { token } = (request.data ?? {}) as { token?: string };
  if (!token) {
    throw new HttpsError('invalid-argument', 'トークンがありません');
  }

  const bridge = await findValidBridge(token);
  if (!bridge) return null;

  const treeId = bridge.get('requesterTreeId') as string;
  const [tree, person] = await Promise.all([
    db.doc(`trees/${treeId}`).get(),
    db.doc(`trees/${treeId}/persons/${bridge.get('requesterPersonId')}`).get(),
  ]);

  return {
    treeName: (tree.get('name') as string | undefined) ?? '',
    personName: [person.get('familyName'), person.get('givenName')].filter(Boolean).join(' '),
    bridgeType: bridge.get('bridgeType') as 'marriage' | 'adoptive',
  };
});

/**
 * 接続を承認する。ここで初めて双方に「相手の故人を読める」許可が生まれる。
 * 承認できるのは接続先ツリーのオーナーだけ。
 */
export const acceptBridgeConnection = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const { token, treeId, personId } = (request.data ?? {}) as {
    token?: string;
    treeId?: string;
    personId?: string;
  };

  if (!token || !treeId || !personId) {
    throw new HttpsError('invalid-argument', '接続先の人物を指定してください');
  }

  await requireOwner(treeId, uid);

  const bridge = await findValidBridge(token);
  if (!bridge) {
    throw new HttpsError('not-found', '接続の合言葉が無効か、有効期限が切れています');
  }

  const data = bridge.data() as BridgeData;
  if (data.requesterTreeId === treeId) {
    throw new HttpsError('failed-precondition', '同じ家系図どうしはつなげません');
  }

  const person = await db.doc(`trees/${treeId}/persons/${personId}`).get();
  if (!person.exists || person.get('deletedAt')) {
    throw new HttpsError('not-found', '接続先の人物が見つかりません');
  }

  const [requesterMembers, targetMembers] = await Promise.all([
    memberIdsOf(data.requesterTreeId),
    memberIdsOf(treeId),
  ]);

  await db.runTransaction(async (tx) => {
    const current = await tx.get(bridge.ref);
    if (current.get('status') !== 'pending') {
      throw new HttpsError('failed-precondition', 'この申請はすでに処理済みです');
    }

    tx.update(bridge.ref, {
      targetTreeId: treeId,
      targetPersonId: personId,
      targetUid: uid,
      status: 'accepted',
      acceptedAt: FieldValue.serverTimestamp(),
      // 承認後にトークンを残す理由がない。使い回しも防ぐ
      tokenHash: FieldValue.delete(),
    });

    // 相手ツリーの故人を読むための許可を、双方のメンバー全員に配る
    for (const member of targetMembers) {
      tx.set(db.doc(`treeBridges/${grantId(data.requesterTreeId, member)}`), {
        grantForTreeId: data.requesterTreeId,
        grantedUid: member,
        bridgeId: bridge.id,
      });
    }
    for (const member of requesterMembers) {
      tx.set(db.doc(`treeBridges/${grantId(treeId, member)}`), {
        grantForTreeId: treeId,
        grantedUid: member,
        bridgeId: bridge.id,
      });
    }
  });

  return { bridgeId: bridge.id, treeId: data.requesterTreeId };
});

/**
 * 接続を解除する。どちらのオーナーからでも切れる。
 * 認可用の文書を物理削除するので、相手の画面からも即座に見えなくなる。
 */
export const revokeBridge = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const { bridgeId } = (request.data ?? {}) as { bridgeId?: string };
  if (!bridgeId) {
    throw new HttpsError('invalid-argument', '接続が指定されていません');
  }

  const bridge = await db.doc(`treeBridges/${bridgeId}`).get();
  if (!bridge.exists) {
    throw new HttpsError('not-found', '接続が見つかりません');
  }

  const data = bridge.data() as BridgeData;
  const isRequesterOwner = await isOwnerOf(data.requesterTreeId, uid);
  const isTargetOwner = data.targetTreeId ? await isOwnerOf(data.targetTreeId, uid) : false;
  if (!isRequesterOwner && !isTargetOwner) {
    throw new HttpsError('permission-denied', 'この接続を解除する権限がありません');
  }

  const [requesterMembers, targetMembers] = await Promise.all([
    memberIdsOf(data.requesterTreeId),
    data.targetTreeId ? memberIdsOf(data.targetTreeId) : Promise.resolve([]),
  ]);

  const batch = db.batch();
  batch.delete(bridge.ref);
  for (const member of targetMembers) {
    batch.delete(db.doc(`treeBridges/${grantId(data.requesterTreeId, member)}`));
  }
  for (const member of requesterMembers) {
    if (!data.targetTreeId) continue;
    batch.delete(db.doc(`treeBridges/${grantId(data.targetTreeId, member)}`));
  }
  await batch.commit();

  return { ok: true };
});

async function isOwnerOf(treeId: string, uid: string): Promise<boolean> {
  const snapshot = await db.doc(`trees/${treeId}`).get();
  const roles = (snapshot.get('roles') ?? {}) as Record<string, TreeRole>;
  return roles[uid] === 'owner';
}

async function findValidBridge(token: string): Promise<DocumentSnapshot | null> {
  const found = await db
    .collection('treeBridges')
    .where('tokenHash', '==', hashToken(token))
    .limit(1)
    .get();

  const bridge = found.docs[0];
  if (!bridge) return null;

  const expiresAt = bridge.get('expiresAt') as Timestamp | undefined;
  if (!expiresAt || expiresAt.toMillis() < Date.now()) return null;
  if (bridge.get('status') !== 'pending') return null;

  return bridge;
}

// --- 監査ログ ---------------------------------------------------------------
//
// クライアントは auditLogs に書けない（ルールで全面禁止）。記録はここでのみ行うため、
// 「記録せずに編集する」ことができない。実行者はルールで詐称を防いだ updatedBy を使う。

function auditTrigger(collection: string) {
  return onDocumentWritten(
    { region: REGION, document: `trees/{treeId}/${collection}/{docId}` },
    async (
      event: FirestoreEvent<
        Change<DocumentSnapshot> | undefined,
        { treeId: string; docId: string }
      >,
    ) => {
      const before = event.data?.before;
      const after = event.data?.after;
      const beforeData = before?.exists ? before.data() : undefined;
      const afterData = after?.exists ? after.data() : undefined;

      if (!beforeData && !afterData) return;

      // 家系図ごと削除された場合は記録しない。
      // ここで書いてしまうと、親ツリーが無いため誰も読めず消せもしない監査ログが残り、
      // その中身（氏名・生年月日など）が到達不能なまま保持され続けてしまう。
      const tree = await db.doc(`trees/${event.params.treeId}`).get();
      if (!tree.exists) return;

      let action: 'insert' | 'update' | 'delete' | 'restore';
      if (!beforeData) {
        action = 'insert';
      } else if (!afterData) {
        action = 'delete';
      } else if (!beforeData.deletedAt && afterData.deletedAt) {
        // ソフト削除・復元は update だが、履歴上は区別できたほうが分かりやすい
        action = 'delete';
      } else if (beforeData.deletedAt && !afterData.deletedAt) {
        action = 'restore';
      } else {
        action = 'update';
      }

      await db.collection(`trees/${event.params.treeId}/auditLogs`).add({
        actorId: (afterData?.updatedBy ?? beforeData?.updatedBy ?? null) as string | null,
        entity: collection,
        entityId: event.params.docId,
        action,
        changes: { before: beforeData ?? null, after: afterData ?? null },
        createdAt: FieldValue.serverTimestamp(),
      });
    },
  );
}

export const onPersonWritten = auditTrigger('persons');
export const onParentChildWritten = auditTrigger('parentChild');
export const onUnionWritten = auditTrigger('unions');
