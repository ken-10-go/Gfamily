import { describe, expect, it } from 'vitest';

import { busLanes, crossingsOn, verticalSegments } from '@/features/tree-view/hops';
import { computeLayout, type LayoutMetrics, type TreeLayout } from '@/features/tree-view/layout';
import {
  cardMetrics,
  DEFAULT_VIEW_SETTINGS,
  type ViewSettings,
} from '@/features/tree-view/useViewSettings';
import {
  EMPTY_PERSON,
  type ParentChild,
  type Person,
  type TreeGraph,
  type Union,
} from '@/types/models';

/*
 * 実際のレイアウトが出す座標で確かめる。
 *
 * hops.test.ts は手で書いた座標で純粋関数の仕様を見ているが、それだけだと
 * 「実レイアウトではその座標が絶対に出ない」ことに気付けない。
 * 実際、飛び越えが一度も描かれない不具合をこの盲点で見落とした:
 *   y は必ず 世代 × ROW から決まるため、縦線は横棒の端点で終わるだけで、
 *   またぐことが構造的にありえなかった。
 * 同じ見落としを繰り返さないよう、ここでは computeLayout を通して検証する。
 */

const person = (id: string, birth: string | null): Person => ({
  ...EMPTY_PERSON,
  id,
  givenName: id,
  birthDate: birth,
});

const link = (parentId: string, childId: string): ParentChild => ({
  id: `${parentId}->${childId}`,
  parentId,
  childId,
  kind: 'biological',
  deletedAt: null,
});

const union = (a: string, b: string): Union => ({
  id: `${a}+${b}`,
  partner1Id: a,
  partner2Id: b,
  status: 'married',
  startDate: null,
  endDate: null,
  deletedAt: null,
});

/** 報告のあった実例。寺原家と後藤家が順子でつながっている。 */
const sample: TreeGraph = {
  persons: [
    ['リカ', '1905'],
    ['榮', '1928'],
    ['サツエ', '1931'],
    ['佐々巳', '1925'],
    ['ユリ子', '1928'],
    ['善博', '1949'],
    ['順子', '1956'],
    ['映子', '1962'],
    ['後藤夫', '1955'],
    ['理奈', '1978'],
    ['健一', '1980'],
    ['理香', '1982'],
    ['奈保', '1981'],
    ['純也', null],
    ['和明', '1983'],
    ['駿佑', '2016'],
  ].map(([id, birth]) => person(id as string, birth as string | null)),
  parentChild: [
    link('リカ', 'サツエ'),
    ...['善博', '順子', '映子'].flatMap((child) => [link('榮', child), link('サツエ', child)]),
    link('佐々巳', '後藤夫'),
    link('ユリ子', '後藤夫'),
    ...['理奈', '健一', '理香'].flatMap((child) => [link('後藤夫', child), link('順子', child)]),
    link('健一', '駿佑'),
    link('奈保', '駿佑'),
  ],
  unions: [
    union('榮', 'サツエ'),
    union('佐々巳', 'ユリ子'),
    union('後藤夫', '順子'),
    union('純也', '理奈'),
    union('健一', '奈保'),
    union('和明', '理香'),
  ],
};

interface Horizontal {
  y: number;
  x1: number;
  x2: number;
  owner: string;
}

