import { describe, expect, it } from 'vitest';
import { computeLayout, NODE_HEIGHT, NODE_WIDTH, V_GAP } from '@/features/tree-view/layout';
import {
  EMPTY_PERSON,
  type ParentChild,
  type Person,
  type TreeGraph,
  type Union,
} from '@/types/models';

// 乱数は固定の種から作る（落ちたケースを再現できるように）
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function randomGraph(seed: number): TreeGraph {
  const r = rng(seed);
  const persons: Person[] = [];
  const parentChild: ParentChild[] = [];
  const unions: Union[] = [];
  const couples: [string, string][] = [];

  const add = (id: string, year: number) =>
    persons.push({ ...EMPTY_PERSON, id, givenName: id, birthDate: `${year}-01-01` });

  // 3世代ぶん、夫婦と子をランダムに作る
  let n = 0;
  let previous: string[] = [];
  for (let gen = 0; gen < 3; gen++) {
    const born = 1900 + gen * 30;
    const roots = gen === 0 ? 1 + Math.floor(r() * 2) : 0;
    for (let i = 0; i < roots; i++) {
      const a = `p${n++}`;
      const b = `p${n++}`;
      add(a, born);
      add(b, born + 2);
      unions.push({
        id: `${a}+${b}`,
        partner1Id: a,
        partner2Id: b,
        status: 'married',
        startDate: null,
        endDate: null,
        deletedAt: null,
      });
      couples.push([a, b]);
    }

    const current: string[] = [];
    for (const [a, b] of couples.filter(([x]) => previous.includes(x) || gen === 0)) {
      const children = 1 + Math.floor(r() * 3);
      for (let c = 0; c < children; c++) {
        const child = `p${n++}`;
        add(child, born + 25 + c);
        parentChild.push({
          id: `${a}>${child}`,
          parentId: a,
          childId: child,
          kind: 'biological',
          deletedAt: null,
        });
        parentChild.push({
          id: `${b}>${child}`,
          parentId: b,
          childId: child,
          kind: 'biological',
          deletedAt: null,
        });
        current.push(child);

        // 半分くらいの子には配偶者を付ける
        if (r() < 0.6) {
          const spouse = `p${n++}`;
          add(spouse, born + 26 + c);
          unions.push({
            id: `${child}+${spouse}`,
            partner1Id: child,
            partner2Id: spouse,
            status: 'married',
            startDate: null,
            endDate: null,
            deletedAt: null,
          });
          couples.push([child, spouse]);
        }
      }
    }
    previous = current;
  }

  return { persons, parentChild, unions };
}

function overlapsOf(layout: ReturnType<typeof computeLayout>) {
  const rows = new Map<number, { id: string; x: number }[]>();
  for (const node of layout.nodes) {
    rows.set(node.generation, [
      ...(rows.get(node.generation) ?? []),
      { id: node.person.id, x: node.x },
    ]);
  }
  const bad: string[] = [];
  for (const [gen, list] of rows) {
    const sorted = [...list].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x - sorted[i - 1].x < NODE_WIDTH) {
        bad.push(
          `世代${gen}: ${sorted[i - 1].id}(${sorted[i - 1].x}) × ${sorted[i].id}(${sorted[i].x})`,
        );
      }
    }
  }
  return bad;
}

/**
 * ランダムな家系図を大量に描かせて、崩れないことを見張る。
 *
 * 重なりや世代のずれは、特定の形でしか出ないことが多い。
 * 手で書くテストだけでは拾いきれないので、種を固定した乱数で形を作って総当たりする。
 * 落ちたときは seed を控えれば、その形をそのまま再現できる。
 */
describe('ランダムな家系図', () => {
  const seeds = Array.from({ length: 300 }, (_, i) => i + 1);

  it('同じ世代のカードが重ならない', () => {
    const failures = seeds
      .map((seed) => ({ seed, bad: overlapsOf(computeLayout(randomGraph(seed))) }))
      .filter(({ bad }) => bad.length > 0)
      .map(({ seed, bad }) => `seed=${seed}: ${bad.join(' / ')}`);

    expect(failures).toEqual([]);
  });

  it('縦の位置は必ず世代の行に乗る', () => {
    const row = NODE_HEIGHT + V_GAP;
    const failures: string[] = [];

    for (const seed of seeds) {
      for (const node of computeLayout(randomGraph(seed)).nodes) {
        if (node.y !== node.generation * row) {
          failures.push(`seed=${seed}: ${node.person.id} y=${node.y} 世代=${node.generation}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('手で置いたカードが混ざっても、世代の行はそろう', () => {
    const row = NODE_HEIGHT + V_GAP;
    const failures: string[] = [];

    for (const seed of seeds.slice(0, 50)) {
      const graph = randomGraph(seed);
      // 3人にひとり、でたらめな位置に置かれている状態にする
      const withPositions = {
        ...graph,
        persons: graph.persons.map((person, index) =>
          index % 3 === 0 ? { ...person, position: { x: index * 37, y: index * 53 } } : person,
        ),
      };

      for (const node of computeLayout(withPositions).nodes) {
        if (node.y !== node.generation * row) {
          failures.push(`seed=${seed}: ${node.person.id} y=${node.y} 世代=${node.generation}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
