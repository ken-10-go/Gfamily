import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  computeLayout,
  NODE_HEIGHT,
  NODE_WIDTH,
  V_GAP,
  type LayoutNode,
} from '@/features/tree-view/layout';
import { usePanZoom } from '@/features/tree-view/usePanZoom';
import { displayName, lifespanLabel, type TreeGraph } from '@/types/models';

interface TreeCanvasProps {
  graph: TreeGraph;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
}

export function TreeCanvas({ graph, selectedPersonId, onSelectPerson }: TreeCanvasProps) {
  const layout = useMemo(() => computeLayout(graph), [graph]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { viewport, isPanning, zoomBy, fitTo, handlers } = usePanZoom();

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 人数が変わったときだけ全体表示に合わせ直す（編集のたびに動かない）
  const personCount = layout.nodes.length;
  useEffect(() => {
    if (size.width > 0 && personCount > 0) {
      fitTo(layout.width, layout.height, size.width, size.height);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personCount, size.width, size.height]);

  const positionById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.person.id, node])),
    [layout.nodes],
  );

  if (personCount === 0) {
    return (
      <div className="tree-canvas tree-canvas--empty" ref={containerRef}>
        <p>まだ人物が登録されていません。「人物を追加」から始めてください。</p>
      </div>
    );
  }

  return (
    <div className="tree-canvas" ref={containerRef}>
      <svg
        className={isPanning ? 'tree-canvas__svg tree-canvas__svg--panning' : 'tree-canvas__svg'}
        role="img"
        aria-label="家系図"
        {...handlers}
      >
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
          <g className="tree-canvas__links">
            {layout.couples.map((couple) => (
              <CoupleLine
                key={couple.id}
                a={positionById.get(couple.partner1Id)}
                b={positionById.get(couple.partner2Id)}
                divorced={couple.status === 'divorced'}
              />
            ))}
            {layout.families.map((family) => (
              <FamilyLines
                key={family.key}
                parents={family.parentIds.map((id) => positionById.get(id))}
                children={family.childIds.map((id) => positionById.get(id))}
              />
            ))}
          </g>

          {layout.nodes.map((node) => (
            <PersonCard
              key={node.person.id}
              node={node}
              selected={node.person.id === selectedPersonId}
              onSelect={onSelectPerson}
            />
          ))}
        </g>
      </svg>

      <div className="tree-canvas__controls">
        <button type="button" onClick={() => zoomBy(1.2)} aria-label="拡大">
          ＋
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="縮小">
          −
        </button>
        <button
          type="button"
          onClick={() => fitTo(layout.width, layout.height, size.width, size.height)}
        >
          全体
        </button>
      </div>
    </div>
  );
}

function PersonCard({
  node,
  selected,
  onSelect,
}: {
  node: LayoutNode;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { person } = node;
  const left = node.x - NODE_WIDTH / 2;
  const lifespan = lifespanLabel(person);

  return (
    <g
      data-person-card
      className={`person-card person-card--${person.gender}${selected ? ' person-card--selected' : ''}`}
      transform={`translate(${left} ${node.y})`}
      onClick={() => onSelect(person.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(person.id);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${displayName(person)}${lifespan ? ` ${lifespan}` : ''}`}
    >
      <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} className="person-card__box" />
      <text x={NODE_WIDTH / 2} y={26} textAnchor="middle" className="person-card__name">
        {displayName(person)}
      </text>
      {person.maiden_name ? (
        <text x={NODE_WIDTH / 2} y={44} textAnchor="middle" className="person-card__meta">
          （旧姓 {person.maiden_name}）
        </text>
      ) : (
        lifespan && (
          <text x={NODE_WIDTH / 2} y={44} textAnchor="middle" className="person-card__meta">
            {lifespan}
          </text>
        )
      )}
    </g>
  );
}

/** 夫婦をつなぐ横線。離婚は破線で表す。 */
function CoupleLine({
  a,
  b,
  divorced,
}: {
  a?: LayoutNode;
  b?: LayoutNode;
  divorced: boolean;
}) {
  if (!a || !b) return null;

  const y = a.y + NODE_HEIGHT / 2;
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];

  return (
    <line
      x1={left.x + NODE_WIDTH / 2}
      y1={y}
      x2={right.x - NODE_WIDTH / 2}
      y2={b.y + NODE_HEIGHT / 2}
      className={divorced ? 'link link--divorced' : 'link link--couple'}
    />
  );
}

/**
 * 親から子へ引く線。
 * 親の下端 → 世代間の中間にある横棒（きょうだいバス） → 各子の上端、の3段で描く。
 */
function FamilyLines({
  parents,
  children,
}: {
  parents: (LayoutNode | undefined)[];
  children: (LayoutNode | undefined)[];
}) {
  const presentParents = parents.filter((p): p is LayoutNode => Boolean(p));
  const presentChildren = children.filter((c): c is LayoutNode => Boolean(c));

  if (presentParents.length === 0 || presentChildren.length === 0) return null;

  const parentX =
    presentParents.reduce((sum, parent) => sum + parent.x, 0) / presentParents.length;
  const parentBottom = Math.max(...presentParents.map((p) => p.y)) + NODE_HEIGHT;
  const childTop = Math.min(...presentChildren.map((c) => c.y));
  const busY = childTop - V_GAP / 2;

  const childXs = presentChildren.map((c) => c.x);
  const busLeft = Math.min(...childXs, parentX);
  const busRight = Math.max(...childXs, parentX);

  return (
    <g className="link-group">
      <line x1={parentX} y1={parentBottom} x2={parentX} y2={busY} className="link" />
      {busRight - busLeft > 1 && (
        <line x1={busLeft} y1={busY} x2={busRight} y2={busY} className="link" />
      )}
      {presentChildren.map((child) => (
        <line
          key={child.person.id}
          x1={child.x}
          y1={busY}
          x2={child.x}
          y2={child.y}
          className="link"
        />
      ))}
    </g>
  );
}