/** TreeCanvas と同じやり方で、描かれる横線をすべて出す。 */
function horizontals(
  layout: TreeLayout,
  metrics: LayoutMetrics,
  lanes: ReadonlyMap<string, number>,
): { buses: Horizontal[]; couples: Horizontal[] } {
  const positionById = new Map(layout.nodes.map((node) => [node.person.id, node]));
  const buses: Horizontal[] = [];

  for (const family of layout.families) {
    const parents = family.parentIds.map((id) => positionById.get(id)).filter(Boolean);
    const children = family.childIds.map((id) => positionById.get(id)).filter(Boolean);
    if (parents.length === 0 || children.length === 0) continue;

    const parentX = parents.reduce((sum, p) => sum + (p?.x ?? 0), 0) / parents.length;
    const xs = [...children.map((c) => c?.x ?? 0), parentX];
    const y =
      lanes.get(family.key) ?? Math.min(...children.map((c) => c?.y ?? 0)) - metrics.vGap / 2;

    buses.push({ y, x1: Math.min(...xs), x2: Math.max(...xs), owner: family.key });
  }

  const couples: Horizontal[] = [];
  for (const couple of layout.couples) {
    const a = positionById.get(couple.partner1Id);
    const b = positionById.get(couple.partner2Id);
    if (!a || !b) continue;

    const [left, right] = a.x <= b.x ? [a, b] : [b, a];
    couples.push({
      y: left.y + metrics.nodeHeight / 2,
      x1: left.x + metrics.nodeWidth / 2,
      x2: right.x - metrics.nodeWidth / 2,
      owner: couple.id,
    });
  }

  return { buses, couples };
}

const overlappingBuses = (buses: Horizontal[]) => {
  const pairs: string[] = [];
  for (let i = 0; i < buses.length; i++) {
    for (let j = i + 1; j < buses.length; j++) {
      const [a, b] = [buses[i], buses[j]];
      if (a.y === b.y && Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > 0) {
        pairs.push(`${a.owner} × ${b.owner} (y=${a.y})`);
      }
    }
  }
  return pairs;
};

function scene(settings: ViewSettings = DEFAULT_VIEW_SETTINGS) {
  const metrics = cardMetrics(settings);
  const layout = computeLayout(sample, metrics);
  const positionById = new Map(layout.nodes.map((node) => [node.person.id, node]));
  const lanes = busLanes(layout.families, positionById, metrics);
  const verticals = verticalSegments(layout.families, positionById, metrics, lanes);

  return { metrics, layout, positionById, lanes, verticals };
}

describe('実レイアウトでの線の交わり', () => {
  it('段をずらす前は、きょうだいの横棒どうしが重なっていた', () => {
    const { layout, metrics } = scene();
    const flat = horizontals(layout, metrics, new Map());

    expect(overlappingBuses(flat.buses).length).toBeGreaterThan(0);
  });

  it('段をずらすと、同じ高さで重なる横棒が無くなる', () => {
    const { layout, metrics, lanes } = scene();
    const { buses } = horizontals(layout, metrics, lanes);

    expect(overlappingBuses(buses)).toEqual([]);
  });

  it('飛び越えの弧が実際に描かれる', () => {
    const { layout, metrics, lanes, verticals } = scene();
    const { buses, couples } = horizontals(layout, metrics, lanes);

    const total = [...buses, ...couples].reduce(
      (sum, line) =>
        sum +
        crossingsOn(
          { x1: line.x1, y1: line.y, x2: line.x2, y2: line.y, owner: line.owner },
          verticals,
        ).length,
      0,
    );

    expect(total).toBeGreaterThan(0);
  });

  it('段を上げても、幹は親の下から横棒まで届いている', () => {
    const { verticals, positionById, metrics } = scene();

    for (const segment of verticals) {
      // 上下が逆転していない＝線が消えたり突き抜けたりしていない
      expect(segment.y2).toBeGreaterThan(segment.y1);
    }

    // どの縦線もカードの帯を突き抜けていない
    for (const segment of verticals) {
      for (const node of positionById.values()) {
        const insideX = Math.abs(segment.x1 - node.x) < metrics.nodeWidth / 2;
        const insideY = segment.y1 < node.y + metrics.nodeHeight && segment.y2 > node.y;
        expect(insideX && insideY).toBe(false);
      }
    }
  });

  it('カードの大きさを変えても、重なりは残らない', () => {
    for (const uiSize of ['small', 'medium', 'large'] as const) {
      const { layout, metrics, lanes } = scene({ ...DEFAULT_VIEW_SETTINGS, uiSize });
      const { buses } = horizontals(layout, metrics, lanes);

      expect(overlappingBuses(buses)).toEqual([]);
    }
  });
});
