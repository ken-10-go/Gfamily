/**
 * ニックネームから、ログインに使うアドレスを作る。
 *
 * ⚠ **画面側（src/lib/nickname.ts）と同じ結果でなければならない。**
 * 食い違うと、登録はできたのにログインできない、という状態になる。
 * 突き合わせは src/lib/nickname.test.ts が行う（このファイルを直接読んで比べている）。
 *
 * ここに admin SDK を持ち込まないこと。画面側のテストから読めなくなる。
 */
export function loginEmailFor(nickname: string): string {
  const normalized = nickname.normalize('NFKC').trim().toLowerCase();
  const readable = normalized.replace(/[^a-z0-9]/g, '').slice(0, 16);

  let hash = 0x811c9dc5;
  for (const char of normalized) {
    hash ^= char.codePointAt(0) as number;
    // 32bit に収めたまま掛ける（FNV の素数 16777619）
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `${readable || 'user'}-${hash.toString(36).padStart(7, '0')}@kizuna.invalid`;
}
