import { describe, expect, it } from 'vitest';

import {
  isOutsideSiblingRow,
  siblingOrderAfterDrag,
  swapPreview,
  type SiblingSlot,
} from '@/features/tree-view/reorder';

/** 長男・次男・三男が 200px 間隔で並んでいる。 */
const siblings: SiblingSlot[] = [
  { id: '長男', x: 100 },
  { id: '次男', x: 300 },
  { id: '三男', x: 500 },
];

describe('siblingOrderAfterDrag', () => {
  it('右へ跨ぐと、その先へ入る', () => {
    expect(siblingOrderAfterDrag(siblings, '長男', 350)).toEqual(['次男', '長男', '三男']);
  });

  it('左へ跨ぐと、その手前へ入る', () => {
    expect(siblingOrderAfterDrag(siblings, '三男', 250)).toEqual(['長男', '三男', '次男']);
  });

  it('端まで動かせば端に入る', () => {
    expect(siblingOrderAfterDrag(siblings, '三男', 0)).toEqual(['三男', '長男', '次男']);
    expect(siblingOrderAfterDrag(siblings, '長男', 900)).toEqual(['次男', '三男', '長男']);
  });

  it('跨いでいなければ並びは変わらない', () => {
    expect(siblingOrderAfterDrag(siblings, '次男', 320)).toBeNull();
    expect(siblingOrderAfterDrag(siblings, '次男', 150)).toBeNull();
  });

  it('きょうだいが1人なら並べ替えようがない', () => {
    expect(siblingOrderAfterDrag([{ id: '長男', x: 100 }], '長男', 900)).toBeNull();
  });

  it('その家族にいない人を渡されても落ちない', () => {
    expect(siblingOrderAfterDrag(siblings, '他人', 300)).toBeNull();
  });

  it('入力の配列を書き換えない', () => {
    const before = JSON.stringify(siblings);
    siblingOrderAfterDrag(siblings, '長男', 900);
    expect(JSON.stringify(siblings)).toBe(before);
  });
});

describe('swapPreview', () => {
  it('すれ違った相手と、その相手を動かす量を返す', () => {
    expect(swapPreview(siblings, '長男', 350)).toEqual({ partnerId: '次男', dx: -200 });
  });

  it('左へ動かしたときは相手が右へずれる', () => {
    expect(swapPreview(siblings, '三男', 250)).toEqual({ partnerId: '次男', dx: 200 });
  });

  it('すれ違っていなければ何も返さない', () => {
    expect(swapPreview(siblings, '次男', 320)).toBeNull();
  });
});

describe('isOutsideSiblingRow', () => {
  const slot = 196;

  it('列の中で離したなら外れていない', () => {
    expect(isOutsideSiblingRow(siblings, '長男', 400, slot)).toBe(false);
  });

  it('列の左右へ大きく外したなら外れている', () => {
    expect(isOutsideSiblingRow(siblings, '長男', -200, slot)).toBe(true);
    expect(isOutsideSiblingRow(siblings, '長男', 800, slot)).toBe(true);
  });

  it('少しはみ出したくらいでは、まだ列の中とみなす', () => {
    expect(isOutsideSiblingRow(siblings, '長男', 600, slot)).toBe(false);
  });

  it('きょうだいが自分だけなら、いつでも外れている扱い', () => {
    expect(isOutsideSiblingRow([{ id: '長男', x: 100 }], '長男', 100, slot)).toBe(true);
  });
});
