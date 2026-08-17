import { describe, expect, it } from 'vitest';

import {
  busLanes,
  crossingsOn,
  hopPath,
  verticalSegments,
  type Segment,
} from '@/features/tree-view/hops';
import { DEFAULT_METRICS, type FamilyUnit, type LayoutNode } from '@/features/tree-view/layout';
import { EMPTY_PERSON } from '@/types/models';

/** 横棒。y=100 を x=0 から x=200 まで。 */
const bus: Segment = { x1: 0, y1: 100, x2: 200, y2: 100, owner: '寺原家' };

const vertical = (x: number, y1: number, y2: number, owner: string): Segment => ({
  x1: x,
  y1,
  x2: x,
  y2,
  owner,
});

describe('crossingsOn', () => {
  it('またいでいる縦線を拾う', () => {
    expect(crossingsOn(bus, [vertical(80, 50, 150, '後藤家')])).toEqual([80]);
  });

  it('横線の外にある縦線は拾わない', () => {
    const outside = [vertical(-20, 50, 150, '後藤家'), vertical(260, 50, 150, '後藤家')];
    expect(crossingsOn(bus, outside)).toEqual([]);
  });

  it('高さが届いていない縦線は拾わない', () => {
    const short = [vertical(80, 10, 40, '後藤家'), vertical(120, 160, 220, '後藤家')];
    expect(crossingsOn(bus, short)).toEqual([]);
  });

  it('横棒の高さで終わる縦線は、接続なので拾わない', () => {
    // 別の家族の幹が、たまたま同じ高さで終わっている場合
    expect(crossingsOn(bus, [vertical(80, 50, 100, '後藤家')])).toEqual([]);
  });

  it('同じ家族の縦線は、つながっている線なので拾わない', () => {
    expect(crossingsOn(bus, [vertical(80, 50, 150, '寺原家')])).toEqual([]);
  });

  it('複数の交差を左から順に返し、重なりは1つにまとめる', () => {
    const verticals = [
      vertical(150, 50, 150, '後藤家'),
      vertical(60, 50, 150, '田中家'),
      vertical(60, 50, 150, '鈴木家'),
    ];
    expect(crossingsOn(bus, verticals)).toEqual([60, 150]);
  });
});

describe('hopPath', () => {
  it('交差が無ければまっすぐ引く', () => {
    expect(hopPath(100, 0, 200, [])).toBe('M 0 100 H 200');
  });

  it('交差1つなら、その手前まで引いて弧をまたがせる', () => {
    expect(hopPath(100, 0, 200, [100], 5)).toBe('M 0 100 H 95 A 5 5 0 0 1 105 100 H 200');
  });

  it('右から左へ指定しても、左から右へ引き直す', () => {
    expect(hopPath(100, 200, 0, [])).toBe('M 0 100 H 200');
  });

  it('端に寄りすぎた交差は、弧を描く余地が無いので飛ばす', () => {
    expect(hopPath(100, 0, 200, [2, 198], 5)).toBe('M 0 100 H 200');
  });

  it('近すぎる弧どうしは、間を空けずにつなぐ', () => {
    const d = hopPath(100, 0, 200, [100, 106], 5);

    // 弧が2つとも出ていて、間にまっすぐな区間が挟まらない
    expect(d.match(/A /g)).toHaveLength(2);
    expect(d).toContain('M 0 100 H 95 A');
    expect(d.endsWith('H 200')).toBe(true);
  });

  it('交差がいくつあっても、始点と終点は変わらない', () => {
    const d = hopPath(100, 0, 200, [40, 100, 160], 5);

    expect(d.startsWith('M 0 100')).toBe(true);
    expect(d.endsWith('H 200')).toBe(true);
    expect(d.match(/A /g)).toHaveLength(3);
  });
});

