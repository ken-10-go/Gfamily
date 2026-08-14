import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  computeLayout,
  NODE_HEIGHT,
  NODE_WIDTH,
  V_GAP,
  type LayoutNode,
} from '@/features/tree-view/layout';
import { usePanZoom } from '@/features/tree-view/usePanZoom';
import { birthOrderLabel } from '@/lib/relations';
import {
  displayName,
  displayNameKana,
  hasSurnameChange,
  lifespanLabel,
  originalFamilyName,
  type TreeGraph,
} from '@/types/models';

/** ドラッグ中のカード。閾値を超えるまでは選択操作と区別がつかないので moved で判定する。 */
interface CardDrag {
  personId: string;
  pointerId: number;
  startClientX: number;
  /** 画面上の移動量（ピクセル）。レイアウト座標に直すときは倍率で割る。 */
  dx: number;
  moved: boolean;
}

/** これ以上動いたらドラッグとみなす。指やマウスの微妙な揺れで並びが変わらないようにする。 */
const DRAG_THRESHOLD = 6;

interface TreeCanvasProps {
  graph: TreeGraph;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
  /** きょうだいの並べ替えを許すか。閲覧のみの権限では false。 */
  canReorder?: boolean;
  /** 並べ替えの確定。きょうだいグループ全員を表示順に並べて渡す。 */
  onReorderSiblings?: (orderedIds: string[]) => void;
}

export function TreeCanvas({
  graph,
  selectedPersonId,
  onSelectPerson,
  canReorder = false,
  onReorderSiblings,
}: TreeCanvasProps) {
  const layout = useMemo(() => computeLayout(graph), [graph]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<CardDrag | null>(null);
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

  /** 並べ替えできるのは、きょうだいが2人以上いる人物だけ。 */
  const groupOf = (personId: string) =>
    layout.siblingGroups.find(
      (group) => group.childIds.length > 1 && group.childIds.includes(personId),
    );

  function startDrag(personId: string, event: React.PointerEvent<SVGGElement>) {
    if (!canReorder || !groupOf(personId)) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      personId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      dx: 0,
      moved: false,
    });
  }

  function moveDrag(event: React.PointerEvent<SVGGElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startClientX;
    setDrag({ ...drag, dx, moved: drag.moved || Math.abs(dx) > DRAG_THRESHOLD });
  }

  function endDrag(personId: string, event: React.PointerEvent<SVGGElement>) {
    // ドラッグ対象でないカード（並べ替え不可・閲覧のみ）はここを通る。選択だけ行う。
    if (!drag || drag.pointerId !== event.pointerId) {
      onSelectPerson(personId);
      return;
    }

    // つまんだだけで動かしていなければ、クリックとして選択する
    if (!drag.moved) {
      setDrag(null);
      onSelectPerson(personId);
      return;
    }

    const group = groupOf(personId);
    const node = positionById.get(personId);

    if (group && node && onReorderSiblings) {
      // 落とした位置を X 座標に直し、その位置で並べ替えた結果を確定する
      const droppedX = node.x + drag.dx / viewport.scale;
      const ordered = [...group.childIds].sort((a, b) => {
        const xa = a === personId ? droppedX : (positionById.get(a)?.x ?? 0);
        const xb = b === personId ? droppedX : (positionById.get(b)?.x ?? 0);
        return xa - xb;
      });

      const unchanged = ordered.every((id, index) => id === group.childIds[index]);
      if (!unchanged) onReorderSiblings(ordered);
    }

    setDrag(null);
  }

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
              birthOrder={birthOrderLabel(graph, node.person)}
              draggable={canReorder && Boolean(groupOf(node.person.id))}
              dragOffset={drag?.moved && drag.personId === node.person.id ? drag.dx / viewport.scale : 0}
              onSelect={onSelectPerson}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
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
  birthOrder,
  draggable,
  dragOffset,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  node: LayoutNode;
  selected: boolean;
  birthOrder: string | null;
  draggable: boolean;
  /** ドラッグ中の見た目の追従量（レイアウト座標）。 */
  dragOffset: number;
  onSelect: (id: string) => void;
  onPointerDown: (personId: string, event: React.PointerEvent<SVGGElement>) => void;
  onPointerMove: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerUp: (personId: string, event: React.PointerEvent<SVGGElement>) => void;
}) {
  const { person } = node;
  const left = node.x - NODE_WIDTH / 2 + dragOffset;
  const lifespan = lifespanLabel(person);
  const kana = displayNameKana(person);
  const original = originalFamilyName(person);
  const changedSurname = hasSurnameChange(person) && original !== person.familyName ? original : null;

  return (
    <g
      data-person-card
      className={[
        'person-card',
        `person-card--${person.gender}`,
        selected ? 'person-card--selected' : '',
        draggable ? 'person-card--draggable' : '',
        dragOffset !== 0 ? 'person-card--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      transform={`translate(${left} ${node.y})`}
      // 選択は pointerup 側で判定する。ドラッグと区別するため onClick は使わない。
      onPointerDown={(event) => onPointerDown(person.id, event)}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => onPointerUp(person.id, event)}
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

      {kana && (
        <text x={NODE_WIDTH / 2} y={15} textAnchor="middle" className="person-card__kana">
          {kana}
        </text>
      )}
      <text x={NODE_WIDTH / 2} y={kana ? 34 : 26} textAnchor="middle" className="person-card__name">
        {displayName(person)}
      </text>
      <text x={NODE_WIDTH / 2} y={kana ? 50 : 44} textAnchor="middle" className="person-card__meta">
        {[birthOrder, lifespan].filter(Boolean).join('　')}
      </text>

      {/* 改姓している人には印を付け、どの姓から変わったかを示す */}
      {changedSurname && (
        <>
          <circle cx={NODE_WIDTH - 14} cy={14} r={8} className="person-card__mark" />
          <text x={NODE_WIDTH - 14} y={18} textAnchor="middle" className="person-card__mark-text">
            改
          </text>
          <title>
            旧姓 {changedSurname}
          </title>
        </>
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
