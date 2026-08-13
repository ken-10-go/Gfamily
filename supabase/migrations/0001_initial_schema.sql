-- ============================================================================
-- 家系図共有アプリ 初期スキーマ
--
-- 設計方針:
--   * すべての業務テーブルは tree_id を持ち、RLS で「自分が所属するツリーのみ」に絞る
--   * 権限判定は SECURITY DEFINER ヘルパー関数に集約し、tree_members ポリシーの
--     再帰参照を避ける
--   * 削除はソフト削除（deleted_at）とし、誤削除から復元できるようにする
--   * 変更履歴はトリガーで audit_logs に記録し、クライアントからは読み取り専用
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 列挙型
-- ----------------------------------------------------------------------------

-- 権限は オーナー > 編集者 > 閲覧者 の3段階
create type public.tree_role as enum ('owner', 'editor', 'viewer');

create type public.gender as enum ('male', 'female', 'other', 'unknown');

-- 親子関係の種別。養子縁組・継親子を実子と区別して保持する
create type public.parent_kind as enum ('biological', 'adoptive', 'step', 'foster');

-- 婚姻関係の状態。複数婚・離婚を表現できるよう、期間を持つレコードとして扱う
create type public.union_status as enum ('married', 'divorced', 'widowed', 'partner');

-- ----------------------------------------------------------------------------
-- テーブル
-- ----------------------------------------------------------------------------

create table public.trees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 2000),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tree_members (
  tree_id uuid not null references public.trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.tree_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tree_id, user_id)
);

create index tree_members_user_id_idx on public.tree_members (user_id);

-- 個人情報は要件定義書 2.3 に従い必要最小限に絞る。
-- 住所・連絡先は保持しない（必要になった時点で改めて検討する）。
create table public.persons (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  family_name text check (char_length(family_name) <= 100),
  given_name text check (char_length(given_name) <= 100),
  maiden_name text check (char_length(maiden_name) <= 100),
  gender public.gender not null default 'unknown',
  birth_date date,
  death_date date,
  birth_place text check (char_length(birth_place) <= 200),
  note text check (char_length(note) <= 4000),
  is_living boolean not null default true,
  -- 存命なら没年月日は持たない
  constraint persons_living_has_no_death_date check (not (is_living and death_date is not null)),
  constraint persons_death_after_birth check (
    birth_date is null or death_date is null or death_date >= birth_date
  ),
  -- 氏名がすべて空の人物は作らせない
  constraint persons_has_name check (
    coalesce(family_name, '') <> '' or coalesce(given_name, '') <> ''
  ),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index persons_tree_id_idx on public.persons (tree_id) where deleted_at is null;

-- 親子関係。きょうだい関係はこのテーブルから導出する（要件定義書 3.1）。
create table public.parent_child (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  parent_id uuid not null references public.persons (id) on delete cascade,
  child_id uuid not null references public.persons (id) on delete cascade,
  kind public.parent_kind not null default 'biological',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_child_not_self check (parent_id <> child_id),
  unique (parent_id, child_id)
);

create index parent_child_tree_id_idx on public.parent_child (tree_id) where deleted_at is null;
create index parent_child_child_id_idx on public.parent_child (child_id);

-- 婚姻・パートナー関係。同じ2人が離婚・再婚した場合は別レコードになる。
create table public.unions (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  partner1_id uuid not null references public.persons (id) on delete cascade,
  partner2_id uuid not null references public.persons (id) on delete cascade,
  status public.union_status not null default 'married',
  start_date date,
  end_date date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unions_not_self check (partner1_id <> partner2_id),
  constraint unions_end_after_start check (
    start_date is null or end_date is null or end_date >= start_date
  )
);

create index unions_tree_id_idx on public.unions (tree_id) where deleted_at is null;
create index unions_partner1_idx on public.unions (partner1_id);
create index unions_partner2_idx on public.unions (partner2_id);

-- 招待。トークンは平文で保存せず SHA-256 ハッシュのみを保持する。
-- email を指定した招待は、そのメールアドレスのユーザーしか受諾できない。
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  email text check (email is null or char_length(email) <= 320),
  role public.tree_role not null default 'viewer',
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- オーナー権限の招待は作らせない（オーナーの委譲はメンバー管理から行う）
  constraint invitations_role_not_owner check (role <> 'owner')
);

