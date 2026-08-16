import { useContext } from 'react';

import { TreeKeyContext, type TreeKeyState } from '@/features/e2ee/TreeKeyContext';

/** 機微項目の鍵を使う。TreeKeyProvider の外では鍵なしとして振る舞う。 */
export function useTreeKey(): TreeKeyState {
  return useContext(TreeKeyContext) ?? LOCKED;
}

/** 鍵を持たないときの動き。機微項目は読めず、書き換えもしない。 */
const LOCKED: TreeKeyState = {
  unlocked: false,
  unlock: async () => {
    throw new Error('この画面では暗号化を利用できません');
  },
  lock: () => {},
  decrypt: async () => null,
  encrypt: async () => null,
};
