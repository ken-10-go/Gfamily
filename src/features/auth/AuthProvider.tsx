import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { AuthContext, type AuthState } from '@/features/auth/AuthContext';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 環境変数が未設定でもアプリ自体は起動させる。ここで例外を投げると画面が真っ白になり、
    // ログイン画面に出している「.env を作成してください」という案内が届かなくなる。
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) throw new Error(translateAuthError(error.message));
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    // shouldCreateUser: false が肝。ログインリンクの要求だけでアカウントが
    // 作られてしまうと「一般公開の新規登録は行わない」方針が崩れる。
    const { error } = await getSupabaseClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    });
    if (error) throw new Error(translateAuthError(error.message));
  }, []);

  const signOut = useCallback(async () => {
    await getSupabaseClient().auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signInWithPassword,
      sendMagicLink,
      signOut,
    }),
    [session, loading, signInWithPassword, sendMagicLink, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Supabase の英語メッセージのうち、利用者が実際に遭遇するものだけ日本語にする。 */
function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return 'メールアドレスまたはパスワードが正しくありません';
  }
  if (/signups not allowed|not authorized/i.test(message)) {
    return 'このメールアドレスは登録されていません。管理者に招待を依頼してください';
  }
  if (/email rate limit|too many requests/i.test(message)) {
    return '試行回数が多すぎます。しばらく待ってからお試しください';
  }
  return message;
}
