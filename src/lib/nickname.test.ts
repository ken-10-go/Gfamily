import { describe, expect, it } from 'vitest';

import {
  isNicknameAccount,
  loginEmailFor,
  nicknameProblem,
  normalizeNickname,
} from '@/lib/nickname';
import { loginEmailFor as serverLoginEmailFor } from '../../functions/src/loginEmail';

describe('normalizeNickname', () => {
  it('全角と半角、大文字と小文字、前後の空白の違いを寄せる', () => {
    expect(normalizeNickname(' Ｔａｒｏ ')).toBe('taro');
    expect(normalizeNickname('TARO')).toBe(normalizeNickname('taro'));
  });
});

describe('loginEmailFor', () => {
  it('同じニックネームからは、いつでも同じアドレスになる', () => {
    expect(loginEmailFor('たろう')).toBe(loginEmailFor(' たろう '));
  });

  it('違うニックネームは、別のアドレスになる', () => {
    expect(loginEmailFor('たろう')).not.toBe(loginEmailFor('はなこ'));
  });

  it('日本語だけの名前でも、アドレスの形になる', () => {
    const email = loginEmailFor('おじいちゃん');

    expect(email).toMatch(/^[a-z0-9-]+@kizuna\.invalid$/);
  });

  it('英数字は読める形で残す（管理画面で見当が付くように）', () => {
    expect(loginEmailFor('taro')).toMatch(/^taro-/);
  });

  it('決まった組み合わせが変わらない', () => {
    expect(loginEmailFor('taro')).toBe('taro-04ii9k9@kizuna.invalid');
    expect(loginEmailFor('test01')).toBe('test01-09tok0q@kizuna.invalid');
    expect(loginEmailFor('たろう')).toBe('user-1hl4vd9@kizuna.invalid');
  });

  it('Cloud Functions 側と、同じアドレスを作る', () => {
    /*
     * 登録は Cloud Functions が行い、ログインは画面側がこの関数で作った
     * アドレスで行う。**片方だけ変えると、登録できたのにログインできなくなる。**
     * 同じ実装を2つ持つことになるので、突き合わせをテストで固定する。
     */
    for (const nickname of ['taro', 'test01', 'たろう', 'ＴＥＳＴ 02', 'おじいちゃん']) {
      expect(serverLoginEmailFor(nickname), nickname).toBe(loginEmailFor(nickname));
    }
  });

  it('ニックネームのために作ったアドレスだと分かる', () => {
    expect(isNicknameAccount(loginEmailFor('taro'))).toBe(true);
    expect(isNicknameAccount('me@example.com')).toBe(false);
    expect(isNicknameAccount(null)).toBe(false);
  });
});

describe('nicknameProblem', () => {
  it('短すぎる・長すぎるものは断る', () => {
    expect(nicknameProblem('あ')).toContain('2文字以上');
    expect(nicknameProblem('あ'.repeat(21))).toContain('20文字まで');
  });

  it('記号だけの名前は断る', () => {
    expect(nicknameProblem('----')).toBe('文字か数字を入れてください');
  });

  it('@ は使えない（アドレスと取り違えるため）', () => {
    expect(nicknameProblem('a@b')).toContain('@');
  });

  it('ふつうの名前は通る', () => {
    expect(nicknameProblem('たろう')).toBeNull();
    expect(nicknameProblem('taro123')).toBeNull();
  });
});
