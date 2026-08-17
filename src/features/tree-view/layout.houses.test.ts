import { describe, expect, it } from 'vitest';

import { resolveHouses } from '@/features/tree-view/houses';
import { computeLayout } from '@/features/tree-view/layout';
import { cardMetrics, DEFAULT_VIEW_SETTINGS } from '@/features/tree-view/useViewSettings';
import {
  EMPTY_PERSON,
  type ParentChild,
  type Person,
  type TreeGraph,
  type Union,
} from '@/types/models';

/*
 * 家が増えたときの配置。
 *
 * 世代ごとに左から詰めるだけだと、あとから足した姻族がその世代の空いている
 * 右端へ押し出され、親が子の真上から大きく外れてしまう。
 * ここでは「親と子がどれだけ離れているか」を実座標で測って歯止めにする。
 */

const person = (id: string, familyName: string, birthDate: string | null): Person => ({
  ...EMPTY_PERSON,
  id,
  familyName,
  givenName: id,
  birthDate,
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

/**
 * 5つの家が婚姻でつながった家系図。
 * 寺原家・後藤家・佐々木家に加えて、姻族として松本家・井川家が入る。
 */
const sample: TreeGraph = {
  persons: [
    person('リカ', '寺原', '1905'),
    person('榮', '寺原', '1928'),
    person('サツエ', '寺原', '1931'),
    person('佐々巳', '後藤', '1925'),
    person('ユリ子', '後藤', '1928'),
    person('敏行', '後藤', '1949'),
    person('順子', '寺原', '1956'),
    person('映子', '寺原', '1962'),
    person('理奈', '後藤', '1978'),
    person('健一', '後藤', '1980'),
    person('奈保', '後藤', '1981'),
    person('理香', '後藤', '1982'),
    person('和明', '松本', '1982'),
    person('駿佑', '後藤', '2016'),
    person('和博', '佐々木', '1950'),
    person('しのぶ', '佐々木', '1953'),
    person('美帆', '佐々木', '1980'),
    person('達郎', '井川', '1978'),
  ],
  parentChild: [
    link('リカ', 'サツエ'),
    ...['順子', '映子'].flatMap((child) => [link('榮', child), link('サツエ', child)]),
    link('佐々巳', '敏行'),
    link('ユリ子', '敏行'),
    ...['理奈', '健一', '理香'].flatMap((child) => [link('敏行', child), link('順子', child)]),
    link('健一', '駿佑'),
    link('奈保', '駿佑'),
    link('和博', '美帆'),
    link('しのぶ', '美帆'),
  ],
  unions: [
    union('榮', 'サツエ'),
    union('佐々巳', 'ユリ子'),
    union('敏行', '順子'),
    union('健一', '奈保'),
    union('和明', '理香'),
    union('和博', 'しのぶ'),
    union('達郎', '美帆'),
  ],
};

const metrics = cardMetrics(DEFAULT_VIEW_SETTINGS);
const SLOT = metrics.nodeWidth + metrics.hGap;
const layout = computeLayout(sample, metrics);
const positionById = new Map(layout.nodes.map((node) => [node.person.id, node]));
const assignment = resolveHouses(sample, []);

describe('家が増えたときの配置', () => {
  it('嫁いだ側の生家をひとつながりにしない（寺原家と後藤家は別）', () => {
    /*
     * 子は父と母の両方につながっているので、両方をたどると
     * 夫婦の生家どうしが子を介して1つの家になってしまう。
     */
    expect(assignment.get('順子')?.name).toBe('寺原家');
    expect(assignment.get('敏行')?.name).toBe('後藤家');
    expect(assignment.get('美帆')?.name).toBe('佐々木家');
  });

  it('親は子のほぼ真上に来る', () => {
    for (const family of layout.families) {
      const parents = family.parentIds
        .map((id) => positionById.get(id))
        .filter((node) => node !== undefined);
      const children = family.childIds
        .map((id) => positionById.get(id))
        .filter((node) => node !== undefined);
      if (parents.length === 0 || children.length === 0) continue;

      const centre = (nodes: typeof parents) =>
        (Math.min(...nodes.map((n) => n.x)) + Math.max(...nodes.map((n) => n.x))) / 2;

      const offset = Math.abs(centre(parents) - centre(children)) / SLOT;
      expect(
        offset,
        `${family.key} の親子が ${offset.toFixed(1)} スロット離れている`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('夫婦は必ず隣り合う', () => {
    for (const couple of layout.couples) {
      const a = positionById.get(couple.partner1Id);
      const b = positionById.get(couple.partner2Id);
      if (!a || !b) continue;

      expect(Math.abs(a.x - b.x), `${couple.id} が離れている`).toBeLessThanOrEqual(SLOT + 1);
    }
  });

  it('同じ世代の中で、家どうしが入り混じらない', () => {
    // ひとりだけの家（生家を登録していない姻族）は配偶者の隣にいるので数えない
    const size = new Map<string, number>();
    for (const house of assignment.values()) size.set(house.id, (size.get(house.id) ?? 0) + 1);

    const byGeneration = new Map<number, { id: string; x: number; house: string }[]>();
    for (const node of layout.nodes) {
      const house = assignment.get(node.person.id)?.id ?? '';
      if ((size.get(house) ?? 0) < 2) continue;

      const list = byGeneration.get(node.generation) ?? [];
      list.push({ id: node.person.id, x: node.x, house });
      byGeneration.set(node.generation, list);
    }

    for (const [generation, list] of byGeneration) {
      const sorted = [...list].sort((a, b) => a.x - b.x);
      const lastSeen = new Map<string, number>();

      sorted.forEach((node, index) => {
        const previous = lastSeen.get(node.house);
        expect(
          previous === undefined || index - previous === 1,
          `世代 ${generation} で ${node.house} が分断されている`,
        ).toBe(true);
        lastSeen.set(node.house, index);
      });
    }
  });
});
