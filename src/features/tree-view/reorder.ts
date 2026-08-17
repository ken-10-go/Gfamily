/**
 * きょうだいをドラッグで並べ替えるときの判定。
 *
 * 描画とは切り離した純粋関数にしてある。座標だけを見て「どの順になるか」を決める。
 */

/** 並べ替えの対象。`x` はカードの中心のX座標（レイアウト座標）。 */
export interface SiblingSlot {
  id: string;
  x: number;
}

/**
 * 離した位置から、新しいきょうだいの並びを返す。並びが変わらなければ null。
 *
 * 動かした人をいったん抜き、離した位置がどのカードより左かで差し込み先を決める。
 * 「どれだけ動いたか」ではなく「どこで離したか」で見るので、
 * 大きく動かしても行き先は1つに定まる。
 *
 * 入力の配列は書き換えない。
 */
export function siblingOrderAfterDrag(
  siblings: SiblingSlot[],
  draggedId: string,
  droppedX: number,
): string[] | null {
  const current = [...siblings].sort((a, b) => a.x - b.x);
  const from = current.findIndex((slot) => slot.id === draggedId);
  if (from === -1 || current.length < 2) return null;

  const others = current.filter((slot) => slot.id !== draggedId);
  // 離した位置より右にいる最初のカードの手前へ入る
  const to = others.findIndex((slot) => droppedX < slot.x);
  const index = to === -1 ? others.length : to;

  const next = others.map((slot) => slot.id);
  next.splice(index, 0, draggedId);

  const before = current.map((slot) => slot.id);
  return next.every((id, i) => id === before[i]) ? null : next;
}

/**
 * ドラッグ中に、どのカードとすれ違っているか。
 *
 * 入れ替わる相手だけを元の位置へずらして見せるために使う。
 * 図の全体を組み直すより軽く、どこへ入るかも伝わる。
 * すれ違っていなければ null。
 */
export function swapPreview(
  siblings: SiblingSlot[],
  draggedId: string,
  currentX: number,
): { partnerId: string; dx: number } | null {
  const next = siblingOrderAfterDrag(siblings, draggedId, currentX);
  if (!next) return null;

  const sorted = [...siblings].sort((a, b) => a.x - b.x);
  const from = sorted.findIndex((slot) => slot.id === draggedId);
  const to = next.indexOf(draggedId);
  if (from === to) return null;

  // 動かした先にいたカードが、動かした人の元の場所へ入れ替わる
  const partner = sorted[to];
  if (!partner) return null;

  return { partnerId: partner.id, dx: sorted[from].x - partner.x };
}

/**
 * きょうだいの列から大きく外れた位置か。
 *
 * 外れているなら、並べ替えではなく「その場所に置きたい」という操作とみなす。
 * きょうだいが自分ひとりのときも、並べ替えようがないので外れているとする。
 */
export function isOutsideSiblingRow(
  siblings: SiblingSlot[],
  draggedId: string,
  droppedX: number,
  slotWidth: number,
): boolean {
  const others = siblings.filter((slot) => slot.id !== draggedId);
  if (others.length === 0) return true;

  const left = Math.min(...others.map((slot) => slot.x));
  const right = Math.max(...others.map((slot) => slot.x));

  return droppedX < left - slotWidth || droppedX > right + slotWidth;
}
