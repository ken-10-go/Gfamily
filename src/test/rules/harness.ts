import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { Firestore } from 'firebase/firestore';

const rulesPath = fileURLToPath(new URL('../../../firestore.rules', import.meta.url));

export async function createTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'familytree-rules-test',
    firestore: {
      rules: readFileSync(rulesPath, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

/**
 * rules-unit-testing が返すのは compat 版の Firestore 型で、modular API（firebase/firestore）
 * の型とは名目上一致しない。実体は同じで modular 関数にそのまま渡せるため、unknown 経由で
 * 型を合わせる。
 */
const asModular = (instance: unknown) => instance as Firestore;

/** 指定ユーザーとして操作するための Firestore ハンドル。 */
export function as(env: RulesTestEnvironment, uid: string, email?: string): Firestore {
  return asModular(env.authenticatedContext(uid, email ? { email } : undefined).firestore());
}

/** 未ログインの Firestore ハンドル。 */
export function asAnon(env: RulesTestEnvironment): Firestore {
  return asModular(env.unauthenticatedContext().firestore());
}

/**
 * ルールを迂回してデータを仕込む。
 * 「そもそも作れないデータ」に対する読み取り拒否を試すために使う。
 */
export async function seed(
  env: RulesTestEnvironment,
  write: (db: Firestore) => Promise<unknown>,
): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await write(asModular(context.firestore()));
  });
}
