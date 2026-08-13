import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** 環境変数が揃っているか。UI 側で設定漏れの案内を出したいときに使う。 */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/**
 * Supabase クライアントを返す。
 *
 * 環境変数が未設定のまま黙って動く（＝認証もRLSも効かない状態でUIだけ動く）のを防ぐため、
 * 未設定なら明示的に例外を投げる。設定手順は README と .env.example を参照。
 */
export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase の環境変数が未設定です。.env.example をコピーして .env を作成し、' +
        'VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。',
    );
  }

  client ??= createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}
