import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  computeLayout,
  gridFor,
  snapTo,
  type LayoutMetrics,
  type LayoutNode,
} from '@/features/tree-view/layout';
import { usePanZoom } from '@/features/tree-view/usePanZoom';
import { DEFAULT_VIEW_SETTINGS, type ViewSettings } from '@/features/tree-view/useViewSettings';
import { ageLabel } from '@/lib/japanese-date';
import { birthOrderLabel } from '@/lib/relations';
import {
  displayName,
  displayNameKana,
  lifespanLabel,
  type CardPosition,
  type Person,
  type TreeGraph,
} from '@/types/models';

/** ドラッグ中のカード。閾値を超えるまでは選択操作と区別がつかないので moved で判定する。 */
interface CardDrag {
  personId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  /** 画面上の移動量（ピクセル）。レイアウト座標に直すときは倍率で割る。 */
  dx: number;
  dy: number;
  moved: boolean;
  threshold: number;
}

/**
 * これ以上動いたらドラッグとみなす。
 * 指でのタップは必ず数ピクセル動くので、マウスより広く取らないと
 * 「押したのにメニューが出ない」状態になる。
 */
const DRAG_THRESHOLD = { mouse: 6, touch: 14 };

/**
 * 全体表示のときに、これ以上は縮めない倍率。
 * 狭い画面で無理に全部を収めると文字が読めなくなるので、読める大きさで止めてパンしてもらう。
 */
function readableScale(viewWidth: number): number {
  return viewWidth < 640 ? 0.6 : 0.3;
}

/** カード内の文字の配置。余白を詰めて、そのぶん文字を大きく取る。 */
const CARD_PADDING_TOP = 19;
const LINE_HEIGHT = 19;

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
  /** カードを動かせるか。閲覧のみの権限やロック中は false。 */
  canReorder?: boolean;
  /** ドラッグで置いた位置の確定。格子に合わせた座標が渡る。 */
  onMovePerson?: (personId: string, position: CardPosition) => void;
  /**
   * 手で置いた位置を無視して自動配置で描く。絞り込み表示のときに使う。
   * 一部だけを描くと手動の座標が意味を持たないため、カードの移動もできなくする。
   */
  ignoreManualPositions?: boolean;
}

