import { describe, expect, it } from 'vitest';

import {
  DecryptionError,
  decryptSensitive,
  deriveKey,
  EMPTY_SENSITIVE,
  encryptSensitive,
  generateSalt,
  isEmpty,
  type SensitiveFields,
} from '@/lib/crypto';

const sample: SensitiveFields = {
  honseki: '東京都千代田区永田町1-7-1',
  address: '東京都千代田区永田町1-7-2',
  kaimyo: '釋大観太郎居士',
  graveLocation: '青山霊園 3区-25号',
  biographyNotes: '幼少期は本家で育ち、後に山田家へ婿養子に入る。',
};

// 10万回のストレッチングは1回あたり1秒前後かかるので、テストの待ち時間を延ばす
const TIMEOUT = 30_000;

describe('deriveKey', () => {
  it(
    '同じパスフレーズとソルトからは、同じ鍵が導かれる',
    async () => {
      const salt = generateSalt();
      const first = await deriveKey('家族だけの合言葉', salt);
      const second = await deriveKey('家族だけの合言葉', salt);

      const payload = await encryptSensitive(first, sample);
      expect(payload).not.toBeNull();
      // 別々に導いた鍵で復号できる＝同じ鍵になっている
      await expect(decryptSensitive(second, payload!)).resolves.toEqual(sample);
    },
    TIMEOUT,
  );

  it(
    'ソルトが違えば別の鍵になる',
    async () => {
      const key = await deriveKey('家族だけの合言葉', generateSalt());
      const other = await deriveKey('家族だけの合言葉', generateSalt());

      const payload = await encryptSensitive(key, sample);
      await expect(decryptSensitive(other, payload!)).rejects.toBeInstanceOf(DecryptionError);
    },
    TIMEOUT,
  );
});

describe('encryptSensitive / decryptSensitive', () => {
  it(
    '暗号化して戻すと元に戻る',
    async () => {
      const key = await deriveKey('合言葉', generateSalt());
      const payload = await encryptSensitive(key, sample);

      expect(payload?.iv).toBeTruthy();
      expect(payload?.ciphertext).toBeTruthy();
      expect(payload?.tag).toBeTruthy();
      // 平文が混ざっていないこと
      expect(payload?.ciphertext).not.toContain('永田町');

      await expect(decryptSensitive(key, payload!)).resolves.toEqual(sample);
    },
    TIMEOUT,
  );

  it(
    '違うパスフレーズでは復号できない',
    async () => {
      const salt = generateSalt();
      const key = await deriveKey('合言葉', salt);
      const wrong = await deriveKey('ちがう合言葉', salt);

      const payload = await encryptSensitive(key, sample);
      await expect(decryptSensitive(wrong, payload!)).rejects.toBeInstanceOf(DecryptionError);
    },
    TIMEOUT,
  );

  it(
    '暗号文が改ざんされていれば復号できない',
    async () => {
      const key = await deriveKey('合言葉', generateSalt());
      const payload = await encryptSensitive(key, sample);
      const tampered = { ...payload!, tag: btoa('0123456789abcdef') };

      await expect(decryptSensitive(key, tampered)).rejects.toBeInstanceOf(DecryptionError);
    },
    TIMEOUT,
  );

  it(
    '毎回ちがう初期化ベクトルを使う',
    async () => {
      const key = await deriveKey('合言葉', generateSalt());
      const first = await encryptSensitive(key, sample);
      const second = await encryptSensitive(key, sample);

      expect(first?.iv).not.toBe(second?.iv);
      expect(first?.ciphertext).not.toBe(second?.ciphertext);
    },
    TIMEOUT,
  );

  it(
    '中身が空なら暗号文を作らない',
    async () => {
      const key = await deriveKey('合言葉', generateSalt());
      await expect(encryptSensitive(key, EMPTY_SENSITIVE)).resolves.toBeNull();
      await expect(encryptSensitive(key, { ...EMPTY_SENSITIVE, honseki: '  ' })).resolves.toBeNull();
    },
    TIMEOUT,
  );
});

describe('generateSalt', () => {
  it('毎回ちがう値になる', () => {
    expect(generateSalt()).not.toBe(generateSalt());
  });
});

describe('isEmpty', () => {
  it('空白だけなら空とみなす', () => {
    expect(isEmpty(EMPTY_SENSITIVE)).toBe(true);
    expect(isEmpty({ ...EMPTY_SENSITIVE, kaimyo: '　' })).toBe(true);
    expect(isEmpty({ ...EMPTY_SENSITIVE, kaimyo: '釋' })).toBe(false);
  });
});
