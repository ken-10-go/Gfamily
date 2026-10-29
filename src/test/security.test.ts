import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 攻撃・不正への備えのうち、**画面を見ても気づけない**ものを検査する。
 *
 * 設定ファイルの1行が抜けただけで守りが外れるのに、
 * 外れても普段どおり動いてしまうものばかりなので、ここで固定する。
 */
const rules = readFileSync('firestore.rules', 'utf8');
const envExample = readFileSync('.env.example', 'utf8');
const deploy = readFileSync('.github/workflows/deploy.yml', 'utf8');

describe('他家とのつながり（treeBridges）', () => {
  it('クライアントから読み書きできない', () => {
    const block = rules.slice(rules.indexOf('match /treeBridges/'));
    expect(block).toContain('allow read, write: if false;');
  });

  it('他家を読むための抜け道（hasBridgeTo）がルールに残っていない', () => {
    // コメントの中の言及だけは、再開の手順として残してある
    const code = rules
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect(code).not.toContain('hasBridgeTo');
  });
});

describe('App Check（bot よけ）', () => {
  it('鍵の置き場所が .env.example に書いてある', () => {
    expect(envExample).toContain('VITE_RECAPTCHA_SITE_KEY');
  });

  it('本番のビルドへ鍵が渡る', () => {
    expect(deploy).toContain('VITE_RECAPTCHA_SITE_KEY');
  });
});
