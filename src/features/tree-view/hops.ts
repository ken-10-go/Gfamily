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

/** 段をひとつ上げるときの高さ。詰めすぎると別の段に見えない。 */
const LANE_GAP = 10;

/** 家族の横棒の位置。段を決めるのにも、線を引くのにも使う。 */
interface BusBar {
  key: string;
  /** 段をずらす前の高さ。世代の間のちょうど真ん中 */
  baseY: number;
  left: number;
  right: number;
  /** 親の下端。段を上げすぎて幹が潰れないかの判定に使う */
  parentBottom: number;
}

/** 家族ごとの横棒の位置を、レイアウトから割り出す。 */
function busBars(
  families: FamilyUnit[],
  positionById: ReadonlyMap<string, LayoutNode>,
  metrics: LayoutMetrics,
): BusBar[] {
  const bars: BusBar[] = [];

  for (const family of families) {
    const parents = family.parentIds
      .map((id) => positionById.get(id))
      .filter((node): node is LayoutNode => Boolean(node));
    const children = family.childIds
      .map((id) => positionById.get(id))
      .filter((node): node is LayoutNode => Boolean(node));

    if (parents.length === 0 || children.length === 0) continue;

    const parentX = parents.reduce((sum, parent) => sum + parent.x, 0) / parents.length;
    const xs = [...children.map((child) => child.x), parentX];

    bars.push({
      key: family.key,
      baseY: Math.min(...children.map((child) => child.y)) - metrics.vGap / 2,
      left: Math.min(...xs),
      right: Math.max(...xs),
      parentBottom: Math.max(...parents.map((parent) => parent.y)) + metrics.nodeHeight,
    });
  }

  return bars;
}

/**
 * 家族ごとの、きょうだいの横棒の高さ。
 *
 * 同じ世代に子を持つ家族の横棒は、放っておくと全部同じ高さに並ぶ。
 * 左右の範囲が重なると2本が完全に重なって1本に見えてしまい、
 * どちらの家のきょうだいなのか読めなくなる（弧では表せない）。
 *
 * そこで、重なるものだけを1段ずつ上へ逃がす。左から順に、
 * すでにその段にある横棒とぶつからない一番下の段へ入れる。
 * ずらすことで別の家族の縦線と本当に交差するようになるので、飛び越えもここで効く。
 *
 * 純粋関数。返すのは「家族の key → 横棒の y」。
 */
export function busLanes(
  families: FamilyUnit[],
  positionById: ReadonlyMap<string, LayoutNode>,
  metrics: LayoutMetrics,
): Map<string, number> {
  const bars = busBars(families, positionById, metrics);
  const lanes = new Map<string, number>();

  const byBaseY = new Map<number, BusBar[]>();
  for (const bar of bars) {
    byBaseY.set(bar.baseY, [...(byBaseY.get(bar.baseY) ?? []), bar]);
  }

  for (const group of byBaseY.values()) {
    // 段ごとに「そこへ入れた横棒」を持ち、左から順に空いている段を探す
    const occupied: BusBar[][] = [];

    for (const bar of [...group].sort((a, b) => a.left - b.left || a.right - b.right)) {
      // 幹が潰れない範囲でしか上げられない。足りなければ一番下の段へ戻す
      const maxLane = Math.max(0, Math.floor((bar.baseY - bar.parentBottom - 8) / LANE_GAP));

      let lane = 0;
      while (
        lane < maxLane &&
        (occupied[lane] ?? []).some((other) => other.right > bar.left && other.left < bar.right)
      ) {
        lane += 1;
      }

      occupied[lane] = [...(occupied[lane] ?? []), bar];
      lanes.set(bar.key, bar.baseY - lane * LANE_GAP);
    }
  }

  return lanes;
}

/**
 * 家系図の縦線をすべて集める。親から下りる幹と、子へ下りる枝。
 *
 * 横線がまたぐ相手はこれだけなので、1回集めておいて全部の横線で使い回す。
 * 横棒の高さは `busLanes` が決めた値を使う。描画側（FamilyLines）も同じ値を使うこと。
 * 片方だけ変えると弧の位置がずれる。
 */
export function verticalSegments(
  families: FamilyUnit[],
  positionById: ReadonlyMap<string, LayoutNode>,
  metrics: LayoutMetrics,
  lanes: ReadonlyMap<string, number>,
): Segment[] {
  const segments: Segment[] = [];

  for (const bar of busBars(families, positionById, metrics)) {
    const busY = lanes.get(bar.key) ?? bar.baseY;
    const family = families.find((candidate) => candidate.key === bar.key);
    if (!family) continue;

    const parents = family.parentIds
      .map((id) => positionById.get(id))
      .filter((node): node is LayoutNode => Boolean(node));
    const parentX = parents.reduce((sum, parent) => sum + parent.x, 0) / parents.length;

    segments.push({ x1: parentX, y1: bar.parentBottom, x2: parentX, y2: busY, owner: bar.key });

    for (const id of family.childIds) {
      const child = positionById.get(id);
      if (child) {
        segments.push({ x1: child.x, y1: busY, x2: child.x, y2: child.y, owner: bar.key });
      }
    }
  }

  return segments;
}
