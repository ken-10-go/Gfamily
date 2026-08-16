import { createContext } from 'react';

import type { SensitiveFields } from '@/lib/crypto';

export interface TreeKeyState {
  /** 鍵が使える状態か。false なら機微項目は伏せる */
  unlocked: boolean;
  /** パスフレーズから鍵を導く。ソルトが無いツリーには先に付ける */
  unlock: (passphrase: string) => Promise<void>;
  /** 鍵を捨てる。共有端末で席を立つときなど */
  lock: () => void;
  /** 暗号化済みの項目を復号する。鍵が無ければ null */
  decrypt: (payload: unknown) => Promise<SensitiveFields | null>;
  /** 保存用に暗号化する。鍵が無ければ null（＝機微項目は書き換えない） */
  encrypt: (fields: SensitiveFields) => Promise<unknown>;
}

/**
 * 機微項目の鍵を持ち回るための入れ物。
 *
 * 鍵はこのコンテキスト（＝メモリ）の中だけに置く。localStorage などに保存すると、
 * 端末を触れる人が誰でも復号できてしまい、E2EE の意味が無くなる。
 * 画面を再読み込みしたらパスフレーズを入れ直す。
 */
export const TreeKeyContext = createContext<TreeKeyState | null>(null);
