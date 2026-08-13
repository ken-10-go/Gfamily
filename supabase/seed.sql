-- ============================================================================
-- 動作確認用のダミーデータ
--
-- ここに含まれる人物はすべて架空のものです。実在の家族データは絶対に
-- このファイルに書かないでください（要件定義書 5）。
--
-- 使い方: Supabase の SQL Editor で、ログイン済みのユーザーを1人作った後に実行する。
-- auth.users の先頭ユーザーをオーナーとしてデモ用ツリーを作ります。
-- ============================================================================

do $$
declare
  v_user_id uuid;
  v_tree_id uuid;
  v_grandfather uuid;
  v_grandmother uuid;
  v_father uuid;
  v_mother uuid;
  v_uncle uuid;
  v_child1 uuid;
  v_child2 uuid;
begin
  select id into v_user_id from auth.users order by created_at limit 1;

  if v_user_id is null then
    raise exception 'auth.users にユーザーがいません。先にユーザーを1人作成してください。';
  end if;

  insert into public.trees (name, description, created_by)
  values ('サンプル家系図（架空）', '動作確認用のダミーデータです。実在の人物とは関係ありません。', v_user_id)
  returning id into v_tree_id;

  insert into public.tree_members (tree_id, user_id, role)
  values (v_tree_id, v_user_id, 'owner');

  insert into public.persons (tree_id, family_name, given_name, gender, birth_date, death_date, is_living, birth_place)
  values (v_tree_id, '見本', '一郎', 'male', '1930-04-02', '2005-11-18', false, '架空県 見本市')
  returning id into v_grandfather;

  insert into public.persons (tree_id, family_name, given_name, maiden_name, gender, birth_date, death_date, is_living)
  values (v_tree_id, '見本', 'はな', '仮名', 'female', '1933-08-15', '2012-01-09', false)
  returning id into v_grandmother;

  insert into public.persons (tree_id, family_name, given_name, gender, birth_date, is_living, birth_place)
  values (v_tree_id, '見本', '次郎', 'male', '1958-02-20', true, '架空県 見本市')
  returning id into v_father;

  insert into public.persons (tree_id, family_name, given_name, maiden_name, gender, birth_date, is_living)
  values (v_tree_id, '見本', '幸子', '例', 'female', '1961-06-30', true)
  returning id into v_mother;

  insert into public.persons (tree_id, family_name, given_name, gender, birth_date, is_living)
  values (v_tree_id, '見本', '三郎', 'male', '1962-09-05', true)
  returning id into v_uncle;

  insert into public.persons (tree_id, family_name, given_name, gender, birth_date, is_living)
  values (v_tree_id, '見本', '太郎', 'male', '1988-03-14', true)
  returning id into v_child1;

  insert into public.persons (tree_id, family_name, given_name, gender, birth_date, is_living)
  values (v_tree_id, '見本', '桜', 'female', '1991-12-01', true)
  returning id into v_child2;

  insert into public.unions (tree_id, partner1_id, partner2_id, status, start_date, end_date)
  values (v_tree_id, v_grandfather, v_grandmother, 'widowed', '1955-05-05', '2005-11-18');

  insert into public.unions (tree_id, partner1_id, partner2_id, status, start_date)
  values (v_tree_id, v_father, v_mother, 'married', '1986-10-10');

  insert into public.parent_child (tree_id, parent_id, child_id) values
    (v_tree_id, v_grandfather, v_father),
    (v_tree_id, v_grandmother, v_father),
    (v_tree_id, v_grandfather, v_uncle),
    (v_tree_id, v_grandmother, v_uncle),
    (v_tree_id, v_father, v_child1),
    (v_tree_id, v_mother, v_child1),
    (v_tree_id, v_father, v_child2),
    (v_tree_id, v_mother, v_child2);

  raise notice 'デモ用ツリーを作成しました: %', v_tree_id;
end;
$$;
