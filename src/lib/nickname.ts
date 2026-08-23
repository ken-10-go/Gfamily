/**
 * ニックネームでログインできるようにするための取り決め。
 *
 * Firebase のパスワード認証は、識別子としてメールアドレスの形しか受け取らない。
 * そこで **ニックネームから決まった形のアドレスを作って**、それを内部の識別子にする。
 * 使う人はニックネームとパスワードだけを覚えていればよい。
 *
 * このアドレスにはメールが届かない（`.invalid` は届かないと決められている名前）。
 * パスワードを忘れたときは、再設定メールではなく**オーナーが仮のパスワードを配る**。
 *
 * 純粋関数。同じニックネームからは、いつでも同じアドレスができる。
 */

/** 内部でだけ使うアドレスの尻尾。メールは届かない（RFC 2606 の予約名）。 */
export const NICKNAME_DOMAIN = 'kizuna.invalid';

/** ニックネームとして使える長さ。短すぎると取り違え、長すぎると画面に収まらない */
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

/**
 * 表記のゆれを寄せる。
 * 全角と半角、大文字と小文字、前後の空白の違いで別人にしないため。
 */
export function normalizeNickname(nickname: string): string {
  return nickname.normalize('NFKC').trim().toLowerCase();
}

/** 使ってよいニックネームか。だめな理由を返す（問題なければ null）。 */
export function nicknameProblem(nickname: string): string | null {
  const normalized = normalizeNickname(nickname);

  if (normalized.length < NICKNAME_MIN)
    return `ニックネームは${NICKNAME_MIN}文字以上にしてください`;
  if (normalized.length > NICKNAME_MAX)
    return `ニックネームは${NICKNAME_MAX}文字までにしてください`;
  // 記号だけの名前は、画面で見分けが付かない
  if (!/[\p{Letter}\p{Number}]/u.test(normalized)) return '文字か数字を入れてください';
  if (normalized.includes('@')) return 'ニックネームに @ は使えません';

  return null;
}

/**
 * ニックネームから、内部で使うアドレスを作る。
 *
 * 読める部分（英数字）を頭に残しつつ、同じ名前が必ず同じアドレスになるよう、
 * 全体から求めた短い印を後ろに付ける。日本語のニックネームでも使える
 * （アドレスに使える文字だけで組み立てるため）。
 */
export function loginEmailFor(nickname: string): string {
  const normalized = normalizeNickname(nickname);
  const readable = normalized.replace(/[^a-z0-9]/g, '').slice(0, 16);

  return `${readable || 'user'}-${fingerprint(normalized)}@${NICKNAME_DOMAIN}`;
}

/** そのアドレスは、ニックネームのために作ったものか（メールが届かない相手か）。 */
export function isNicknameAccount(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith(`@${NICKNAME_DOMAIN}`));
}

/**
 * 文字列から短い印を作る（FNV-1a）。
 * 暗号の用途ではない。同じ入力から同じ値が出て、違う名前がぶつかりにくければよい。
 */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5;

  for (const char of value) {
    hash ^= char.codePointAt(0) as number;
    // 32bit に収めたまま掛ける（FNV の素数 16777619）
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(36).padStart(7, '0');
}
