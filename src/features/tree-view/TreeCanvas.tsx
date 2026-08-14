import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { computeLayout, type LayoutMetrics, type LayoutNode } from '@/features/tree-view/layout';
import { usePanZoom } from '@/features/tree-view/usePanZoom';
import { DEFAULT_VIEW_SETTINGS, type ViewSettings } from '@/features/tree-view/useViewSettings';
import { ageLabel } from '@/lib/japanese-date';
import { birthOrderLabel } from '@/lib/relations';
import {
  displayName,
  displayNameKana,
  hasSurnameChange,
  lifespanLabel,
  originalFamilyName,
  type Person,
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

export interface CardAnchor {
  x: number;
  y: number;
}

interface TreeCanvasProps {
  graph: TreeGraph;
  metrics: LayoutMetrics;
  settings?: ViewSettings;
  selectedPersonId: string | null;
  /** カードを選んだとき。anchor は画面上の位置で、メニューを寄せるのに使う。 */
  onSelectPerson: (personId: string, anchor: CardAnchor) => void;
  /** きょうだいの並べ替えを許すか。閲覧のみの権限やロック中は false。 */
  canReorder?: boolean;
  onReorderSiblings?: (orderedIds: string[]) => void;
}

export function TreeCanvas({
  graph,
  metrics,
  settings = DEFAULT_VIEW_SETTINGS,
  selectedPersonId,
  onSelectPerson,
  canReorder = false,
  onReorderSiblings,
}: TreeCanvasProps) {
  const layout = useMemo(() => computeLayout(graph, metrics), [graph, metrics]);
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

  // 人数やカードの大きさが変わったときだけ全体表示に合わせ直す（編集のたびに動かない）
  const personCount = layout.nodes.length;
  useEffect(() => {
    if (size.width > 0 && personCount > 0) {
      fitTo(layout.width, layout.height, size.width, size.height);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personCount, size.width, size.height, metrics.nodeWidth, metrics.nodeHeight]);

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
    const anchor = { x: event.clientX, y: event.clientY };

    // ドラッグ対象でないカード（並べ替え不可・閲覧のみ）はここを通る。選択だけ行う。
    if (!drag || drag.pointerId !== event.pointerId) {
      onSelectPerson(personId, anchor);
      return;
    }

    // つまんだだけで動かしていなければ、クリックとして選択する
    if (!drag.moved) {
      setDrag(null);
      onSelectPerson(personId, anchor);
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
                metrics={metrics}
                divorced={couple.status === 'divorced'}
              />
            ))}
            {layout.families.map((family) => (
              <FamilyLines
                key={family.key}
                parents={family.parentIds.map((id) => positionById.get(id))}
                children={family.childIds.map((id) => positionById.get(id))}
                metrics={metrics}
              />
            ))}
          </g>

          {layout.nodes.map((node) => (
            <PersonCard
              key={node.person.id}
              node={node}
              metrics={metrics}
              settings={settings}
              selected={node.person.id === selectedPersonId}
              birthOrder={birthOrderLabel(graph, node.person)}
              draggable={canReorder && Boolean(groupOf(node.person.id))}
              dragOffset={
                drag?.moved && drag.personId === node.person.id ? drag.dx / viewport.scale : 0
              }
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

/** 設定に合わせた氏名の行。姓名の順と、1行か2行かで変わる。 */
function nameLines(person: Person, settings: ViewSettings): string[] {
  const family = person.familyName ?? '';
  const given = person.givenName ?? '';
  const parts = (settings.nameOrder === 'family-first' ? [family, given] : [given, family]).filter(
    Boolean,
  );

  if (parts.length === 0) return [displayName(person)];
  return settings.nameLines === 2 ? parts : [parts.join(' ')];
}

/** カードに出す補足行（続柄・生没年・年齢）。 */
function metaLine(person: Person, birthOrder: string | null, settings: ViewSettings): string {
  return [birthOrder, lifespanLabel(person), settings.showAge ? ageLabel(person) : '']
    .filter(Boolean)
    .join('　');
}

function PersonCard({
  node,
  metrics,
  settings,
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
  metrics: LayoutMetrics;
  settings: ViewSettings;
  selected: boolean;
  birthOrder: string | null;
  draggable: boolean;
  /** ドラッグ中の見た目の追従量（レイアウト座標）。 */
  dragOffset: number;
  onSelect: (id: string, anchor: CardAnchor) => void;
  onPointerDown: (personId: string, event: React.PointerEvent<SVGGElement>) => void;
  onPointerMove: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerUp: (personId: string, event: React.PointerEvent<SVGGElement>) => void;
}) {
  const { person } = node;
  const left = node.x - metrics.nodeWidth / 2 + dragOffset;

  const names = nameLines(person, settings);
  const kana = settings.showKana ? displayNameKana(person) : '';
  const meta = metaLine(person, birthOrder, settings);
  const note = settings.showNote ? (person.note?.split('\n')[0] ?? '') : '';

  const original = originalFamilyName(person);
  const changedSurname =
    hasSurnameChange(person) && original !== person.familyName ? original : null;

  const rows = [
    ...(kana ? [{ text: kana, className: 'person-card__kana' }] : []),
    ...names.map((text) => ({ text, className: 'person-card__name' })),
    ...(meta ? [{ text: meta, className: 'person-card__meta' }] : []),
    ...(note ? [{ text: note, className: 'person-card__meta' }] : []),
  ];

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
          const box = (event.currentTarget as SVGGElement).getBoundingClientRect();
          onSelect(person.id, { x: box.left, y: box.bottom });
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${displayName(person)}${meta ? ` ${meta}` : ''}`}
    >
      <rect
        width={metrics.nodeWidth}
        height={metrics.nodeHeight}
        rx={8}
        className="person-card__box"
      />

      {settings.vertical
        ? rows.map((row, index) => (
            <text
              key={index}
              // 縦書きは右の列から始める
              x={metrics.nodeWidth - 16 - index * 15}
              y={12}
              className={`${row.className} person-card__text--vertical`}
            >
              {row.text}
            </text>
          ))
        : rows.map((row, index) => (
            <text
              key={index}
              x={metrics.nodeWidth / 2}
              y={20 + index * 16}
              textAnchor="middle"
              className={row.className}
            >
              {row.text}
            </text>
          ))}

      {/* 改姓している人には印を付け、どの姓から変わったかを示す */}
      {changedSurname && (
        <>
          <circle cx={metrics.nodeWidth - 14} cy={14} r={8} className="person-card__mark" />
          <text
            x={metrics.nodeWidth - 14}
            y={18}
            textAnchor="middle"
            className="person-card__mark-text"
          >
            改
          </text>
          <title>旧姓 {changedSurname}</title>
        </>
      )}
    </g>
  );
}

/** 夫婦をつなぐ横線。離婚は破線で表す。 */
function CoupleLine({
  a,
  b,
  metrics,
  divorced,
}: {
  a?: LayoutNode;
  b?: LayoutNode;
  metrics: LayoutMetrics;
  divorced: boolean;
}) {
  if (!a || !b) return null;

  const y = a.y + metrics.nodeHeight / 2;
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];

  return (
    <line
      x1={left.x + metrics.nodeWidth / 2}
      y1={y}
      x2={right.x - metrics.nodeWidth / 2}
      y2={b.y + metrics.nodeHeight / 2}
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
  metrics,
}: {
  parents: (LayoutNode | undefined)[];
  children: (LayoutNode | undefined)[];
  metrics: LayoutMetrics;
}) {
  const presentParents = parents.filter((p): p is LayoutNode => Boolean(p));
  const presentChildren = children.filter((c): c is LayoutNode => Boolean(c));

  if (presentParents.length === 0 || presentChildren.length === 0) return null;

  const parentX =
    presentParents.reduce((sum, parent) => sum + parent.x, 0) / presentParents.length;
  const parentBottom = Math.max(...presentParents.map((p) => p.y)) + metrics.nodeHeight;
  const childTop = Math.min(...presentChildren.map((c) => c.y));
  const busY = childTop - metrics.vGap / 2;

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
