import { describe, expect, it } from 'vitest';

import { applyPinch, type Viewport } from '@/features/tree-view/usePanZoom';

const origin = { left: 0, top: 0 };
const start: Viewport = { x: 0, y: 0, scale: 1 };

describe('applyPinch', () => {
  it('指を倍に広げると倍率も倍になる', () => {
    const next = applyPinch(
      start,
      { distance: 100, centerX: 200, centerY: 200 },
      { distance: 200, centerX: 200, centerY: 200 },
      origin,
    );

    expect(next.scale).toBe(2);
  });

  it('指の中点の下にある座標が動かない', () => {
    const from = { distance: 100, centerX: 300, centerY: 150 };
    const to = { distance: 150, centerX: 300, centerY: 150 };

    // 中点の下にある図の座標（拡大の前後で同じはず）
    const before = (from.centerX - start.x) / start.scale;
    const next = applyPinch(start, from, to, origin);
    const after = (to.centerX - next.x) / next.scale;

    expect(after).toBeCloseTo(before, 5);
  });

  it('中点が動いたぶんは、そのまま図も動く', () => {
    const next = applyPinch(
      start,
      { distance: 100, centerX: 100, centerY: 100 },
      { distance: 100, centerX: 160, centerY: 120 },
      origin,
    );

    expect(next.scale).toBe(1);
    expect(next.x).toBeCloseTo(60);
    expect(next.y).toBeCloseTo(20);
  });

  it('上限を超えて広げても、その倍率で位置がそろう', () => {
    const from = { distance: 100, centerX: 200, centerY: 200 };
    const to = { distance: 10000, centerX: 200, centerY: 200 };
    const next = applyPinch(start, from, to, origin);

    expect(next.scale).toBe(2.5);
    // 実際に効いた倍率で補正しているので、中点の下の座標は保たれる
    expect((to.centerX - next.x) / next.scale).toBeCloseTo(from.centerX / start.scale, 5);
  });
});
