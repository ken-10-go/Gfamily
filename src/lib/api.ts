import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { getDb, getFirebaseAuth, getFns } from '@/lib/firebase';
import type {
  AuditLog,
  CardPosition,
  Invitation,
  InvitationPreview,
  ParentChild,
  ParentKind,
  Person,
  PersonInput,
  Tree,
  TreeGraph,
  TreeRole,
  Union,
  UnionStatus,
} from '@/types/models';

/** 現在のユーザーID。未ログインで呼ばれたら書き込みを試みる前に落とす。 */
function requireUid(): string {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('ログインが必要です');
  return uid;
}

/** Firestore の Timestamp を ISO 文字列に寄せる。未確定（サーバー側で採番中）は null。 */
function toIso(value: unknown): string | null {
  if (!value) return null;
  const timestamp = value as Timestamp;
  return typeof timestamp.toDate === 'function' ? timestamp.toDate().toISOString() : null;
}

const treeDoc = (treeId: string) => doc(getDb(), 'trees', treeId);
const sub = (treeId: string, name: string) => collection(getDb(), 'trees', treeId, name);

// --- ツリー -----------------------------------------------------------------

function toTree(snapshot: QueryDocumentSnapshot<DocumentData>): Tree {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: data.name ?? '',
    description: data.description ?? null,
    createdBy: data.createdBy ?? '',
    roles: data.roles ?? {},
    memberIds: data.memberIds ?? [],
  };
}

export async function listTrees(): Promise<Tree[]> {
  const uid = requireUid();
  // memberIds での絞り込みはセキュリティルールと対になっている。
  // 条件を外すと他人のツリーが候補に入り、クエリごと拒否される。
  const snapshot = await getDocs(
    query(collection(getDb(), 'trees'), where('memberIds', 'array-contains', uid)),
  );
  return snapshot.docs.map(toTree);
}

export async function getTree(treeId: string): Promise<Tree> {
  const snapshot = await getDoc(treeDoc(treeId));
  if (!snapshot.exists()) throw new Error('家系図が見つかりません');
  return toTree(snapshot as QueryDocumentSnapshot<DocumentData>);
}

