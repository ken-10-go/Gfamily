/** 弧の半径（ピクセル）。カードに重ならず、指が届く範囲。 */
export const ARC_RADIUS = 112;

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

/** 弧のボタン1つの、中心から左右への張り出し。位置決めの余白に使う。 */
const SPOKE_REACH = 56;

/** 画面の端に残す余白。 */
const MARGIN = 8;

/**
 * 狭い画面では、弧ではなく画面下のシートにする。
 *
 * 弧はカードのまわりに 96px 張り出すので、スマホの幅では必ずどこかが画面の外へ出る。
 * 「押せないボタンがある」状態になるくらいなら、確実に押せる形に切り替える。
 */
export const SHEET_MAX_WIDTH = 640;

export interface MenuPlacement {
  x: number;
  y: number;
  side: 'left' | 'right';
  /** 画面下のシートとして出すか */
  sheet: boolean;
}

/**
 * メニューを画面の内側に収める位置を決める。
 *
 * 弧を出すときは、ボタンが張り出すぶん（`ARC_RADIUS` ＋ ボタンの幅の半分）も
 * 見込んで内側へ寄せる。これをしないと、端のカードで弧の一部が画面の外に出て
 * 押せなくなる。左右は、余裕のあるほうへ開く。
 *
 * 純粋関数。DOM を見ないので、そのままテストできる。
 */
export function menuPlacement(
  anchor: { x: number; y: number },
  size: { width: number; height: number },
  screen: { width: number; height: number },
  radial: boolean,
): MenuPlacement {
  if (screen.width <= SHEET_MAX_WIDTH) return { x: 0, y: 0, side: 'right', sheet: true };

  const reachX = radial ? ARC_RADIUS + SPOKE_REACH : 0;
  const reachY = radial ? ARC_RADIUS + 24 : 0;

  // 右に開くと収まらず、左には収まるときだけ左へ開く
  const fitsRight = anchor.x + reachX + MARGIN <= screen.width;
  const side = fitsRight || anchor.x - reachX - MARGIN < 0 ? 'right' : 'left';

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, Math.max(min, max)));

  // 右へどれだけ広がるか。弧のときは枠を出さないので、張り出しだけを見る
  const rightExtent = radial ? (side === 'right' ? reachX : 0) : size.width;

  return {
    x: clamp(
      anchor.x,
      MARGIN + (side === 'left' ? reachX : 0),
      screen.width - MARGIN - rightExtent,
    ),
    y: clamp(anchor.y, MARGIN + reachY, screen.height - MARGIN - reachY - size.height),
    side,
    sheet: false,
  };
}
