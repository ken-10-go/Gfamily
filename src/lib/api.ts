import type { PostgrestError } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';
import type {
  AuditLog,
  Invitation,
  InvitationPreview,
  ParentChild,
  ParentKind,
  Person,
  PersonInput,
  Tree,
  TreeGraph,
  TreeMember,
  TreeRole,
  Union,
  UnionStatus,
} from '@/types/models';

/**
 * Supabase の応答を素の値に変換する。
 *
 * RLS で弾かれた書き込みは「エラー」ではなく「0件更新」として返るケースがあるため、
 * 呼び出し側で件数を確認する必要がある箇所は個別に扱う。
 */
function unwrap<T>({ data, error }: { data: T | null; error: PostgrestError | null }): T {
  if (error) {
    throw new Error(error.message);
  }
  if (data === null) {
    throw new Error('データを取得できませんでした');
  }
  return data;
}

// --- ツリー -----------------------------------------------------------------

export async function listTrees(): Promise<Tree[]> {
  const supabase = getSupabaseClient();
  return unwrap(await supabase.from('trees').select('*').order('created_at', { ascending: false }));
}

export async function getTree(treeId: string): Promise<Tree> {
  const supabase = getSupabaseClient();
  return unwrap(await supabase.from('trees').select('*').eq('id', treeId).single());
}

/** ツリー作成はRPC経由。作成者のオーナー登録まで1トランザクションで行われる。 */
export async function createTree(name: string, description?: string): Promise<string> {
  const supabase = getSupabaseClient();
  return unwrap(
    await supabase.rpc('create_tree', { p_name: name, p_description: description ?? null }),
  );
}

export async function updateTree(
  treeId: string,
  patch: { name?: string; description?: string | null },
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('trees').update(patch).eq('id', treeId);
  if (error) throw new Error(error.message);
}

export async function deleteTree(treeId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('trees').delete().eq('id', treeId);
  if (error) throw new Error(error.message);
}

/** ログイン中のユーザーがそのツリーで持つ権限。 */
export async function getMyRole(treeId: string): Promise<TreeRole | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('current_tree_role', { p_tree_id: treeId });
  if (error) throw new Error(error.message);
  return (data as TreeRole | null) ?? null;
}

// --- ツリーの中身（人物と関係） ----------------------------------------------

/** 家系図の描画に必要なデータを一括で取得する。 */
export async function loadTreeGraph(treeId: string): Promise<TreeGraph> {
  const supabase = getSupabaseClient();

  const [persons, parentChild, unions] = await Promise.all([
    supabase.from('persons').select('*').eq('tree_id', treeId).is('deleted_at', null),
    supabase.from('parent_child').select('*').eq('tree_id', treeId).is('deleted_at', null),
    supabase.from('unions').select('*').eq('tree_id', treeId).is('deleted_at', null),
  ]);

  return {
    persons: unwrap(persons) as Person[],
    parentChild: unwrap(parentChild) as ParentChild[],
    unions: unwrap(unions) as Union[],
  };
}

export async function createPerson(treeId: string, input: PersonInput): Promise<Person> {
  const supabase = getSupabaseClient();
  return unwrap(
    await supabase
      .from('persons')
      .insert({ ...normalizePersonInput(input), tree_id: treeId })
      .select()
      .single(),
  );
}

export async function updatePerson(personId: string, input: PersonInput): Promise<void> {
  const supabase = getSupabaseClient();
  const { error, count } = await supabase
    .from('persons')
    .update(normalizePersonInput(input), { count: 'exact' })
    .eq('id', personId);

  if (error) throw new Error(error.message);
  if (count === 0) throw new Error('編集する権限がありません');
}

/** ソフト削除。ゴミ箱から復元できる（要件定義書 3.2）。 */
export async function softDeletePerson(personId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error, count } = await supabase
    .from('persons')
    .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', personId);

  if (error) throw new Error(error.message);
  if (count === 0) throw new Error('削除する権限がありません');
}

