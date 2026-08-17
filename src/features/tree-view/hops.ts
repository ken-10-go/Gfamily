/**
 * 交差した関係線の「飛び越え」。
 *
 * 家系図では、別の家から伸びてきた線と自分の家の線が同じ見た目で交わり、
 * どちらがどこへつながっているのか読めなくなることがある。
 * 回路図と同じ約束で、**横線が縦線をまたぐ**ときだけ小さな弧を描いて示す。
 *
 * 描画から切り離した純粋関数だけを置く。
 */

import type { LayoutMetrics, LayoutNode, FamilyUnit } from '@/features/tree-view/layout';

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** どの夫婦・どの家族が引いた線か。同じ持ち主どうしは交差とみなさない。 */
  owner: string;
}

/** 弧の半径。カードの線幅に対して小さすぎると読めず、大きすぎると線が波打つ。 */
export const HOP_RADIUS = 5;

/**
 * 端点のすぐそばは交差とみなさない余白。
 *
 * 親から下りる幹はきょうだいの横棒に「刺さって」終わる。これは交差ではなく接続なので、
 * 弧を出してはいけない。持ち主が同じなら除外できるが、
 * 別の家族の線がたまたま同じ点で終わることもあるため、端点の近くも外す。
 */
const EPSILON = 1;

/** a が [min, max] の内側にあるか（端は含めない）。 */
const strictlyBetween = (value: number, a: number, b: number) =>
  value > Math.min(a, b) + EPSILON && value < Math.max(a, b) - EPSILON;

/**
 * 横線と交わる縦線の X 座標を、左から順に返す。
 *
 * 同じ持ち主の縦線は、その横線につながっている線なので数えない。
 */
export function crossingsOn(horizontal: Segment, verticals: Segment[]): number[] {
  const y = horizontal.y1;

  const xs = verticals
    .filter(
      (vertical) =>
        vertical.owner !== horizontal.owner &&
        strictlyBetween(vertical.x1, horizontal.x1, horizontal.x2) &&
        strictlyBetween(y, vertical.y1, vertical.y2),
    )
    .map((vertical) => vertical.x1);

  // 同じ位置に何本重なっていても、弧は1つでよい
  return [...new Set(xs)].sort((a, b) => a - b);
}

/**
 * 交差点に弧を挟んだ横線の `d` 属性を返す。
 *
 * 交差が無ければまっすぐな線を返すので、呼ぶ側は常に `<path>` を出せばよい。
 * `from` から `to` へ、左右どちら向きでも引ける。弧は上へ膨らませる。
 */
export function hopPath(
  y: number,
  from: number,
  to: number,
  crossings: number[],
  radius: number = HOP_RADIUS,
): string {
  const left = Math.min(from, to);
  const right = Math.max(from, to);

  // 線の外や端すれすれの交差は、弧を描く余地が無いので飛ばす
  const hops = crossings
    .filter((x) => x - radius > left && x + radius < right)
    .sort((a, b) => a - b);

  if (hops.length === 0) return `M ${left} ${y} H ${right}`;

  let cursor = left;
  let d = `M ${left} ${y}`;

  hops.forEach((x, index) => {
    // 弧どうしがぶつかるときは、手前で切って半径を詰める（弧を潰さず、間を空けない）
    const start = Math.max(x - radius, cursor);
    const end = Math.min(x + radius, index + 1 < hops.length ? (x + hops[index + 1]) / 2 : right);
    if (end <= start) return;

    if (start > cursor) d += ` H ${start}`;
    // 上へ膨らむ半円。sweep-flag 1 で時計回り＝左から右へ引くと上に出る
    d += ` A ${radius} ${radius} 0 0 1 ${end} ${y}`;
    cursor = end;
  });

  return cursor < right ? `${d} H ${right}` : d;
}

/**
 * 家系図の縦線をすべて集める。親から下りる幹と、子へ下りる枝。
 *
 * 横線がまたぐ相手はこれだけなので、1回集めておいて全部の横線で使い回す。
 * 描画側（FamilyLines）と同じ式で座標を出すこと。ずれると弧の位置が合わない。
 */
export function verticalSegments(
  families: FamilyUnit[],
  positionById: ReadonlyMap<string, LayoutNode>,
  metrics: LayoutMetrics,
): Segment[] {
  const segments: Segment[] = [];

  for (const family of families) {
    const parents = family.parentIds
      .map((id) => positionById.get(id))
      .filter((node): node is LayoutNode => Boolean(node));
    const children = family.childIds
      .map((id) => positionById.get(id))
      .filter((node): node is LayoutNode => Boolean(node));

    if (parents.length === 0 || children.length === 0) continue;

    const parentX = parents.reduce((sum, parent) => sum + parent.x, 0) / parents.length;
    const parentBottom = Math.max(...parents.map((p) => p.y)) + metrics.nodeHeight;
    const busY = Math.min(...children.map((c) => c.y)) - metrics.vGap / 2;

    segments.push({ x1: parentX, y1: parentBottom, x2: parentX, y2: busY, owner: family.key });

    for (const child of children) {
      segments.push({ x1: child.x, y1: busY, x2: child.x, y2: child.y, owner: family.key });
    }
  }

  return segments;
}
