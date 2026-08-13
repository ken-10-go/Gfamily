export type TreeRole = 'owner' | 'editor' | 'viewer';
export type Gender = 'male' | 'female' | 'other' | 'unknown';
export type ParentKind = 'biological' | 'adoptive' | 'step' | 'foster';
export type UnionStatus = 'married' | 'divorced' | 'widowed' | 'partner';

export interface Tree {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TreeMember {
  tree_id: string;
  user_id: string;
  role: TreeRole;
  created_at: string;
}

export interface Person {
  id: string;
  tree_id: string;
  family_name: string | null;
  given_name: string | null;
  maiden_name: string | null;
  gender: Gender;
  birth_date: string | null;
  death_date: string | null;
  birth_place: string | null;
  note: string | null;
  is_living: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 人物の新規作成・更新で編集できる項目。 */
export type PersonInput = Pick<
  Person,
  | 'family_name'
  | 'given_name'
  | 'maiden_name'
  | 'gender'
  | 'birth_date'
  | 'death_date'
  | 'birth_place'
  | 'note'
  | 'is_living'
>;

export interface ParentChild {
  id: string;
  tree_id: string;
  parent_id: string;
  child_id: string;
  kind: ParentKind;
  deleted_at: string | null;
}

export interface Union {
  id: string;
  tree_id: string;
  partner1_id: string;
  partner2_id: string;
  status: UnionStatus;
  start_date: string | null;
  end_date: string | null;
  deleted_at: string | null;
}

export interface Invitation {
  id: string;
  tree_id: string;
  email: string | null;
  role: TreeRole;
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  created_at: string;
}

export interface InvitationPreview {
  tree_name: string;
  role: TreeRole;
  requires_email: string | null;
}

export interface AuditLog {
  id: number;
  tree_id: string;
  actor_id: string | null;
  entity: string;
  entity_id: string | null;
  action: 'insert' | 'update' | 'delete' | 'restore';
  changes: Record<string, unknown> | null;
  created_at: string;
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
export function displayName(person: Pick<Person, 'family_name' | 'given_name'>): string {
  const name = [person.family_name, person.given_name].filter(Boolean).join(' ');
  return name || '(名前未設定)';
}

/** 「1958–」「1930–2005」のような生没年表記。 */
export function lifespanLabel(person: Pick<Person, 'birth_date' | 'death_date' | 'is_living'>): string {
  const birth = person.birth_date?.slice(0, 4) ?? '';
  const death = person.death_date?.slice(0, 4) ?? '';

  if (!birth && !death) return '';
  if (person.is_living) return birth ? `${birth}–` : '';
  return `${birth}–${death}`;
}
