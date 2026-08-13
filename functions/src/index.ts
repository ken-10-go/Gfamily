import { createHash, randomBytes } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten, type FirestoreEvent, type Change } from 'firebase-functions/v2/firestore';
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
    throw new HttpsError('permission-denied', '招待を操作する権限がありません');
  }
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
  const { treeId, role, email, validDays } = (request.data ?? {}) as {
    treeId?: string;
    role?: TreeRole;
    email?: string | null;
    validDays?: number;
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

  await db.collection(`trees/${treeId}/invitations`).add({
    tokenHash: hashToken(token),
    role,
    email: normalizedEmail,
    expiresAt,
    revokedAt: null,
    acceptedAt: null,
    acceptedBy: null,
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
  await db.runTransaction(async (tx) => {
    const current = await tx.get(invitation.ref);
    if (current.get('acceptedAt') || current.get('revokedAt')) {
      throw new HttpsError('not-found', '招待リンクが無効か、有効期限が切れています');
    }

    tx.update(treeRef, {
      [`roles.${uid}`]: role,
      memberIds: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(invitation.ref, {
      acceptedAt: FieldValue.serverTimestamp(),
      acceptedBy: uid,
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
  if (isExpired || invitation.get('revokedAt') || invitation.get('acceptedAt')) {
    return null;
  }

  return invitation;
}

// --- 監査ログ ---------------------------------------------------------------
//
// クライアントは auditLogs に書けない（ルールで全面禁止）。記録はここでのみ行うため、
// 「記録せずに編集する」ことができない。実行者はルールで詐称を防いだ updatedBy を使う。

function auditTrigger(collection: string) {
  return onDocumentWritten(
    { region: REGION, document: `trees/{treeId}/${collection}/{docId}` },
    async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { treeId: string; docId: string }>) => {
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