export function TreeCanvas({
  graph,
  metrics,
  settings = DEFAULT_VIEW_SETTINGS,
  selectedPersonId,
  onSelectPerson,
  canReorder = false,
  onMovePerson,
  ignoreManualPositions = false,
}: TreeCanvasProps) {
  const layout = useMemo(
    () => computeLayout(graph, metrics, { ignoreManualPositions }),
    [graph, metrics, ignoreManualPositions],
  );
  const draggable = canReorder && !ignoreManualPositions;
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<CardDrag | null>(null);
  const { viewport, isPanning, zoomBy, fitTo, handlers } = usePanZoom();
  const grid = useMemo(() => gridFor(metrics), [metrics]);

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
      fitTo(layout.width, layout.height, size.width, size.height, readableScale(size.width));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personCount, size.width, size.height, metrics.nodeWidth, metrics.nodeHeight]);

  const positionById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.person.id, node])),
    [layout.nodes],
  );

  function startDrag(personId: string, event: React.PointerEvent<SVGGElement>) {
    if (!draggable) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      personId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      threshold: event.pointerType === 'mouse' ? DRAG_THRESHOLD.mouse : DRAG_THRESHOLD.touch,
    });
  }

  function moveDrag(event: React.PointerEvent<SVGGElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    const moved = drag.moved || Math.hypot(dx, dy) > drag.threshold;
    setDrag({ ...drag, dx, dy, moved });
  }

  function endDrag(personId: string, event: React.PointerEvent<SVGGElement>) {
    const anchor = { x: event.clientX, y: event.clientY };

    // ドラッグ対象でないカード（閲覧のみ・ロック中）はここを通る。選択だけ行う。
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

    const node = positionById.get(personId);
    setDrag(null);

    if (node && onMovePerson) {
      // 落とした位置を格子に合わせて確定する。
      // 縦は世代の行に吸着するので、関係線が水平につながる。
      onMovePerson(personId, {
        x: snapTo(node.x + drag.dx / viewport.scale, grid.x),
        y: snapTo(node.y + drag.dy / viewport.scale, grid.y),
      });
    }
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
          {/* 動かしている間だけ格子を出して、置きたい位置を狙いやすくする */}
          {drag?.moved && <GridLines grid={grid} width={layout.width} height={layout.height} />}

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
              draggable={draggable}
              dragOffset={
                drag?.moved && drag.personId === node.person.id
                  ? { x: drag.dx / viewport.scale, y: drag.dy / viewport.scale }
                  : null
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
        {/*
          初期表示は readableScale で「読める大きさ」に留めるが、
          「全体」は明示的な操作なので、小さくなっても全員を画面に収める。
        */}
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

/**
 * 設定に合わせた氏名の行。姓名の順と、1行か2行かで変わる。
 */
function nameLines(person: Person, settings: ViewSettings): string[] {
  const family = person.familyName ?? '';
  const given = person.givenName ?? '';
  const parts = (settings.nameOrder === 'family-first' ? [family, given] : [given, family]).filter(
    Boolean,
  );

  const lines = parts.length === 0 ? [displayName(person)] : parts;
  return settings.nameLines === 2 ? lines : [lines.join(' ')];
}

/** カードに出す補足行（続柄・生没年）。年齢は名前の横に出すのでここには入れない。 */
function metaLine(person: Person, birthOrder: string | null): string {
  return [birthOrder, lifespanLabel(person)].filter(Boolean).join('　');
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
  /** ドラッグ中の見た目の追従量（レイアウト座標）。動かしていなければ null。 */
  dragOffset: CardPosition | null;
  onSelect: (id: string, anchor: CardAnchor) => void;
  onPointerDown: (personId: string, event: React.PointerEvent<SVGGElement>) => void;
  onPointerMove: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerUp: (personId: string, event: React.PointerEvent<SVGGElement>) => void;
}) {
  const { person } = node;
  const left = node.x - metrics.nodeWidth / 2 + (dragOffset?.x ?? 0);
  const top = node.y + (dragOffset?.y ?? 0);

  const names = nameLines(person, settings);
  const kana = settings.showKana ? displayNameKana(person) : '';
  const meta = metaLine(person, birthOrder);
  const note = settings.showNote ? (person.note?.split('\n')[0] ?? '') : '';

  // 年齢は名前のすぐ横に、細く小さく添える
  const age = settings.showAge ? ageLabel(person) : '';

  const rows: { text: string; className: string; age?: string }[] = [
    ...(kana ? [{ text: kana, className: 'person-card__kana' }] : []),
    ...names.map((text, index) => ({
      text,
      className: 'person-card__name',
      age: index === names.length - 1 ? age : undefined,
    })),
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
        person.isLiving ? '' : 'person-card--deceased',
        draggable ? 'person-card--draggable' : '',
        dragOffset ? 'person-card--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      transform={`translate(${left} ${top})`}
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
              y={CARD_PADDING_TOP + index * LINE_HEIGHT}
              textAnchor="middle"
              className={row.className}
            >
              {row.text}
              {row.age && <tspan className="person-card__age"> {row.age}</tspan>}
            </text>
          ))}
    </g>
  );
}

/**
 * ドラッグ中に出す格子。
 * 縦線は列、横線は世代の行にあたる。図の外側にも少し伸ばして、
 * 家系図の端の外へ動かすときも目安が見えるようにする。
 */
function GridLines({
  grid,
  width,
  height,
}: {
  grid: { x: number; y: number };
  width: number;
  height: number;
}) {
  const margin = grid.x * 2;
  const columns = Math.ceil((width + margin * 2) / grid.x);
  const rows = Math.ceil((height + margin * 2) / grid.y);

  return (
    <g className="tree-canvas__grid" aria-hidden="true">
      {Array.from({ length: columns + 1 }, (_, i) => {
        const x = -margin + i * grid.x;
        return <line key={`c${i}`} x1={x} y1={-margin} x2={x} y2={height + margin} />;
      })}
      {Array.from({ length: rows + 1 }, (_, i) => {
        const y = -margin + i * grid.y;
        return <line key={`r${i}`} x1={-margin} y1={y} x2={width + margin} y2={y} />;
      })}
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