describe('verticalSegments', () => {
  const node = (id: string, x: number, y: number): LayoutNode => ({
    person: { ...EMPTY_PERSON, id },
    x,
    y,
    generation: y / (DEFAULT_METRICS.nodeHeight + DEFAULT_METRICS.vGap),
    placedByHand: false,
  });

  const family: FamilyUnit = {
    key: '親',
    parentIds: ['父', '母'],
    childIds: ['子1', '子2'],
    childKinds: { 子1: 'biological', 子2: 'biological' },
  };

  const row = DEFAULT_METRICS.nodeHeight + DEFAULT_METRICS.vGap;
  const positions = new Map([
    ['父', node('父', 100, 0)],
    ['母', node('母', 300, 0)],
    ['子1', node('子1', 100, row)],
    ['子2', node('子2', 300, row)],
  ]);

  const lanesFor = (list: FamilyUnit[]) => busLanes(list, positions, DEFAULT_METRICS);

  it('親の幹と、子ごとの枝を返す', () => {
    const segments = verticalSegments([family], positions, DEFAULT_METRICS, lanesFor([family]));

    expect(segments).toHaveLength(3);
    // すべて縦。持ち主は家族の key
    for (const segment of segments) {
      expect(segment.x1).toBe(segment.x2);
      expect(segment.owner).toBe('親');
    }
    // 幹は両親の中央から、きょうだいの横棒まで
    expect(segments[0].x1).toBe(200);
    expect(segments[0].y1).toBe(DEFAULT_METRICS.nodeHeight);
    expect(segments[0].y2).toBe(row - DEFAULT_METRICS.vGap / 2);
    // 枝は横棒から子の上端まで
    expect(segments[1]).toMatchObject({ x1: 100, y1: row - DEFAULT_METRICS.vGap / 2, y2: row });
  });

  it('親か子が描かれていない家族は飛ばす', () => {
    const orphan: FamilyUnit = { key: '孤', parentIds: [], childIds: ['子1'], childKinds: {} };
    expect(verticalSegments([orphan], positions, DEFAULT_METRICS, lanesFor([orphan]))).toEqual([]);
  });

  it('段を上げた家族は、幹と枝もその高さに合わせて伸び縮みする', () => {
    const lifted = new Map([[family.key, 100]]);
    const segments = verticalSegments([family], positions, DEFAULT_METRICS, lifted);

    // 幹の下端と、枝の上端がそろっている
    expect(segments[0].y2).toBe(100);
    expect(segments[1].y1).toBe(100);
    expect(segments[2].y1).toBe(100);
  });
});

describe('busLanes', () => {
  const row = DEFAULT_METRICS.nodeHeight + DEFAULT_METRICS.vGap;
  const baseY = row - DEFAULT_METRICS.vGap / 2;

  const node = (id: string, x: number, y: number): LayoutNode => ({
    person: { ...EMPTY_PERSON, id },
    x,
    y,
    generation: y / row,
    placedByHand: false,
  });

  /** 親1人・子1人の家族。横棒は placedAt で与えた親と子のXに伸びる。 */
  const family = (key: string): FamilyUnit => ({
    key,
    parentIds: [`${key}親`],
    childIds: [`${key}子`],
    childKinds: { [`${key}子`]: 'biological' },
  });

  const placedAt = (specs: [string, number, number][]) =>
    new Map(
      specs.flatMap(([key, parentX, childX]) => [
        [`${key}親`, node(`${key}親`, parentX, 0)] as const,
        [`${key}子`, node(`${key}子`, childX, row)] as const,
      ]),
    );

  it('重ならない横棒は、どちらも一番下の段のまま', () => {
    const families = [family('A'), family('B')];
    const lanes = busLanes(
      families,
      placedAt([
        ['A', 0, 200],
        ['B', 800, 1000],
      ]),
      DEFAULT_METRICS,
    );

    expect(lanes.get('A')).toBe(baseY);
    expect(lanes.get('B')).toBe(baseY);
  });

  it('左右が重なる横棒は、片方を上の段へ逃がす', () => {
    const families = [family('A'), family('B')];
    const lanes = busLanes(
      families,
      placedAt([
        ['A', 0, 400],
        ['B', 200, 600],
      ]),
      DEFAULT_METRICS,
    );

    expect(lanes.get('A')).toBe(baseY);
    expect(lanes.get('B')).toBeLessThan(baseY);
  });

  it('3本重なれば3段に分かれる', () => {
    const specs: [string, number, number][] = [
      ['A', 0, 600],
      ['B', 100, 700],
      ['C', 200, 800],
    ];
    const lanes = busLanes(
      specs.map(([key]) => family(key)),
      placedAt(specs),
      DEFAULT_METRICS,
    );

    const heights = [lanes.get('A'), lanes.get('B'), lanes.get('C')];
    expect(new Set(heights).size).toBe(3);
  });

  it('世代が違えば、そもそも高さが違うので影響し合わない', () => {
    const positions = new Map([
      ['A親', node('A親', 0, 0)],
      ['A子', node('A子', 0, row)],
      ['B親', node('B親', 0, row)],
      ['B子', node('B子', 0, row * 2)],
    ]);
    const lanes = busLanes([family('A'), family('B')], positions, DEFAULT_METRICS);

    expect(lanes.get('A')).toBe(baseY);
    expect(lanes.get('B')).toBe(row * 2 - DEFAULT_METRICS.vGap / 2);
  });

  it('段を上げても、親の幹が潰れるところまでは上げない', () => {
    // 10本すべてが重なる。上げられる段数には限りがあるので、必ず親の下端より下に収まる
    const specs: [string, number, number][] = Array.from(
      { length: 10 },
      (_, i) => [`F${i}`, i * 10, i * 10 + 600] as [string, number, number],
    );
    const lanes = busLanes(
      specs.map(([key]) => family(key)),
      placedAt(specs),
      DEFAULT_METRICS,
    );

    const parentBottom = DEFAULT_METRICS.nodeHeight;
    for (const y of lanes.values()) {
      expect(y).toBeGreaterThan(parentBottom);
      expect(y).toBeLessThanOrEqual(baseY);
    }
  });
});
