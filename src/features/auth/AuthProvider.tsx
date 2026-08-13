import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';

import { AuthContext, type AuthState } from '@/features/auth/AuthContext';
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase';

/** ログインリンクを要求したメールアドレスの控え。別タブで開かれた場合は入力を促す。 */
const EMAIL_STORAGE_KEY = 'familytree:signInEmail';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 環境変数が未設定でもアプリ自体は起動させる。ここで例外を投げると画面が真っ白になり、
    // ログイン画面に出している「.env を作成してください」という案内が届かなくなる。
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  // メール内のログインリンクから戻ってきた場合の処理
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const auth = getFirebaseAuth();
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    const email =
      window.localStorage.getItem(EMAIL_STORAGE_KEY) ??
      window.prompt('確認のため、リンクを要求したメールアドレスを入力してください') ??
      '';
    if (!email) return;

    void signInWithEmailLink(auth, email, window.location.href)
      .then(() => {
        window.localStorage.removeItem(EMAIL_STORAGE_KEY);
        // トークンを含むURLを履歴に残さない
        window.history.replaceState({}, '', window.location.pathname);
      })
      .catch(() => {
        // 失敗時はログイン画面のフォームから再試行してもらう
      });
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    } catch (error) {
      throw new Error(translateAuthError(error));
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    // 常にアカウント選択を出す。家族で端末を共有していても取り違えにくくする。
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      await signInWithPopup(getFirebaseAuth(), provider);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code ?? '';
      // 利用者が自分で閉じた場合はエラー表示しない
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      throw new Error(translateAuthError(error));
    }
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    try {
      await sendSignInLinkToEmail(getFirebaseAuth(), email, {
        url: window.location.origin,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
    } catch (error) {
      throw new Error(translateAuthError(error));
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signInWithPassword, signInWithGoogle, sendMagicLink, signOut }),
    [user, loading, signInWithPassword, signInWithGoogle, sendMagicLink, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Firebase のエラーコードのうち、利用者が実際に遭遇するものだけ日本語にする。 */
function translateAuthError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'メールアドレスまたはパスワードが正しくありません';
    case 'auth/invalid-email':
      return 'メールアドレスの形式が正しくありません';
    case 'auth/user-disabled':
      return 'このアカウントは無効化されています';
    case 'auth/admin-restricted-operation':
      // 新規登録が無効なプロジェクトで、未登録アカウントがログインを試みたとき
      return 'このアカウントはまだ登録されていません。招待を受けてからログインしてください';
    case 'auth/operation-not-allowed':
      return 'このログイン方法は現在利用できません。管理者にお問い合わせください';
    case 'auth/account-exists-with-different-credential':
      return 'このメールアドレスは別のログイン方法で登録済みです。そちらでログインしてください';
    case 'auth/popup-blocked':
      return 'ポップアップがブロックされました。ブラウザの設定で許可してください';
    case 'auth/unauthorized-domain':
      return 'このドメインからのログインは許可されていません。管理者にお問い合わせください';
    case 'auth/too-many-requests':
      return '試行回数が多すぎます。しばらく待ってからお試しください';
    default:
      return error instanceof Error ? error.message : 'ログインに失敗しました';
  }
}
