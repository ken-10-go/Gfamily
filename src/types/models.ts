export type TreeRole = 'owner' | 'editor' | 'viewer';
export type Gender = 'male' | 'female' | 'other' | 'unknown';
export type ParentKind = 'biological' | 'adoptive' | 'step' | 'foster';
export type UnionStatus = 'married' | 'divorced' | 'widowed' | 'partner';

export interface Tree {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  /** uid -> 権限。セキュリティルールの判定もこのマップを見る。 */
  roles: Record<string, TreeRole>;
  /** roles のキーと同じ内容。「自分が参加しているツリー」を1クエリで引くために持つ。 */
  memberIds: string[];
}

export interface Person {
  id: string;
  familyName: string | null;
  givenName: string | null;
  maidenName: string | null;
  gender: Gender;
  /** YYYY-MM-DD 形式。日付の一部だけ分かる場合に備えて文字列で持つ。 */
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  note: string | null;
  isLiving: boolean;
  /** ソフト削除の時刻（ISO文字列）。null なら生存レコード。 */
  deletedAt: string | null;
}

/** 人物の新規作成・更新で編集できる項目。 */
export type PersonInput = Pick<
  Person,
  | 'familyName'
  | 'givenName'
  | 'maidenName'
  | 'gender'
  | 'birthDate'
  | 'deathDate'
  | 'birthPlace'
  | 'note'
  | 'isLiving'
>;

export interface ParentChild {
  id: string;
  parentId: string;
  childId: string;
  kind: ParentKind;
  deletedAt: string | null;
}

export interface Union {
  id: string;
  partner1Id: string;
  partner2Id: string;
  status: UnionStatus;
  startDate: string | null;
  endDate: string | null;
  deletedAt: string | null;
}

export interface Invitation {
  id: string;
  email: string | null;
  role: TreeRole;
  expiresAt: string | null;
  revokedAt: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  createdAt: string | null;
}

export interface InvitationPreview {
  treeName: string;
  role: TreeRole;
  requiresEmail: string | null;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  entity: string;
  entityId: string | null;
  action: 'insert' | 'update' | 'delete' | 'restore';
  createdAt: string | null;
}

/** ツリー1件分のデータをまとめて保持する。ビューはこれを入力にする。 */
export interface TreeGraph {
  persons: Person[];
  parentChild: ParentChild[];
  unions: Union[];
}

export const ROLE_LABELS: Record<TreeRole, string> = {
  owner: 'オーナー',
  editor: '編集者',
  viewer: '閲覧者',
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: '男性',
  female: '女性',
  other: 'その他',
  unknown: '不明',
};

export const PARENT_KIND_LABELS: Record<ParentKind, string> = {
  biological: '実子',
  adoptive: '養子',
  step: '継子',
  foster: '里子',
};

export const UNION_STATUS_LABELS: Record<UnionStatus, string> = {
  married: '婚姻',
  divorced: '離婚',
  widowed: '死別',
  partner: 'パートナー',
};

/** 表示用の氏名。姓と名のどちらかが欠けていても破綻しないようにする。 */
export function displayName(person: Pick<Person, 'familyName' | 'givenName'>): string {
  const name = [person.familyName, person.givenName].filter(Boolean).join(' ');
  return name || '(名前未設定)';
}

/** 「1958–」「1930–2005」のような生没年表記。 */
export function lifespanLabel(
  person: Pick<Person, 'birthDate' | 'deathDate' | 'isLiving'>,
): string {
  const birth = person.birthDate?.slice(0, 4) ?? '';
  const death = person.deathDate?.slice(0, 4) ?? '';

  if (!birth && !death) return '';
  if (person.isLiving) return birth ? `${birth}–` : '';
  return `${birth}–${death}`;
}