create index invitations_tree_id_idx on public.invitations (tree_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tree_id uuid not null references public.trees (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  entity text not null,
  entity_id uuid,
  action text not null check (action in ('insert', 'update', 'delete', 'restore')),
  changes jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_tree_id_created_at_idx on public.audit_logs (tree_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 権限判定ヘルパー
--
-- RLS ポリシーから呼ぶため SECURITY DEFINER にする。これにより tree_members の
-- ポリシー自身が tree_members を参照して無限再帰する問題を避ける。
-- search_path を空にして、呼び出し側のスキーマ差し替えによる乗っ取りを防ぐ。
-- ----------------------------------------------------------------------------

create or replace function public.current_tree_role(p_tree_id uuid)
returns public.tree_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.tree_members m
  where m.tree_id = p_tree_id
    and m.user_id = (select auth.uid())
$$;

create or replace function public.is_tree_member(p_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_tree_role(p_tree_id) is not null
$$;

create or replace function public.can_edit_tree(p_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_tree_role(p_tree_id) in ('owner', 'editor')
$$;

create or replace function public.is_tree_owner(p_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_tree_role(p_tree_id) = 'owner'
$$;

-- ----------------------------------------------------------------------------
-- 共通トリガー
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trees_set_updated_at before update on public.trees
  for each row execute function public.set_updated_at();
create trigger tree_members_set_updated_at before update on public.tree_members
  for each row execute function public.set_updated_at();
create trigger persons_set_updated_at before update on public.persons
  for each row execute function public.set_updated_at();
create trigger parent_child_set_updated_at before update on public.parent_child
  for each row execute function public.set_updated_at();
create trigger unions_set_updated_at before update on public.unions
  for each row execute function public.set_updated_at();

-- ツリーからオーナーが居なくなる操作を禁じる（自分自身の降格・脱退を含む）。
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_count integer;
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  -- 更新でオーナーのままなら問題ない
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  select count(*) into v_owner_count
  from public.tree_members m
  where m.tree_id = old.tree_id and m.role = 'owner';

  if v_owner_count <= 1 then
    raise exception 'ツリーには最低1人のオーナーが必要です';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger tree_members_prevent_last_owner_removal
  before update or delete on public.tree_members
  for each row execute function public.prevent_last_owner_removal();

-- ----------------------------------------------------------------------------
-- 監査ログ（要件定義書 2.3「誰がいつ何を編集したか」）
-- ----------------------------------------------------------------------------

create or replace function public.record_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_row jsonb;
  v_tree_id uuid;
  v_entity_id uuid;
  v_changes jsonb;
begin
  v_row := to_jsonb(coalesce(new, old));
  v_tree_id := (v_row ->> 'tree_id')::uuid;
  v_entity_id := (v_row ->> 'id')::uuid;

  if tg_op = 'INSERT' then
    v_action := 'insert';
    v_changes := jsonb_build_object('new', v_row);
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
    v_changes := jsonb_build_object('old', to_jsonb(old));
  else
    -- ソフト削除・復元は update だが、履歴上は区別できたほうが分かりやすい
    if old.deleted_at is null and new.deleted_at is not null then
      v_action := 'delete';
    elsif old.deleted_at is not null and new.deleted_at is null then
      v_action := 'restore';
    else
      v_action := 'update';
    end if;
    v_changes := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  end if;

  insert into public.audit_logs (tree_id, actor_id, entity, entity_id, action, changes)
  values (v_tree_id, (select auth.uid()), tg_table_name, v_entity_id, v_action, v_changes);

  return coalesce(new, old);
end;
$$;

create trigger persons_audit after insert or update or delete on public.persons
  for each row execute function public.record_audit_log();
create trigger parent_child_audit after insert or update or delete on public.parent_child
  for each row execute function public.record_audit_log();
create trigger unions_audit after insert or update or delete on public.unions
  for each row execute function public.record_audit_log();

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- 方針: すべてのテーブルで RLS を有効化し、必要な操作にだけポリシーを与える。
-- ポリシーの無い操作は拒否されるため、明示的に許可したものしか通らない。
-- ----------------------------------------------------------------------------

alter table public.trees enable row level security;
alter table public.tree_members enable row level security;
alter table public.persons enable row level security;
alter table public.parent_child enable row level security;
alter table public.unions enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_logs enable row level security;

-- trees ---------------------------------------------------------------------

create policy trees_select_member on public.trees
  for select to authenticated
  using (public.is_tree_member(id));

-- INSERT ポリシーは意図的に作らない。ツリー作成は create_tree() RPC 経由のみとする。
-- 直接 INSERT を許すと「行を挿入した直後は、まだメンバーではないので自分のツリーを
-- 読み返せない」（INSERT ... RETURNING が SELECT ポリシーに阻まれる）状態になり、
-- ツリー作成とオーナー登録も別トランザクションに分かれてしまう。

create policy trees_update_owner on public.trees
  for update to authenticated
  using (public.is_tree_owner(id))
  with check (public.is_tree_owner(id));

create policy trees_delete_owner on public.trees
  for delete to authenticated
  using (public.is_tree_owner(id));

-- tree_members --------------------------------------------------------------

create policy tree_members_select_member on public.tree_members
  for select to authenticated
  using (public.is_tree_member(tree_id));

create policy tree_members_insert_owner on public.tree_members
  for insert to authenticated
  with check (public.is_tree_owner(tree_id));

create policy tree_members_update_owner on public.tree_members
  for update to authenticated
  using (public.is_tree_owner(tree_id))
  with check (public.is_tree_owner(tree_id));

-- オーナーによる除名に加えて、メンバー自身の脱退も許す
create policy tree_members_delete_owner_or_self on public.tree_members
  for delete to authenticated
  using (public.is_tree_owner(tree_id) or user_id = (select auth.uid()));

-- persons -------------------------------------------------------------------

create policy persons_select_member on public.persons
  for select to authenticated
  using (public.is_tree_member(tree_id));

create policy persons_insert_editor on public.persons
  for insert to authenticated
  with check (public.can_edit_tree(tree_id));

create policy persons_update_editor on public.persons
  for update to authenticated
  using (public.can_edit_tree(tree_id))
  with check (public.can_edit_tree(tree_id));

-- 物理削除はオーナーのみ。通常の削除操作は deleted_at によるソフト削除を使う。
create policy persons_delete_owner on public.persons
  for delete to authenticated
  using (public.is_tree_owner(tree_id));

-- parent_child --------------------------------------------------------------

create policy parent_child_select_member on public.parent_child
  for select to authenticated
  using (public.is_tree_member(tree_id));

create policy parent_child_insert_editor on public.parent_child
  for insert to authenticated
  with check (public.can_edit_tree(tree_id));

create policy parent_child_update_editor on public.parent_child
  for update to authenticated
  using (public.can_edit_tree(tree_id))
  with check (public.can_edit_tree(tree_id));

create policy parent_child_delete_owner on public.parent_child
  for delete to authenticated
  using (public.is_tree_owner(tree_id));

-- unions --------------------------------------------------------------------

create policy unions_select_member on public.unions
  for select to authenticated
  using (public.is_tree_member(tree_id));

create policy unions_insert_editor on public.unions
  for insert to authenticated
  with check (public.can_edit_tree(tree_id));

create policy unions_update_editor on public.unions
  for update to authenticated
  using (public.can_edit_tree(tree_id))
  with check (public.can_edit_tree(tree_id));

create policy unions_delete_owner on public.unions
  for delete to authenticated
  using (public.is_tree_owner(tree_id));

-- invitations ---------------------------------------------------------------
--
-- 招待の管理はオーナーのみ。token_hash が読めるのもオーナーだけになる。
-- 受諾は下の accept_invitation() 経由で行う（受諾者はまだメンバーではないため、
-- ポリシーでは招待レコードを読めない）。

create policy invitations_select_owner on public.invitations
  for select to authenticated
  using (public.is_tree_owner(tree_id));

create policy invitations_insert_owner on public.invitations
  for insert to authenticated
  with check (public.is_tree_owner(tree_id) and created_by = (select auth.uid()));

create policy invitations_update_owner on public.invitations
  for update to authenticated
  using (public.is_tree_owner(tree_id))
  with check (public.is_tree_owner(tree_id));

create policy invitations_delete_owner on public.invitations
  for delete to authenticated
  using (public.is_tree_owner(tree_id));

-- audit_logs ----------------------------------------------------------------
--
-- 読み取りのみ許可。書き込みポリシーを作らないことで、クライアントからの
-- 改ざん・削除を防ぐ（記録はトリガー＝テーブル所有者権限で行われる）。

create policy audit_logs_select_member on public.audit_logs
  for select to authenticated
  using (public.is_tree_member(tree_id));

-- ----------------------------------------------------------------------------
-- ツリー作成
-- ----------------------------------------------------------------------------

-- ツリー本体と作成者のオーナー登録を1トランザクションで行い、ツリーIDを返す。
-- 作成直後はまだメンバーではないため、通常の INSERT ... RETURNING では
-- SELECT ポリシーに阻まれる。それを避けるため SECURITY DEFINER でまとめて行う。
create or replace function public.create_tree(p_name text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tree_id uuid;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;

  insert into public.trees (name, description, created_by)
  values (p_name, nullif(trim(coalesce(p_description, '')), ''), v_user_id)
  returning id into v_tree_id;

  insert into public.tree_members (tree_id, user_id, role)
  values (v_tree_id, v_user_id, 'owner');

  return v_tree_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 招待の発行と受諾
-- ----------------------------------------------------------------------------

-- 招待トークンを発行し、平文トークンを1度だけ返す。
-- DB にはハッシュしか残らないため、DB が漏洩してもトークンは復元できない。
create or replace function public.create_invitation(
  p_tree_id uuid,
  p_role public.tree_role default 'viewer',
  p_email text default null,
  p_valid_days integer default 7
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.is_tree_owner(p_tree_id) then
    raise exception '招待を作成する権限がありません';
  end if;

  if p_role = 'owner' then
    raise exception 'オーナー権限の招待は作成できません';
  end if;

  if p_valid_days < 1 or p_valid_days > 30 then
    raise exception '有効期限は1〜30日の範囲で指定してください';
  end if;

  -- gen_random_uuid() 2つ分＝244ビット相当の乱数。pgcrypto に依存しない。
  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');

  insert into public.invitations (tree_id, email, role, token_hash, expires_at, created_by)
  values (
    p_tree_id,
    nullif(lower(trim(p_email)), ''),
    p_role,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    now() + make_interval(days => p_valid_days),
    (select auth.uid())
  );

  return v_token;
end;
$$;

-- 招待を受諾してメンバーになる。
-- 受諾者はまだメンバーではなく RLS で招待レコードを読めないため、
-- SECURITY DEFINER でトークン照合とメンバー登録をまとめて行う。
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations;
  v_user_id uuid := (select auth.uid());
  v_email text := lower((select u.email from auth.users u where u.id = v_user_id));
begin
  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  -- 招待が存在しない場合と失効している場合で応答を変えない（トークン探索の手がかりを与えない）
  if v_invitation.id is null
     or v_invitation.revoked_at is not null
     or v_invitation.accepted_at is not null
     or v_invitation.expires_at < now() then
    raise exception '招待リンクが無効か、有効期限が切れています';
  end if;

  -- メール指定の招待は、その宛先本人しか受諾できない
  if v_invitation.email is not null and v_invitation.email <> v_email then
    raise exception 'この招待は別のメールアドレス宛です';
  end if;

  insert into public.tree_members (tree_id, user_id, role)
  values (v_invitation.tree_id, v_user_id, v_invitation.role)
  on conflict (tree_id, user_id) do nothing;

  update public.invitations
  set accepted_at = now(), accepted_by = v_user_id
  where id = v_invitation.id;

  insert into public.audit_logs (tree_id, actor_id, entity, entity_id, action, changes)
  values (
    v_invitation.tree_id, v_user_id, 'tree_members', null, 'insert',
    jsonb_build_object('new', jsonb_build_object('role', v_invitation.role, 'via', 'invitation'))
  );

  return v_invitation.tree_id;
end;
$$;

-- 招待リンクを開いた時点で「どのツリーへの招待か」だけを見せるためのプレビュー。
-- 権限や個人情報は返さない。
create or replace function public.invitation_preview(p_token text)
returns table (tree_name text, role public.tree_role, requires_email text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select t.name, i.role, i.email
  from public.invitations i
  join public.trees t on t.id = i.tree_id
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and i.revoked_at is null
    and i.accepted_at is null
    and i.expires_at >= now();
end;
$$;

-- ----------------------------------------------------------------------------
-- 権限
--
-- anon（未ログイン）には一切の権限を与えない。要件定義書 2.3 の
-- 「一般公開の新規登録は行わない / デフォルト非公開」に対応する。
-- ----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;

-- 関数は作成時に PUBLIC へ EXECUTE が既定付与される。anon は PUBLIC のメンバーなので、
-- anon から revoke するだけでは実行権限が残る。PUBLIC ごと剥がしてから明示的に付け直す。
revoke all on all functions in schema public from public, anon;

-- trees への直接 INSERT は与えない（create_tree() RPC 経由のみ）
grant select, update, delete on public.trees to authenticated;

grant select, insert, update, delete on
  public.tree_members, public.persons,
  public.parent_child, public.unions, public.invitations
  to authenticated;

grant select on public.audit_logs to authenticated;

grant execute on function public.current_tree_role(uuid) to authenticated;
grant execute on function public.is_tree_member(uuid) to authenticated;
grant execute on function public.can_edit_tree(uuid) to authenticated;
grant execute on function public.is_tree_owner(uuid) to authenticated;
grant execute on function public.create_tree(text, text) to authenticated;
grant execute on function public.create_invitation(uuid, public.tree_role, text, integer) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.invitation_preview(text) to authenticated;
