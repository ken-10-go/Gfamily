/**
 * 機微な項目の端末内暗号化（E2EE）。
 *
 * 本籍地・住所・戒名・お墓・思い出のメモは、サーバー（Google Cloud）側でも
 * 解読できない形で保存する。暗号化と復号はこの端末のメモリ上だけで行い、
 * Firestore には暗号文と初期化ベクトル、認証タグしか送らない。
 *
 * 仕様: specs/japanese-family-tree-security-specs-v3.md
 *   鍵導出 PBKDF2-HMAC-SHA256 / 10万回 / 256bit、暗号化 AES-256-GCM、IV 12バイト。
 *
 * 鍵はパスフレーズとツリーごとのソルトから毎回導出する。パスフレーズも鍵も保存しない。
 * 紛失すると復号は数学的に不可能で、運営でも復元できない。
 * ただし氏名・生没年・関係は暗号化しないので、家系図の骨組みは残る。
 */

/** Firestore に入る暗号文の入れ物。すべて Base64。 */
export interface EncryptedPayload {
  /** 初期化ベクトル（12バイト） */
  iv: string;
  /** 暗号文 */
  ciphertext: string;
  /** 認証タグ（16バイト）。改ざんの検知に使う */
  tag: string;
}

/** 暗号化して保存する項目。復号するとこの形に戻る。 */
export interface SensitiveFields {
  /** 本籍地 */
  honseki: string;
  /** 現住所 */
  address: string;
  /** 戒名・法名・法号 */
  kaimyo: string;
  /** お墓の場所・墓石の刻字など */
  graveLocation: string;
  /** 生前のエピソード・思い出話 */
  biographyNotes: string;
}

export const EMPTY_SENSITIVE: SensitiveFields = {
  honseki: '',
  address: '',
  kaimyo: '',
  graveLocation: '',
  biographyNotes: '',
};

/** 鍵導出のパラメータ。仕様書の固定値なので変更しない（変えると既存データを復号できなくなる）。 */
const PBKDF2_ITERATIONS = 100_000;
const KEY_BITS = 256;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SALT_BYTES = 32;

/** 復号できなかったことを表す。パスフレーズ違いと改ざんの区別はつかない。 */
export class DecryptionError extends Error {
  constructor() {
    super('復号キーが異なります');
    this.name = 'DecryptionError';
  }
}

const subtle = () => {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error('この環境では暗号化を利用できません');
  return api;
};

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

/** ツリーごとのソルト。作成時に1度だけ生成し、平文で保存してよい。 */
export function generateSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64(bytes);
}

/**
 * パスフレーズとソルトから鍵を導く。
 * 同じ組み合わせからは必ず同じ鍵が出る。10万回のストレッチングで1〜2秒かかる。
 */
export async function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const material = await subtle().importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return subtle().deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(salt) as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * 機微項目を暗号化する。すべて空なら null を返し、無駄な暗号文を残さない。
 *
 * Web Crypto は認証タグを暗号文の末尾に付けて返すが、保存時は仕様に合わせて
 * 末尾16バイトを tag として切り出す。Flutter 側の実装（pointycastle など）とも
 * そのまま読み書きできる形にしておくため。
 */
export async function encryptSensitive(
  key: CryptoKey,
  fields: SensitiveFields,
): Promise<EncryptedPayload | null> {
  if (isEmpty(fields)) return null;

  const iv = new Uint8Array(IV_BYTES);
  globalThis.crypto.getRandomValues(iv);

  const sealed = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource, tagLength: TAG_BYTES * 8 },
      key,
      new TextEncoder().encode(JSON.stringify(fields)),
    ),
  );

  return {
    iv: toBase64(iv),
    ciphertext: toBase64(sealed.slice(0, sealed.length - TAG_BYTES)),
    tag: toBase64(sealed.slice(sealed.length - TAG_BYTES)),
  };
}

/** 暗号文を戻す。鍵が違う・壊れているときは DecryptionError を投げる。 */
export async function decryptSensitive(
  key: CryptoKey,
  payload: EncryptedPayload,
): Promise<SensitiveFields> {
  const ciphertext = fromBase64(payload.ciphertext);
  const tag = fromBase64(payload.tag);

  // 保存時に切り離した認証タグを、復号のために末尾へ戻す
  const sealed = new Uint8Array(ciphertext.length + tag.length);
  sealed.set(ciphertext);
  sealed.set(tag, ciphertext.length);

  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(payload.iv) as unknown as BufferSource,
        tagLength: TAG_BYTES * 8,
      },
      key,
      sealed as unknown as BufferSource,
    );
  } catch {
    throw new DecryptionError();
  }

  return { ...EMPTY_SENSITIVE, ...(JSON.parse(new TextDecoder().decode(plain)) as SensitiveFields) };
}

/** 入力が全部空か。空のまま暗号化しても意味がないので、保存前に判定する。 */
export function isEmpty(fields: SensitiveFields): boolean {
  return Object.values(fields).every((value) => !value.trim());
}
