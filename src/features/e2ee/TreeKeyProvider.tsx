import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { TreeKeyContext } from '@/features/e2ee/TreeKeyContext';
import * as api from '@/lib/api';
import {
  decryptSensitive,
  deriveKey,
  encryptSensitive,
  type EncryptedPayload,
  type SensitiveFields,
} from '@/lib/crypto';

/**
 * ツリー1つぶんの暗号鍵を預かる。
 *
 * パスフレーズは受け取ってすぐ鍵に変換し、パスフレーズ自体は残さない。
 * 鍵も state（メモリ）にしか置かないので、再読み込みで消える。
 */
export function TreeKeyProvider({ treeId, children }: { treeId: string; children: ReactNode }) {
  const [key, setKey] = useState<CryptoKey | null>(null);

  const unlock = useCallback(
    async (passphrase: string) => {
      // 暗号化を使う前に作られたツリーには、この時点でソルトを付ける
      const salt = await api.ensureTreeSalt(treeId);
      setKey(await deriveKey(passphrase, salt));
    },
    [treeId],
  );

  const value = useMemo(
    () => ({
      unlocked: key !== null,
      unlock,
      lock: () => setKey(null),
      decrypt: async (payload: unknown) => {
        if (!key || !payload) return null;
        return decryptSensitive(key, payload as EncryptedPayload);
      },
      encrypt: async (fields: SensitiveFields) => {
        if (!key) return null;
        return encryptSensitive(key, fields);
      },
    }),
    [key, unlock],
  );

  return <TreeKeyContext.Provider value={value}>{children}</TreeKeyContext.Provider>;
}
