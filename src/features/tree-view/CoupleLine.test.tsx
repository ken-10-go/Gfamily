import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { computeLayout, DEFAULT_METRICS, type LayoutNode } from '@/features/tree-view/layout';
import { CoupleLine, FamilyLines } from '@/features/tree-view/TreeCanvas';
import {
  EMPTY_PERSON,
  type ParentChild,
  type Person,
  type TreeGraph,
  type Union,
} from '@/types/models';

const person = (id: string, overrides: Partial<Person> = {}): Person => ({
  ...EMPTY_PERSON,
  id,
  givenName: id,
  ...overrides,
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

const generationOf = (layout: ReturnType<typeof computeLayout>, id: string) =>
  layout.nodes.find((node) => node.person.id === id)?.generation;

describe('夫婦は同じ段に並ぶ', () => {
  it('婚姻で引き下げられた側と、その配偶者はそろう', () => {
    // 婿は誰の子でもないので自動では最上段。子と結婚して下へ引かれる
    const layout = computeLayout({
      persons: ['祖', '親', '子', '婿'].map((id) => person(id)),
      parentChild: [link('祖', '親'), link('親', '子')],
      unions: [union('婿', '子')],
    });

    expect(generationOf(layout, '婿')).toBe(generationOf(layout, '子'));
  });

  it('段を手で動かすと、配偶者も連れて動く', () => {
    /*
     * 片方だけが動いて夫婦が離れると、線が斜めに走って図が読めなくなる。
     * 指示するのは本人だけでよく、相手はついて来る。
     */
    const layout = computeLayout({
      persons: [person('夫', { generationShift: 1 }), person('妻'), person('子'), person('孫')],
      parentChild: [link('夫', '子'), link('妻', '子'), link('子', '孫')],
      unions: [union('夫', '妻')],
    });

    expect(generationOf(layout, '妻')).toBe(generationOf(layout, '夫'));
  });

  it('夫婦を引き離す指定でも、親子の上下は壊れない', () => {
    const layout = computeLayout({
      persons: [person('夫', { generationShift: 5 }), person('妻'), person('子')],
      parentChild: [link('夫', '子'), link('妻', '子')],
      unions: [union('夫', '妻')],
    });

    const parent = generationOf(layout, '夫') ?? 0;
    const child = generationOf(layout, '子') ?? 0;
    expect(parent).toBeLessThan(child);
  });

  it('どの家系図でも、夫婦が別の段に分かれることはない', () => {
    const layout = computeLayout({
      persons: [
        person('祖父'),
        person('祖母'),
        person('父'),
        person('母'),
        person('本人'),
        person('配偶者'),
        person('子'),
      ],
      parentChild: [
        link('祖父', '父'),
        link('祖母', '父'),
        link('父', '本人'),
        link('母', '本人'),
        link('本人', '子'),
        link('配偶者', '子'),
      ],
      unions: [union('祖父', '祖母'), union('父', '母'), union('本人', '配偶者')],
    } as TreeGraph);

    for (const couple of layout.couples) {
      expect(generationOf(layout, couple.partner1Id)).toBe(generationOf(layout, couple.partner2Id));
    }
  });
});

describe('血のつながりの色分け', () => {
  const metrics = DEFAULT_METRICS;
  const node = (id: string, x: number, y: number): LayoutNode => ({
    person: person(id),
    x,
    y,
    generation: 0,
    placedByHand: false,
  });

  it('夫婦線は、二人とも筋に入っているときだけ色を付ける', () => {
    const draw = (inLineage: boolean) =>
      render(
        <svg>
          <CoupleLine
            id="u1"
            a={node('夫', 0, 0)}
            b={node('妻', 200, 0)}
            metrics={metrics}
            status="married"
            dimmed={false}
            verticals={[]}
            inLineage={inLineage}
          />
        </svg>,
      ).container;

    expect(draw(true).querySelector('.link--lineage')).not.toBeNull();
    expect(draw(false).querySelector('.link--lineage')).toBeNull();
  });

  it('きょうだいの横棒も、親子と同じ色でつながる', () => {
    // 縦線だけ色が付いていると、きょうだいの間で筋が途切れて見える
    const { container } = render(
      <svg>
        <FamilyLines
          owner="f1"
          parents={[node('親', 100, 0)]}
          children={[node('兄', 0, 200), node('弟', 200, 200)]}
          childKinds={{}}
          metrics={metrics}
          lineage={new Set(['親', '兄', '弟'])}
          dimmed={new Set()}
          verticals={[]}
        />
      </svg>,
    );

    // 幹・横棒・枝のすべてに色が乗る
    expect(container.querySelectorAll('.link--lineage').length).toBe(4);
  });
});
