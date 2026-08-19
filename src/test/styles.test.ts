import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * 実機で効いてくる CSS の約束を、崩れたら気付けるように固定する。
 *
 * ここで見ているのは、画面を見ただけでは分からない類の不具合ばかり
 * （iOS の自動ズーム、指の端末に残るホバー、小さすぎる的）。
 * 手元のブラウザでは再現しないので、値そのものを検査する。
 * 仕様書 specs/japanese-family-tree-mobile-design-specs.md の 2・3・6 章。
 */
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/** `@media (hover: hover) { … }` の中身を、対応する括弧まで数えて取り除く */
function withoutHoverGuard(source: string): string {
  const marker = '@media (hover: hover) {';
  let rest = source;

  for (;;) {
    const at = rest.indexOf(marker);
    if (at === -1) return rest;

    let depth = 0;
    let end = at + marker.length - 1;
    for (let i = at + marker.length - 1; i < rest.length; i++) {
      if (rest[i] === '{') depth++;
      if (rest[i] === '}') depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
    rest = rest.slice(0, at) + rest.slice(end + 1);
  }
}

describe('index.css', () => {
  it('入力欄の文字は 16px 以上（iOS が勝手に拡大しない）', () => {
    const block = /\binput,\s*\nselect,\s*\ntextarea \{([^}]*)\}/.exec(css);
    expect(block).not.toBeNull();

    const size = /font-size:\s*([\d.]+)rem/.exec(block?.[1] ?? '');
    expect(Number(size?.[1])).toBeGreaterThanOrEqual(1);
  });

  it('入力欄の標準の見た目を消している', () => {
    expect(css).toMatch(/\bappearance: none;/);
  });

  it('横向きにしたときの文字の自動拡大を止めている', () => {
    expect(css).toMatch(/text-size-adjust: 100%;/);
  });

  it('ホバーの装飾は、マウスのある端末だけに閉じ込めている', () => {
    // 指の端末では、離してもホバーが解除されず「押しっぱなし」に見えてしまう
    expect(withoutHoverGuard(css)).not.toMatch(/:hover/);
  });

  it('12px を下回る文字を置かない', () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].map((match) => Number(match[1]));

    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0.75);
  });

  it('指で狙う的の下限（44px）を変数で持っている', () => {
    expect(css).toMatch(/--tap:\s*2\.75rem;/);
  });
});
