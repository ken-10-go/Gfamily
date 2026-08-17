/** 弧の半径（ピクセル）。カードに重ならず、指が届く範囲。 */
export const ARC_RADIUS = 96;

/** 弧が覆う角度。真横を 0 として上下に振り分ける。 */
const ARC_SPREAD = (150 * Math.PI) / 180;

/**
 * 弧に並べた項目の、中心からのずれを返す。
 *
 * `side` が `right` なら右へ開き、`left` なら左右を反転する（画面の端で切れないように）。
 * 1つのときは真横に置く。
 */
export function arcPositions(count: number, side: 'left' | 'right'): { dx: number; dy: number }[] {
  const direction = side === 'right' ? 1 : -1;

  return Array.from({ length: count }, (_, index) => {
    const ratio = count === 1 ? 0.5 : index / (count - 1);
    // 上から下へ並べる。-1/2 〜 +1/2 の範囲を等分する
    const angle = (ratio - 0.5) * ARC_SPREAD;

    return {
      dx: direction * ARC_RADIUS * Math.cos(angle),
      dy: ARC_RADIUS * Math.sin(angle),
    };
  });
}