export async function restorePerson(personId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('persons')
    .update({ deleted_at: null })
    .eq('id', personId);
  if (error) throw new Error(error.message);
}

export async function listDeletedPersons(treeId: string): Promise<Person[]> {
  const supabase = getSupabaseClient();
  return unwrap(
    await supabase
      .from('persons')
      .select('*')
      .eq('tree_id', treeId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
  );
}

/** 空文字は null に寄せる。DB 側の「氏名がすべて空なら不可」制約と噛み合わせる。 */
function normalizePersonInput(input: PersonInput): PersonInput {
  const blankToNull = (value: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  return {
    ...input,
    family_name: blankToNull(input.family_name),
    given_name: blankToNull(input.given_name),
    maiden_name: blankToNull(input.maiden_name),
    birth_place: blankToNull(input.birth_place),
    note: blankToNull(input.note),
    birth_date: input.birth_date || null,
    // 存命なら没年月日は保持しない（DBの制約と一致させる）
    death_date: input.is_living ? null : input.death_date || null,
  };
}

// --- 関係 -------------------------------------------------------------------

export async function addParentChild(
  treeId: string,
  parentId: string,
  childId: string,
  kind: ParentKind = 'biological',
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('parent_child')
    .insert({ tree_id: treeId, parent_id: parentId, child_id: childId, kind });
  if (error) throw new Error(error.message);
}

export async function removeParentChild(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('parent_child')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addUnion(
  treeId: string,
  partner1Id: string,
  partner2Id: string,
  status: UnionStatus = 'married',
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('unions')
    .insert({ tree_id: treeId, partner1_id: partner1Id, partner2_id: partner2Id, status });
  if (error) throw new Error(error.message);
}

export async function removeUnion(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('unions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// --- メンバーと招待 ----------------------------------------------------------

export async function listMembers(treeId: string): Promise<TreeMember[]> {
  const supabase = getSupabaseClient();
  return unwrap(await supabase.from('tree_members').select('*').eq('tree_id', treeId));
}

export async function updateMemberRole(
  treeId: string,
  userId: string,
  role: TreeRole,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('tree_members')
    .update({ role })
    .eq('tree_id', treeId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function removeMember(treeId: string, userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('tree_members')
    .delete()
    .eq('tree_id', treeId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function listInvitations(treeId: string): Promise<Invitation[]> {
  const supabase = getSupabaseClient();
  return unwrap(
    await supabase
      .from('invitations')
      .select('id, tree_id, email, role, expires_at, revoked_at, accepted_at, accepted_by, created_at')
      .eq('tree_id', treeId)
      .order('created_at', { ascending: false }),
  );
}

/** 招待を発行し、平文トークンを返す。この値はこの1回しか取得できない。 */
export async function createInvitation(
  treeId: string,
  role: Exclude<TreeRole, 'owner'>,
  email: string | null,
  validDays = 7,
): Promise<string> {
  const supabase = getSupabaseClient();
  return unwrap(
    await supabase.rpc('create_invitation', {
      p_tree_id: treeId,
      p_role: role,
      p_email: email,
      p_valid_days: validDays,
    }),
  );
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId);
  if (error) throw new Error(error.message);
}

export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('invitation_preview', { p_token: token });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as InvitationPreview[];
  return rows[0] ?? null;
}

/** 招待を受諾する。成功するとツリーIDを返す。 */
export async function acceptInvitation(token: string): Promise<string> {
  const supabase = getSupabaseClient();
  return unwrap(await supabase.rpc('accept_invitation', { p_token: token }));
}

// --- 変更履歴 ---------------------------------------------------------------

export async function listAuditLogs(treeId: string, limit = 100): Promise<AuditLog[]> {
  const supabase = getSupabaseClient();
  return unwrap(
    await supabase
      .from('audit_logs')
      .select('*')
      .eq('tree_id', treeId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
}
