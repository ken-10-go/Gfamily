import {
  addDoc,
  deleteDoc,
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

import { generateSalt } from '@/lib/crypto';
import { getDb, getFirebaseAuth, getFns } from '@/lib/firebase';
import {
  type AuditLog,
  type House,
  type CardPosition,
  type Invitation,
  type InvitationPreview,
  type ParentChild,
  type ParentKind,
  type Person,
  type PersonInput,
  type Tree,
  type TreeGraph,
  type TreeRole,
  type Union,
  type UnionStatus,
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
    e2eeSalt: data.e2eeSalt ?? null,
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
    // 機微項目の鍵を導くためのソルト。作成時に決め、以後変えない
    e2eeSalt: generateSalt(),
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
 * まだソルトを持たないツリーに、あとから付ける。
 *
 * 機微項目の暗号化を導入する前に作られたツリーのための処理。
 * すでにあるソルトは決して上書きしない（上書きすると、暗号化済みのデータを
 * 二度と復号できなくなる）。
 */
export async function ensureTreeSalt(treeId: string): Promise<string> {
  const tree = await getTree(treeId);
  if (tree.e2eeSalt) return tree.e2eeSalt;

  const salt = generateSalt();
  await updateDoc(treeDoc(treeId), { e2eeSalt: salt, updatedAt: serverTimestamp() });
  return salt;
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
    birthEra: (data.birthEra ?? null) as Person['birthEra'],
    deathEra: (data.deathEra ?? null) as Person['deathEra'],
    birthDateUncertain: data.birthDateUncertain ?? false,
    deathDateUncertain: data.deathDateUncertain ?? false,
    encryptedData: (data.encryptedData ?? null) as Person['encryptedData'],
    birthPlace: data.birthPlace ?? null,
    note: data.note ?? null,
    isLiving: data.isLiving ?? true,
    birthOrder: data.birthOrder ?? null,
    siblingOrder: typeof data.siblingOrder === 'number' ? data.siblingOrder : null,
    generationShift: typeof data.generationShift === 'number' ? data.generationShift : null,
    // houseId（単数）で保存された古いデータも読めるようにする
    houseIds: Array.isArray(data.houseIds)
      ? (data.houseIds as string[]).filter((id) => typeof id === 'string')
      : typeof data.houseId === 'string'
        ? [data.houseId]
        : [],
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
    // 戸籍に書かれていた和暦そのもの。西暦に直せない旧暦の月日を残すために持つ
    birthEra: input.birthEra ?? null,
    deathEra: input.isLiving ? null : (input.deathEra ?? null),
    birthDateUncertain: input.birthDateUncertain ?? false,
    deathDateUncertain: input.isLiving ? false : (input.deathDateUncertain ?? false),
    // 端末で暗号化済みの機微項目。サーバー側では中身を読めない
    encryptedData: input.encryptedData ?? null,
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
    houseIds: input.houseIds ?? [],
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

/**
 * ツリー全体を自動配置に戻す。
 *
 * 手で置いた座標をすべて捨てる。カードの大きさや表示項目を変えると
 * 昔の座標が今の図と合わなくなるため、まとめて戻せる入口を用意する。
 * 並び順（siblingOrder）は配置とは別の意味を持つので触らない。
 */
export async function clearAllPositions(treeId: string): Promise<number> {
  const uid = requireUid();
  const snapshot = await getDocs(sub(treeId, 'persons'));
  const placed = snapshot.docs.filter((entry) => entry.get('position'));
  if (placed.length === 0) return 0;

  // Firestore のバッチは1回500件まで。大きな家系図でも通るように分ける
  for (let from = 0; from < placed.length; from += 400) {
    const batch = writeBatch(getDb());
    for (const entry of placed.slice(from, from + 400)) {
      batch.update(entry.ref, { position: null, updatedBy: uid, updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }

  return placed.length;
}

/**
 * 段（世代の行）を手で何段ずらすかを保存する。0 を渡すと自動に戻る。
 *
 * 動かすのは本人だけ。親が子より下に来る指定はレイアウト側で無効になる。
 */
export async function setGenerationShift(
  treeId: string,
  personId: string,
  shift: number,
): Promise<void> {
  const uid = requireUid();
  await updateDoc(doc(getDb(), 'trees', treeId, 'persons', personId), {
    generationShift: shift === 0 ? null : shift,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

// --- 家（ツリーの中の、血のつながりでまとまった一群） --------------------------
//
// 既定では自動で判定するので、ここに登録するのは
// 「名前を付け直した」「人物の所属を手で決めた」家だけ。
// 登録が1件も無くても家系図は成り立つ。

/** 保存された家の一覧。名前順に返す。 */
export async function listHouses(treeId: string): Promise<House[]> {
  const snapshot = await getDocs(sub(treeId, 'houses'));

  return snapshot.docs
    .map((entry) => ({ id: entry.id, name: (entry.get('name') as string) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

/**
 * 家を登録する。自動判定のままでよければ呼ばなくてよい。
 * 自動で見つけた一群に名前を付けたいとき、その面々をまとめて所属させる。
 */
export async function createHouse(
  treeId: string,
  name: string,
  memberIds: string[] = [],
): Promise<string> {
  const uid = requireUid();
  const created = await addDoc(sub(treeId, 'houses'), {
    name,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });

  if (memberIds.length > 0) await setPersonHouses(treeId, memberIds, [created.id]);
  return created.id;
}

export async function renameHouse(treeId: string, houseId: string, name: string): Promise<void> {
  const uid = requireUid();
  await updateDoc(doc(getDb(), 'trees', treeId, 'houses', houseId), {
    name,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

/**
 * 家の登録を消す。所属していた人物は自動判定に戻る。
 * 人物そのものは消さない。
 */
export async function deleteHouse(treeId: string, houseId: string): Promise<void> {
  // その家に属している人から、この家だけを外す（他の所属は残す）
  const members = await getDocs(
    query(sub(treeId, 'persons'), where('houseIds', 'array-contains', houseId)),
  );
  for (const entry of members.docs) {
    const rest = ((entry.get('houseIds') as string[] | undefined) ?? []).filter(
      (id) => id !== houseId,
    );
    await setPersonHouses(treeId, [entry.id], rest);
  }
  await deleteDoc(doc(getDb(), 'trees', treeId, 'houses', houseId));
}

/**
 * 人物の所属する家を決める。空の配列を渡すと自動判定に戻る。
 *
 * 1人が複数の家に属してよい（生家と婚家など）。先頭が主たる家で、配置に使う。
 */
export async function setPersonHouses(
  treeId: string,
  personIds: string[],
  houseIds: string[],
): Promise<void> {
  if (personIds.length === 0) return;
  const uid = requireUid();

  // Firestore のバッチは1回500件まで。大きな家でも通るように分ける
  for (let from = 0; from < personIds.length; from += 400) {
    const batch = writeBatch(getDb());
    for (const personId of personIds.slice(from, from + 400)) {
      batch.update(doc(getDb(), 'trees', treeId, 'persons', personId), {
        houseIds,
        // 単数で持っていた頃の値が残っていると、古い読み方をする画面で食い違う
        houseId: null,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
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

// --- 他家とのつながり（ブリッジ） --------------------------------------------

export interface Bridge {
  id: string;
  requesterTreeId: string;
  requesterPersonId: string;
  targetTreeId: string | null;
  targetPersonId: string | null;
  bridgeType: 'marriage' | 'adoptive';
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string | null;
  acceptedAt: string | null;
}

export interface BridgePreview {
  treeName: string;
  personName: string;
  bridgeType: 'marriage' | 'adoptive';
}

function toBridge(snapshot: QueryDocumentSnapshot<DocumentData>): Bridge {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    requesterTreeId: data.requesterTreeId,
    requesterPersonId: data.requesterPersonId,
    targetTreeId: data.targetTreeId ?? null,
    targetPersonId: data.targetPersonId ?? null,
    bridgeType: data.bridgeType ?? 'marriage',
    status: data.status ?? 'pending',
    createdAt: toIso(data.createdAt),
    acceptedAt: toIso(data.acceptedAt),
  };
}

/**
 * このツリーが関わるつながりを集める。
 * 申請した側・された側の2方向を別々に引く（Firestore の or 検索は使わない）。
 */
export async function listBridges(treeId: string): Promise<Bridge[]> {
  const bridges = collection(getDb(), 'treeBridges');
  const [asRequester, asTarget] = await Promise.all([
    getDocs(query(bridges, where('requesterTreeId', '==', treeId))),
    getDocs(query(bridges, where('targetTreeId', '==', treeId))),
  ]);

  const all = [...asRequester.docs, ...asTarget.docs].map(toBridge);
  // 同じ文書が両方に出ることはないが、念のため id で重複を潰す
  return [...new Map(all.map((bridge) => [bridge.id, bridge])).values()];
}

/**
 * 閲覧の許可を表す文書のID。`{見せる側のツリー}_{見てよい人}`。
 *
 * ルールの `hasBridgeTo()` がこの1件の有無だけを見て、他家を読めるかを決める。
 * Cloud Functions 側（`functions/src/index.ts` の grantId）と同じ形にしてある。
 */
const grantId = (treeId: string, uid: string) => `${treeId}_${uid}`;

/**
 * 相手のツリーを覗く前に、自分に閲覧の許可を出す。
 *
 * ⚠ 暫定。本来は「見せる側のオーナーが許可を配る」もので、自分で自分に配れてはいけない。
 * 家族単位の管理を決めたら、この関数ごと Cloud Functions 側へ戻すこと。
 */
async function grantSelfAccess(otherTreeId: string): Promise<void> {
  const uid = requireUid();
  await setDoc(doc(getDb(), 'treeBridges', grantId(otherTreeId, uid)), {
    grantForTreeId: otherTreeId,
    grantedUid: uid,
    createdAt: serverTimestamp(),
  });
}

/** つなぐ相手の家の名前と、そこに登録されている人物。相手を選ぶ画面で使う。 */
export async function previewTree(
  otherTreeId: string,
): Promise<{ name: string; persons: Person[] }> {
  await grantSelfAccess(otherTreeId);

  const [tree, persons] = await Promise.all([
    getDoc(doc(getDb(), 'trees', otherTreeId)),
    getDocs(sub(otherTreeId, 'persons')),
  ]);

  if (!tree.exists()) throw new Error('そのIDの家系図は見つかりません');

  return {
    name: (tree.data().name as string) ?? '(名称未設定)',
    persons: persons.docs.map(toPerson).filter((person) => !person.deletedAt),
  };
}

/**
 * 相手のツリーIDを指定して、その場でつなぐ。
 *
 * ⚠ 暫定。今は相手の承認を取らずにつながる（本人の判断でセキュリティを外している）。
 * 本来は双方のオーナーが承認して初めてつながるべきで、
 * `functions/src/index.ts` の acceptBridgeConnection がその実装。
 * 家族単位の管理を決めたら、そちらへ戻す。
 */
export async function connectTree(
  treeId: string,
  personId: string,
  otherTreeId: string,
  otherPersonId: string,
  bridgeType: Bridge['bridgeType'],
): Promise<void> {
  const uid = requireUid();
  if (treeId === otherTreeId) throw new Error('同じ家系図どうしはつなげません');

  // 双方のメンバー全員に許可を配る。相手の名簿を読むには、先に自分の許可が要る
  await grantSelfAccess(otherTreeId);
  const [own, other] = await Promise.all([
    getDoc(doc(getDb(), 'trees', treeId)),
    getDoc(doc(getDb(), 'trees', otherTreeId)),
  ]);
  if (!other.exists()) throw new Error('そのIDの家系図は見つかりません');

  const ownMembers = (own.data()?.memberIds as string[] | undefined) ?? [uid];
  const otherMembers = (other.data()?.memberIds as string[] | undefined) ?? [];

  const batch = writeBatch(getDb());
  for (const member of otherMembers) {
    batch.set(doc(getDb(), 'treeBridges', grantId(treeId, member)), {
      grantForTreeId: treeId,
      grantedUid: member,
      createdAt: serverTimestamp(),
    });
  }
  for (const member of ownMembers) {
    batch.set(doc(getDb(), 'treeBridges', grantId(otherTreeId, member)), {
      grantForTreeId: otherTreeId,
      grantedUid: member,
      createdAt: serverTimestamp(),
    });
  }

  batch.set(doc(collection(getDb(), 'treeBridges')), {
    requesterTreeId: treeId,
    requesterPersonId: personId,
    requesterUid: uid,
    targetTreeId: otherTreeId,
    targetPersonId: otherPersonId,
    bridgeType,
    status: 'accepted',
    createdAt: serverTimestamp(),
    acceptedAt: serverTimestamp(),
  });

  await batch.commit();
}

/** つながりを解除する。配った閲覧の許可もまとめて消す。 */
export async function revokeBridge(bridgeId: string): Promise<void> {
  const ref = doc(getDb(), 'treeBridges', bridgeId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return;

  const bridge = snapshot.data();
  const trees = [bridge.requesterTreeId, bridge.targetTreeId].filter(
    (id): id is string => typeof id === 'string',
  );

  const members = await Promise.all(
    trees.map(async (id) => {
      const tree = await getDoc(doc(getDb(), 'trees', id));
      return ((tree.data()?.memberIds as string[] | undefined) ?? []).map((uid) =>
        grantId(id, uid),
      );
    }),
  );

  const batch = writeBatch(getDb());
  for (const id of members.flat()) batch.delete(doc(getDb(), 'treeBridges', id));
  batch.delete(ref);
  await batch.commit();
}

/** 合同表示での人物ID。どのツリーの誰かが一目で分かる形にする。 */
export const mergedId = (treeId: string, personId: string) => `${treeId}:${personId}`;

/** 合同表示のIDを元に戻す。編集はできないので、主に表示の判定に使う。 */
export function splitMergedId(id: string): { treeId: string; personId: string } | null {
  const at = id.indexOf(':');
  return at < 0 ? null : { treeId: id.slice(0, at), personId: id.slice(at + 1) };
}

/**
 * つながっている家をまとめて1つの家系図として読み込む。
 * つないだ相手の家系図は、存命の人も含めてそのまま見える。
 */
export async function loadMergedGraph(treeId: string): Promise<TreeGraph> {
  const own = await loadTreeGraph(treeId);
  const bridges = (await listBridges(treeId)).filter((bridge) => bridge.status === 'accepted');

  const merged: TreeGraph = {
    persons: own.persons.map((person) => ({ ...person, id: mergedId(treeId, person.id) })),
    parentChild: own.parentChild.map((pc) => ({
      ...pc,
      parentId: mergedId(treeId, pc.parentId),
      childId: mergedId(treeId, pc.childId),
    })),
    unions: own.unions.map((union) => ({
      ...union,
      partner1Id: mergedId(treeId, union.partner1Id),
      partner2Id: mergedId(treeId, union.partner2Id),
    })),
  };

  for (const bridge of bridges) {
    const otherTreeId =
      bridge.requesterTreeId === treeId ? bridge.targetTreeId : bridge.requesterTreeId;
    if (!otherTreeId) continue;

    const other = await loadForeignGraph(otherTreeId);
    merged.persons.push(...other.persons);
    merged.parentChild.push(...other.parentChild);
    merged.unions.push(...other.unions);

    // 接続の起点どうしを結ぶ。ここが2つの家をつなぐ1本になる
    if (bridge.targetTreeId && bridge.targetPersonId) {
      const a = mergedId(bridge.requesterTreeId, bridge.requesterPersonId);
      const b = mergedId(bridge.targetTreeId, bridge.targetPersonId);

      if (bridge.bridgeType === 'marriage') {
        merged.unions.push({
          id: `bridge:${bridge.id}`,
          partner1Id: a,
          partner2Id: b,
          status: 'married',
          startDate: null,
          endDate: null,
          deletedAt: null,
        });
      } else {
        // 養子縁組は「申請した側の人物が親」として扱う
        merged.parentChild.push({
          id: `bridge:${bridge.id}`,
          parentId: a,
          childId: b,
          kind: 'adoptive',
          deletedAt: null,
        });
      }
    }
  }

  return merged;
}

/** つながっている他家を読む。存命の人も含めて全員読む。 */
async function loadForeignGraph(treeId: string): Promise<TreeGraph> {
  const [persons, parentChild, unions] = await Promise.all([
    getDocs(sub(treeId, 'persons')),
    getDocs(sub(treeId, 'parentChild')),
    getDocs(sub(treeId, 'unions')),
  ]);

  const alive = <T extends { deletedAt: string | null }>(items: T[]) =>
    items.filter((item) => !item.deletedAt);

  const foreignPersons = alive(persons.docs.map(toPerson)).map((person) => ({
    ...person,
    id: mergedId(treeId, person.id),
  }));
  const foreignParentChild = alive(parentChild.docs.map(toParentChild)).map((pc) => ({
    ...pc,
    parentId: mergedId(treeId, pc.parentId),
    childId: mergedId(treeId, pc.childId),
  }));
  const foreignUnions = alive(unions.docs.map(toUnion)).map((union) => ({
    ...union,
    partner1Id: mergedId(treeId, union.partner1Id),
    partner2Id: mergedId(treeId, union.partner2Id),
  }));

  return { persons: foreignPersons, parentChild: foreignParentChild, unions: foreignUnions };
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
