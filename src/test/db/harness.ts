import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const migrationPath = fileURLToPath(
  new URL('../../../supabase/migrations/0001_initial_schema.sql', import.meta.url),
);

/**
 * Supabase 本体が提供する部分の最小スタブ。
 *
 * 本番の Supabase では auth スキーマと anon / authenticated ロールが最初から存在する。
 * ここではそれらを同じ形で用意し、auth.uid() を GUC 経由で差し替えられるようにして
 * 「誰としてクエリを投げるか」をテストから制御する。
 */
const BOOTSTRAP_SQL = `
  create role anon nologin;
  create role authenticated nologin;

  create schema auth;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique
  );

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('app.user_id', true), '')::uuid
  $$;

  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

export type Db = PGlite;

export async function createTestDb(): Promise<Db> {
  const db = await PGlite.create();
  await db.exec(BOOTSTRAP_SQL);
  await db.exec(readFileSync(migrationPath, 'utf8'));
  return db;
}

/** テスト用ユーザーを auth.users に作る。 */
export async function createUser(db: Db, email: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  );
  return result.rows[0].id;
}

/**
 * 指定ユーザー・指定ロールとしてクエリを実行する。
 *
 * PGlite は単一接続なので、実行後に必ず role と GUC を戻す。
 */
export async function asUser<T>(
  db: Db,
  userId: string | null,
  fn: () => Promise<T>,
  role: 'authenticated' | 'anon' = 'authenticated',
): Promise<T> {
  await db.exec(`set role ${role};`);
  await db.query('select set_config($1, $2, false)', ['app.user_id', userId ?? '']);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
    await db.query('select set_config($1, $2, false)', ['app.user_id', '']);
  }
}

/** クエリが RLS などで拒否されることを確認する。拒否されなければ失敗させる。 */
export async function expectRejected(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('拒否されるべき操作が成功しました');
}

/** オーナーとしてツリーを1つ作り、その id を返す。 */
export async function createTree(db: Db, ownerId: string, name: string): Promise<string> {
  return asUser(db, ownerId, async () => {
    const result = await db.query<{ create_tree: string }>('select public.create_tree($1)', [name]);
    return result.rows[0].create_tree;
  });
}
