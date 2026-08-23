import { createContext } from 'react';
import type { User } from 'firebase/auth';

export interface AuthState {
  user: User | null;
  /** 初回のセッション復元が終わるまで true。ルート保護の判断を待たせるために使う。 */
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** メールとパスワードで新しくアカウントを作る（招待された人が自分で登録する） */
  registerWithPassword: (email: string, password: string) => Promise<void>;
  /** パスワードの再設定メールを送る。管理者が他の人に送ることもできる */
  sendPasswordReset: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
