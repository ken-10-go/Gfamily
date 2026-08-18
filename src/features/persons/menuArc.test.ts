import { describe, expect, it } from 'vitest';

import { arcPositions, ARC_RADIUS, menuPlacement } from '@/features/persons/menuArc';

const size = { width: 200, height: 160 };
const desktop = { width: 1280, height: 800 };

describe('arcPositions', () => {
  it('左へ開くと左右が反転する', () => {
    const right = arcPositions(5, 'right');
    const left = arcPositions(5, 'left');

    expect(right.every((spoke) => spoke.dx > 0)).toBe(true);
    expect(left.map((spoke) => spoke.dx)).toEqual(right.map((spoke) => -spoke.dx));
  });
});

describe('menuPlacement', () => {
  it('狭い画面では画面下のシートにする', () => {
    expect(menuPlacement({ x: 10, y: 10 }, size, { width: 390, height: 844 }, true).sheet).toBe(
      true,
    );
  });

  it('弧が右にはみ出すなら左へ開く', () => {
    const placement = menuPlacement({ x: 1240, y: 400 }, size, desktop, true);
    expect(placement.side).toBe('left');
  });

  it('弧のボタンが画面の外に出ないところまで内側へ寄せる', () => {
    const placement = menuPlacement({ x: 1275, y: 795 }, size, desktop, true);
    const reach = ARC_RADIUS + 56;
    const edge = placement.side === 'right' ? placement.x + reach : placement.x - reach;

    // 弧の左右の端も、上下の端も画面の中に収まる
    expect(edge).toBeGreaterThanOrEqual(0);
    expect(edge).toBeLessThanOrEqual(desktop.width);
    expect(placement.y - ARC_RADIUS).toBeGreaterThanOrEqual(0);
    expect(placement.y + ARC_RADIUS).toBeLessThanOrEqual(desktop.height);
  });

  it('弧を出さないときは、枠が収まるだけ寄せる', () => {
    const placement = menuPlacement({ x: 1270, y: 780 }, size, desktop, false);

    expect(placement.x + size.width).toBeLessThanOrEqual(desktop.width);
    expect(placement.y + size.height).toBeLessThanOrEqual(desktop.height);
  });
});
