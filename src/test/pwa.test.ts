import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * ホーム画面へ入れるための約束。
 *
 * どれか1つでも欠けると「追加」が出なくなるが、画面を見ても分からない
 * （ブラウザが黙って条件を満たさないと判断するだけ）。ファイルの中身を検査する。
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
  name: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; purpose?: string }[];
};

describe('ホーム画面へのインストール', () => {
  it('アプリとして開く指定がある', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.name).not.toBe('');
  });

  it('192と512のアイコンがあり、実体も置かれている', () => {
    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons.find((entry) => entry.sizes === size);
      expect(icon, `${size} のアイコン`).toBeTruthy();
      expect(() => readFileSync(resolve(process.cwd(), `public${icon?.src}`))).not.toThrow();
    }
  });

  it('丸く切り抜かれても欠けないアイコンを持つ', () => {
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('index.html から manifest と iOS 用のアイコンをつないでいる', () => {
    const html = read('index.html');

    expect(html).toContain('rel="manifest"');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('theme-color');
  });

  it('版を確かめる先を、ビルドのたびに置いている', () => {
    // これが無いと、ホーム画面に入れたアプリが古いまま気付けない
    const config = read('vite.config.ts');

    expect(config).toContain("fileName: 'version.json'");
    expect(read('src/features/app/useAppUpdate.ts')).toContain('version.json');
  });

  it('サービスワーカーは取得に手を出さない（古い版を掴ませない）', () => {
    // 溜め込むと、自動デプロイで新しい版が出ても古い画面のままになる
    const sw = read('public/sw.js');

    expect(sw).toContain('fetch');
    expect(sw).not.toMatch(/caches\./);
  });
});