export async function createTree(name: string, description?: string): Promise<string> {
  const uid = requireUid();
  const ref = doc(collection(getDb(), 'trees'));

  await setDoc(ref, {
    name,
    description: description?.trim() || null,
    createdBy: uid,
    roles: { [uid]: 'owner' satisfies TreeRole },
    memberIds: [uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function updateTree(
  treeId: string,
  patch: { name?: string; description?: string | null },
): Promise<void> {
  await updateDoc(treeDoc(treeId), { ...patch, updatedAt: serverTimestamp() });
}

/**
 * 家系図を配下のデータごと削除する。
 * サブコレクションを残さず消すため Cloud Functions 経由で行う。
 */
export async function deleteTree(treeId: string): Promise<void> {
  const call = httpsCallable<{ treeId: string }, { ok: boolean }>(getFns(), 'deleteTree');
  await call({ treeId });
}

/** ログイン中のユーザーがそのツリーで持つ権限。 */
export async function getMyRole(treeId: string): Promise<TreeRole | null> {
  const uid = requireUid();
  const tree = await getTree(treeId);
  return tree.roles[uid] ?? null;
}

// --- ツリーの中身（人物と関係） ----------------------------------------------

/** 家系図の描画に必要なデータを一括で取得する。 */
export async function loadTreeGraph(treeId: string): Promise<TreeGraph> {
  const [persons, parentChild, unions] = await Promise.all([
    getDocs(sub(treeId, 'persons')),
    getDocs(sub(treeId, 'parentChild')),
    getDocs(sub(treeId, 'unions')),
  ]);

  const alive = <T extends { deletedAt: string | null }>(items: T[]) =>
    items.filter((item) => !item.deletedAt);

  return {
    persons: alive(persons.docs.map(toPerson)),
    parentChild: alive(parentChild.docs.map(toParentChild)),
    unions: alive(unions.docs.map(toUnion)),
  };
}

function toPerson(snapshot: QueryDocumentSnapshot<DocumentData>): Person {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    familyName: data.familyName ?? null,
    givenName: data.givenName ?? null,
    familyNameKana: data.familyNameKana ?? null,
    givenNameKana: data.givenNameKana ?? null,
    maidenName: data.maidenName ?? null,
    gender: data.gender ?? 'unknown',
    birthDate: data.birthDate ?? null,
    deathDate: data.deathDate ?? null,
    birthPlace: data.birthPlace ?? null,
    note: data.note ?? null,
    isLiving: data.isLiving ?? true,
    birthOrder: data.birthOrder ?? null,
    siblingOrder: typeof data.siblingOrder === 'number' ? data.siblingOrder : null,
    position:
      data.position && typeof data.position.x === 'number' && typeof data.position.y === 'number'
        ? { x: data.position.x, y: data.position.y }
        : null,
    // 既存データには存在しない項目なので、既定値を補って読み出す
    surnameHistory: (data.surnameHistory ?? []) as Person['surnameHistory'],
    deletedAt: toIso(data.deletedAt),
  };
}

function toParentChild(snapshot: QueryDocumentSnapshot<DocumentData>): ParentChild {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    parentId: data.parentId,
    childId: data.childId,
    kind: data.kind ?? 'biological',
    deletedAt: toIso(data.deletedAt),
  };
}

function toUnion(snapshot: QueryDocumentSnapshot<DocumentData>): Union {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    partner1Id: data.partner1Id,
    partner2Id: data.partner2Id,
    status: data.status ?? 'married',
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    deletedAt: toIso(data.deletedAt),
  };
}

/**
 * 空文字を null に寄せる。
 * updatedBy はセキュリティルールで「自分自身であること」を強制されており、監査ログの実行者になる。
 */
function personPayload(input: PersonInput, uid: string) {
  const blankToNull = (value: string | null) => value?.trim() || null;

  return {
    familyName: blankToNull(input.familyName),
    givenName: blankToNull(input.givenName),
    familyNameKana: blankToNull(input.familyNameKana),
    givenNameKana: blankToNull(input.givenNameKana),
    maidenName: blankToNull(input.maidenName),
    gender: input.gender,
    birthDate: input.birthDate || null,
    // 存命なら没年月日は保持しない
    deathDate: input.isLiving ? null : input.deathDate || null,
    birthPlace: blankToNull(input.birthPlace),
    note: blankToNull(input.note),
    isLiving: input.isLiving,
    birthOrder: blankToNull(input.birthOrder),
    surnameHistory: (input.surnameHistory ?? [])
      .filter((record) => record.familyName.trim())
      .map((record) => ({
        familyName: record.familyName.trim(),
        date: record.date || null,
        reason: record.reason,
        note: blankToNull(record.note),
      })),
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  };
}

export async function createPerson(treeId: string, input: PersonInput): Promise<Person> {
  const uid = requireUid();
  const ref = await addDoc(sub(treeId, 'persons'), {
    ...personPayload(input, uid),
    deletedAt: null,
    createdAt: serverTimestamp(),
  });

  const snapshot = await getDoc(ref);
  return toPerson(snapshot as QueryDocumentSnapshot<DocumentData>);
}

export async function updatePerson(
  treeId: string,
  personId: string,
  input: PersonInput,
): Promise<void> {
  const uid = requireUid();
  await updateDoc(doc(getDb(), 'trees', treeId, 'persons', personId), personPayload(input, uid));
}

/**
 * ドラッグで動かしたカードの位置を保存する。
 * null を渡すと手動配置を捨てて自動レイアウトに戻る。
 */
export async function setPersonPosition(
  treeId: string,
  personId: string,
  position: CardPosition | null,
): Promise<void> {
  const uid = requireUid();
  await updateDoc(doc(getDb(), 'trees', treeId, 'persons', personId), {
    position,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

/**
 * きょうだいの並び順をまとめて保存する。
 *
 * 渡された順に 0,1,2… を振り直す。1人だけ動かしても他の人物との前後関係が変わるため、
 * グループ全員を1回の書き込みでそろえる。
 */
export async function setSiblingOrder(treeId: string, orderedIds: string[]): Promise<void> {
  const uid = requireUid();
  const batch = writeBatch(getDb());

  orderedIds.forEach((personId, index) => {
    batch.update(doc(getDb(), 'trees', treeId, 'persons', personId), {
      siblingOrder: index,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

/** 手動の並び順を捨てて、生年順の自動整列に戻す。 */
export async function clearSiblingOrder(treeId: string, personIds: string[]): Promise<void> {
  const uid = requireUid();
  const batch = writeBatch(getDb());

  for (const personId of personIds) {
    batch.update(doc(getDb(), 'trees', treeId, 'persons', personId), {
      siblingOrder: null,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

/** ソフト削除。ゴミ箱から復元できる（要件定義書 3.2）。 */
export async function softDeletePerson(treeId: string, personId: string): Promise<void> {
  const uid = requireUid();
  await updateDoc(doc(getDb(), 'trees', treeId, 'persons', personId), {
    deletedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function restorePerson(treeId: string, personId: string): Promise<void> {
  const uid = requireUid();
  await updateDoc(doc(getDb(), 'trees', treeId, 'persons', personId), {
    deletedAt: null,
    updatedBy: uid,
  });
}

export async function listDeletedPersons(treeId: string): Promise<Person[]> {
  const snapshot = await getDocs(sub(treeId, 'persons'));
  return snapshot.docs.map(toPerson).filter((person) => person.deletedAt);
}

// --- 関係 -------------------------------------------------------------------

export async function addParentChild(
  treeId: string,
  parentId: string,
  childId: string,
  kind: ParentKind = 'biological',
): Promise<void> {
  const uid = requireUid();
  await addDoc(sub(treeId, 'parentChild'), {
    parentId,
    childId,
    kind,
    deletedAt: null,
    updatedBy: uid,
    createdAt: serverTimestamp(),
  });
}

export async function removeParentChild(treeId: string, id: string): Promise<void> {
  const uid = requireUid();
  await updateDoc(doc(getDb(), 'trees', treeId, 'parentChild', id), {
    deletedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

export async function addUnion(
  treeId: string,
  partner1Id: string,
  partner2Id: string,
  status: UnionStatus = 'married',
): Promise<void> {
  const uid = requireUid();
  await addDoc(sub(treeId, 'unions'), {
    partner1Id,
    partner2Id,
    status,
    startDate: null,
    endDate: null,
    deletedAt: null,
    updatedBy: uid,
    createdAt: serverTimestamp(),
  });
}

export async function removeUnion(treeId: string, id: string): Promise<void> {
  const uid = requireUid();
  await updateDoc(doc(getDb(), 'trees', treeId, 'unions', id), {
    deletedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

// --- メンバーと招待 ----------------------------------------------------------

export interface MemberEntry {
  userId: string;
  role: TreeRole;
}

export async function listMembers(treeId: string): Promise<MemberEntry[]> {
  const tree = await getTree(treeId);
  return Object.entries(tree.roles).map(([userId, role]) => ({ userId, role }));
}

/**
 * 権限を変更する。roles と memberIds はセキュリティルールで整合性を強制しているため、
 * 常に両方をまとめて書き換える。
 */
export async function updateMemberRole(
  treeId: string,
  userId: string,
  role: TreeRole,
): Promise<void> {
  const tree = await getTree(treeId);
  const roles = { ...tree.roles, [userId]: role };

  await updateDoc(treeDoc(treeId), {
    roles,
    memberIds: Object.keys(roles),
    updatedAt: serverTimestamp(),
  });
}

export async function removeMember(treeId: string, userId: string): Promise<void> {
  const tree = await getTree(treeId);
  const roles = { ...tree.roles };
  delete roles[userId];

  await updateDoc(treeDoc(treeId), {
    roles,
    memberIds: Object.keys(roles),
    updatedAt: serverTimestamp(),
  });
}

export async function listInvitations(treeId: string): Promise<Invitation[]> {
  const snapshot = await getDocs(query(sub(treeId, 'invitations'), orderBy('createdAt', 'desc')));

  return snapshot.docs.map((entry) => {
    const data = entry.data();
    return {
      id: entry.id,
      email: data.email ?? null,
      role: data.role,
      expiresAt: toIso(data.expiresAt),
      revokedAt: toIso(data.revokedAt),
      acceptedAt: toIso(data.acceptedAt),
      acceptedBy: data.acceptedBy ?? null,
      createdAt: toIso(data.createdAt),
    };
  });
}

/** 招待を発行し、平文トークンを返す。この値はこの1回しか取得できない。 */
export async function createInvitation(
  treeId: string,
  role: Exclude<TreeRole, 'owner'>,
  email: string | null,
  validDays = 7,
): Promise<string> {
  const call = httpsCallable<
    { treeId: string; role: TreeRole; email: string | null; validDays: number },
    { token: string }
  >(getFns(), 'createInvitation');

  const result = await call({ treeId, role, email, validDays });
  return result.data.token;
}

export async function revokeInvitation(treeId: string, invitationId: string): Promise<void> {
  const call = httpsCallable<{ treeId: string; invitationId: string }, { ok: boolean }>(
    getFns(),
    'revokeInvitation',
  );
  await call({ treeId, invitationId });
}

export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  const call = httpsCallable<{ token: string }, InvitationPreview | null>(
    getFns(),
    'previewInvitation',
  );
  const result = await call({ token });
  return result.data;
}

/** 招待を受諾する。成功するとツリーIDを返す。 */
export async function acceptInvitation(token: string): Promise<string> {
  const call = httpsCallable<{ token: string }, { treeId: string }>(getFns(), 'acceptInvitation');
  const result = await call({ token });
  return result.data.treeId;
}

// --- 変更履歴 ---------------------------------------------------------------

export async function listAuditLogs(treeId: string, max = 100): Promise<AuditLog[]> {
  const snapshot = await getDocs(
    query(sub(treeId, 'auditLogs'), orderBy('createdAt', 'desc'), fsLimit(max)),
  );

  return snapshot.docs.map((entry) => {
    const data = entry.data();
    return {
      id: entry.id,
      actorId: data.actorId ?? null,
      entity: data.entity ?? '',
      entityId: data.entityId ?? null,
      action: data.action,
      createdAt: toIso(data.createdAt),
    };
  });
}
