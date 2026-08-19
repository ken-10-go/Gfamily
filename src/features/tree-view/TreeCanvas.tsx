import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  computeLayout,
  gridFor,
  snapTo,
  type CoupleLink,
  type FamilyUnit,
  type LayoutMetrics,
  type LayoutNode,
} from '@/features/tree-view/layout';
import {
  busLanes,
  crossingsOn,
  hopPath,
  verticalSegments,
  type Segment,
} from '@/features/tree-view/hops';
import { collapseHouses, collapsedHouseTarget } from '@/features/tree-view/collapse';
import { resolveHouses } from '@/features/tree-view/houses';
import { placeholderTarget, withSpousePlaceholders } from '@/features/tree-view/placeholders';
import {
  isOutsideSiblingRow,
  siblingOrderAfterDrag,
  swapPreview,
  type SiblingSlot,
} from '@/features/tree-view/reorder';
import { usePanZoom } from '@/features/tree-view/usePanZoom';
import {
  DEFAULT_VIEW_SETTINGS,
  type CardField,
  type ViewSettings,
} from '@/features/tree-view/useViewSettings';
import { ageLabel, formatWithEra } from '@/lib/japanese-date';
import { birthOrderLabel, lineageOf } from '@/lib/relations';
import {
  displayName,
  displayNameKana,
  lifespanLabel,
  PARENT_KIND_LABELS,
  UNION_STATUS_LABELS,
  type CardPosition,
  type House,
  type ParentKind,
  type Person,
  type TreeGraph,
  type UnionStatus,
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
  /** この時刻を過ぎるまでは動かさない。指での誤操作を防ぐ長押し */
  readyAt: number;
}

/**
 * これ以上動いたらドラッグとみなす。
 * 指でのタップは必ず数ピクセル動くので、マウスより広く取らないと
 * 「押したのにメニューが出ない」状態になる。
 */
const DRAG_THRESHOLD = { mouse: 6, touch: 14 };

/**
 * 指で動かすときに必要な長押しの時間（ミリ秒）。
 *
 * 画面をなぞっただけでカードが動いてしまうと、意図せず配置が保存され、
 * 「勝手に固定された」ように見える。仕様書（4.2）も長押しからの並べ替えとしている。
 * マウスは狙いが正確なので、すぐ動かせる。
 */
const TOUCH_HOLD_MS = 400;

/**
 * 2回目のタップをダブルタップとみなす間隔（ミリ秒）。
 * 端末の標準（300ms 前後）に合わせる。長くすると、続けて別の人を選ぶ操作と紛れる。
 */
const DOUBLE_TAP_MS = 320;

/**
 * 全体表示のときに、これ以上は縮めない倍率。
 * 狭い画面で無理に全部を収めると文字が読めなくなるので、読める大きさで止めてパンしてもらう。
 */
function readableScale(viewWidth: number): number {
  return viewWidth < 640 ? 0.6 : 0.3;
}

/** カード内の文字の配置。余白を詰めて、そのぶん文字を大きく取る。 */
const CARD_PADDING_TOP = 16;
const LINE_HEIGHT = 18;
/** 縦書きのときの列の間隔。cardMetrics が幅を出すときの 1 列ぶんと合わせる。 */
const VERTICAL_COLUMN = 16;

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
   * きょうだいの並べ替えの確定。左から右の順に並んだ人物IDが渡る。
   * きょうだいの列の中で離したときは、座標ではなくこちらを送る。
   */
  onReorderSiblings?: (orderedIds: string[]) => void;
  /**
   * ダブルタップで画面の中央に寄せたとき。
   * 1回目のタップで開いたメニューを閉じるために使う。
   */
  onCenterPerson?: (personId: string) => void;
  /** 外（メニューなど）からの「中央に寄せて」の指示。人物IDを渡す */
  centerRequest?: string | null;
  /** 寄せ終わったことを伝える。同じ人をもう一度指定できるようにするため */
  onCenterDone?: () => void;
  /**
   * 手で置いた位置を無視して自動配置で描く。絞り込み表示のときに使う。
   * 一部だけを描くと手動の座標が意味を持たないため、カードの移動もできなくする。
   */
  ignoreManualPositions?: boolean;
  /**
   * 薄く描く人物。絞り込みの端にいて「この先にもまだ続く」ことを示すのに使う。
   * 操作はふつうにできる。見え方だけを弱める。
   */
  dimmed?: ReadonlySet<string>;
  /**
   * ダブルタップしたとき。中央へ寄せると同時に、その人を中心に絞り込む。
   * 中央へ寄せるだけでよければ渡さなくてよい。
   */
  onFocusPerson?: (personId: string) => void;
  /**
   * 描いている図の識別子。変わると図をフェードで入れ替える。
   * 絞り込みの中心が変わったときに「別の眺めになった」と分かるようにするために使う。
   */
  sceneKey?: string;
  /**
   * 手で登録した家。人物の `houseIds` と突き合わせて、家ごとの帯を作るのに使う。
   * 渡さなくても血のつながりから自動で判定するので、省略してよい。
   */
  houses?: House[];
  /**
   * 1枚に畳んで表示する家の識別子。中身の人物は消えて「◯◯家（n人）」の
   * カード1枚になり、外へのつながりだけが残る。畳んだカードを叩くと開く。
   */
  collapsedHouses?: ReadonlySet<string>;
}

const NO_DIMMED: ReadonlySet<string> = new Set<string>();

export function TreeCanvas({
  graph,
  metrics,
  settings = DEFAULT_VIEW_SETTINGS,
  selectedPersonId,
  onSelectPerson,
  canReorder = false,
  onMovePerson,
  onReorderSiblings,
  onCenterPerson,
  centerRequest = null,
  onCenterDone,
  ignoreManualPositions = false,
  dimmed = NO_DIMMED,
  onFocusPerson,
  sceneKey = 'all',
  houses,
  collapsedHouses = NO_DIMMED,
}: TreeCanvasProps) {
  // 畳むのは配偶者の枠より前。畳んだ家の人に空の枠を出しても意味がないため
  const opened = useMemo(
    () => collapseHouses(graph, resolveHouses(graph, houses ?? []), collapsedHouses),
    [graph, houses, collapsedHouses],
  );
  // 空の配偶者カードはレイアウト計算の前に足す。枠のぶんの場所が確保され、実在のカードと重ならない
  const drawn = useMemo(
    () => (settings.showSpousePlaceholder && canReorder ? withSpousePlaceholders(opened) : opened),
    [opened, settings.showSpousePlaceholder, canReorder],
  );
  const layout = useMemo(
    () => computeLayout(drawn, metrics, { ignoreManualPositions, houses }),
    [drawn, metrics, ignoreManualPositions, houses],
  );
  const draggable = canReorder && !ignoreManualPositions;

  // 選んだ人物からさかのぼる筋。強調表示に使う
  const lineage = useMemo(
    () => (settings.highlightLineage ? lineageOf(graph, selectedPersonId) : new Set<string>()),
    [graph, selectedPersonId, settings.highlightLineage],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<CardDrag | null>(null);
  const { viewport, isPanning, zoomBy, fitTo, centerOn, handlers } = usePanZoom();
  /** 直前のタップ。同じカードを続けて叩いたらダブルタップとして扱う */
  const lastTapRef = useRef<{ personId: string; at: number } | null>(null);
  const grid = useMemo(() => gridFor(metrics), [metrics]);
  /** カード1枚ぶんの幅（間隔込み）。列から外れたかの判定に使う */
  const SLOT = metrics.nodeWidth + metrics.hGap;

  /**
   * その人が属するきょうだいの列。並べ替えの対象になる面々。
   *
   * 複数のグループにまたがることはない（きょうだいは親の組で決まる）ので、
   * 最初に見つかったものを使う。空の配偶者枠は並べ替えの対象にしない。
   */
  const siblingsOfPerson = useMemo(() => {
    const byPerson = new Map<string, string[]>();
    for (const group of layout.siblingGroups) {
      for (const childId of group.childIds) {
        if (!byPerson.has(childId)) byPerson.set(childId, group.childIds);
      }
    }
    return byPerson;
  }, [layout.siblingGroups]);

  function siblingSlotsOf(personId: string): SiblingSlot[] {
    return (siblingsOfPerson.get(personId) ?? [])
      .filter((id) => !placeholderTarget(id))
      .map((id) => ({ id, x: positionById.get(id)?.x ?? 0 }))
      .filter((slot) => positionById.has(slot.id));
  }

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

  /*
   * きょうだいの横棒の高さを、家族ごとに決めておく。
   * 同じ高さで重なるものだけを上へ逃がすので、2本が1本に見えることがなくなる。
   * 縦線もこの高さに合わせて引くため、先に決めてから集める。
   */
  const lanes = useMemo(
    () => busLanes(layout.families, positionById, metrics),
    [layout.families, positionById, metrics],
  );
  const verticals = useMemo(
    () => verticalSegments(layout.families, positionById, metrics, lanes),
    [layout.families, positionById, metrics, lanes],
  );

  // メニューから指示された人物を中央へ寄せる
  useEffect(() => {
    if (!centerRequest || size.width === 0) return;

    const node = positionById.get(centerRequest);
    if (node) centerOn(node.x, node.y + metrics.nodeHeight / 2, size.width, size.height);
    onCenterDone?.();
    // 指示が変わったときだけ動かす。位置の再計算では動かさない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerRequest, size.width, size.height]);

  function startDrag(personId: string, event: React.PointerEvent<SVGGElement>) {
    if (!draggable || placeholderTarget(personId) || collapsedHouseTarget(personId)) return;

    const byTouch = event.pointerType !== 'mouse';
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      personId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      threshold: byTouch ? DRAG_THRESHOLD.touch : DRAG_THRESHOLD.mouse,
      readyAt: performance.now() + (byTouch ? TOUCH_HOLD_MS : 0),
    });
  }

  function moveDrag(event: React.PointerEvent<SVGGElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;

    // 長押しの前に指が動いたら、それは画面をなぞる操作。カードは動かさない
    if (performance.now() < drag.readyAt) {
      if (Math.hypot(dx, dy) > drag.threshold) setDrag(null);
      return;
    }

    const moved = drag.moved || Math.hypot(dx, dy) > drag.threshold;
    setDrag({ ...drag, dx, dy, moved });
  }

  /**
   * ダブルタップなら、その人を中心に絞り込んで画面の中央へ寄せる。
   *
   * 大きな家系図では見たい人がすぐ画面の外へ出るうえ、遠い親戚まで描かれて読みにくい。
   * 「叩いたら真ん中に来て、まわりだけになる」を入口にする
   * （仕様書 UI デザインガイド 4.1「フォーカス&カリング」）。
   */
  function handleTap(personId: string, anchor: CardAnchor): void {
    // 畳んだ家のカードは「開く」だけ。中身が無いので絞り込みも中央寄せも意味がない
    if (collapsedHouseTarget(personId)) {
      onSelectPerson(personId, anchor);
      return;
    }

    const previous = lastTapRef.current;
    const now = performance.now();

    if (previous && previous.personId === personId && now - previous.at < DOUBLE_TAP_MS) {
      lastTapRef.current = null;

      if (onFocusPerson) {
        // 絞り込むと図そのものが組み直されるので、今の座標へ寄せても意味がない。
        // 寄せ直しは、新しい図が出てから centerRequest 経由で行う。
        onFocusPerson(personId);
        onCenterPerson?.(personId);
        return;
      }

      const node = positionById.get(personId);
      if (node) {
        centerOn(node.x, node.y + metrics.nodeHeight / 2, size.width, size.height);
        onCenterPerson?.(personId);
      }
      return;
    }

    lastTapRef.current = { personId, at: now };
    onSelectPerson(personId, anchor);
  }

  function endDrag(personId: string, event: React.PointerEvent<SVGGElement>) {
    const anchor = { x: event.clientX, y: event.clientY };

    // ドラッグ対象でないカード（閲覧のみ・ロック中）はここを通る。選択だけ行う。
    if (!drag || drag.pointerId !== event.pointerId) {
      handleTap(personId, anchor);
      return;
    }

    // つまんだだけで動かしていなければ、クリックとして選択する
    if (!drag.moved) {
      setDrag(null);
      handleTap(personId, anchor);
      return;
    }

    // 動かしたらタップの連続は途切れる
    lastTapRef.current = null;

    const node = positionById.get(personId);
    setDrag(null);
    if (!node) return;

    const droppedX = node.x + drag.dx / viewport.scale;
    const siblings = siblingSlotsOf(personId);

    /*
     * きょうだいの列の中で離したなら、並べ替えとして扱う（仕様書 3つのコア・ジェスチャー ③）。
     * 列から大きく外して離したときだけ、今までどおり座標として置く。
     *
     * 並べ替えでは座標を保存しない。順番はカードの大きさや表示項目が変わっても
     * 意味を保つが、座標は保たないため。
     */
    if (!isOutsideSiblingRow(siblings, personId, droppedX, SLOT)) {
      const ordered = siblingOrderAfterDrag(siblings, personId, droppedX);
      if (ordered && onReorderSiblings) onReorderSiblings(ordered);
      return;
    }

    if (onMovePerson) {
      // 横だけを格子に合わせて確定する。
      // 縦は世代の行に決まっていて動かせないので、送らない（y は行の値をそのまま返す）。
      onMovePerson(personId, {
        x: snapTo(droppedX, grid.x),
        y: node.y,
      });
    }
  }

  /*
   * ドラッグ中に、すれ違っているきょうだいを1枚だけ動かして見せる。
   * 図の全体を組み直さずに「ここへ入る」が伝わる。
   */
  const preview = (() => {
    if (!drag?.moved) return null;

    const node = positionById.get(drag.personId);
    if (!node) return null;

    return swapPreview(
      siblingSlotsOf(drag.personId),
      drag.personId,
      node.x + drag.dx / viewport.scale,
    );
  })();

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
        {/* key を変えて作り直すことで、図が入れ替わったことをフェードで示す */}
        <g
          key={sceneKey}
          className="tree-canvas__scene"
          transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}
        >
          {/* 動かしている間だけ格子を出して、置きたい位置を狙いやすくする */}
          {drag?.moved && <GridLines grid={grid} width={layout.width} height={layout.height} />}

          {settings.showGenerationNumbers && (
            <GenerationRuler nodes={layout.nodes} metrics={metrics} width={layout.width} />
          )}

          <g className="tree-canvas__links">
            {layout.couples.map((couple) => (
              <CoupleLine
                key={couple.id}
                id={couple.id}
                a={positionById.get(couple.partner1Id)}
                b={positionById.get(couple.partner2Id)}
                metrics={metrics}
                status={couple.status}
                dimmed={dimmed.has(couple.partner1Id) && dimmed.has(couple.partner2Id)}
                verticals={verticals}
              />
            ))}
            {layout.families.map((family) => (
              <FamilyLines
                key={family.key}
                owner={family.key}
                parents={family.parentIds.map((id) => positionById.get(id))}
                children={family.childIds.map((id) => positionById.get(id))}
                childKinds={family.childKinds}
                metrics={metrics}
                lineage={lineage}
                dimmed={dimmed}
                verticals={verticals}
                busY={lanes.get(family.key)}
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
              inLineage={lineage.has(node.person.id)}
              distant={dimmed.has(node.person.id)}
              birthOrder={
                placeholderTarget(node.person.id) ? null : birthOrderLabel(graph, node.person)
              }
              placeholder={placeholderTarget(node.person.id) !== null}
              house={collapsedHouseTarget(node.person.id) !== null}
              draggable={draggable}
              dragOffset={
                drag?.moved && drag.personId === node.person.id
                  ? // 縦は世代で決まるので、見た目も横にしか動かさない
                    { x: drag.dx / viewport.scale, y: 0 }
                  : null
              }
              // すれ違った相手は、動かした人の元の場所へ入れ替わって見える
              swapOffset={preview?.partnerId === node.person.id ? preview.dx : 0}
              onSelect={handleTap}
              onCenter={(id) => {
                const node = positionById.get(id);
                if (!node) return;
                centerOn(node.x, node.y + metrics.nodeHeight / 2, size.width, size.height);
                onCenterPerson?.(id);
              }}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
            />
          ))}
        </g>
      </svg>

      <LineLegend families={layout.families} couples={layout.couples} />

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
 * 線の読み方。
 *
 * 家系図としてふつうの「実線＝実の親子」だけの図では出さない。
 * 縁組や離婚など、線の違いに意味がある家系図のときにだけ添える。
 */
function LineLegend({ families, couples }: { families: FamilyUnit[]; couples: CoupleLink[] }) {
  const hasAdoptive = families.some((family) =>
    Object.values(family.childKinds).some((kind) => kind !== 'biological'),
  );
  const hasDivorced = couples.some((couple) => couple.status === 'divorced');
  const hasMarried = couples.some(
    (couple) => couple.status === 'married' || couple.status === 'widowed',
  );

  if (!hasAdoptive && !hasDivorced) return null;

  return (
    <dl className="tree-canvas__legend">
      <Legend label="実の親子" className="link" />
      {hasAdoptive && <Legend label="養子・連れ子など" className="link link--adoptive" />}
      {hasMarried && <Legend label="婚姻" className="link link--couple" doubled />}
      {hasDivorced && <Legend label="離婚" className="link link--divorced" />}
    </dl>
  );
}

function Legend({
  label,
  className,
  doubled = false,
}: {
  label: string;
  className: string;
  doubled?: boolean;
}) {
  return (
    <div className="tree-canvas__legend-item">
      <dt>
        <svg width="28" height="10" aria-hidden="true">
          {(doubled ? [3, 7] : [5]).map((y) => (
            <line key={y} x1={2} y1={y} x2={26} y2={y} className={className} />
          ))}
        </svg>
      </dt>
      <dd>{label}</dd>
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

/**
 * 氏名の下に出す1行ぶんの文字。空文字ならその行は描かない。
 *
 * 年齢は氏名の横に添えるので、ここには含めない。
 */
function fieldText(field: CardField, person: Person, birthOrder: string | null): string {
  switch (field) {
    case 'kana':
      return displayNameKana(person);
    case 'meta':
      return [birthOrder, lifespanLabel(person)].filter(Boolean).join('　');
    case 'birthOrder':
      return birthOrder ?? '';
    case 'lifespan':
      return lifespanLabel(person);
    case 'birthDate':
      return formatWithEra(person.birthDate);
    case 'deathDate':
      return person.isLiving ? '' : formatWithEra(person.deathDate);
    case 'birthPlace':
      return person.birthPlace ?? '';
    case 'note':
      return person.note?.split('\n')[0] ?? '';
  }
}

/**
 * 段の目盛り。左端に段の番号を出す。
 *
 * 「1つ上／下の段へ」で思ったところへ行かないとき、いま何段目に居るのかが
 * 見えないと直しようがない。番号で言えるようにしておく。
 */
function GenerationRuler({
  nodes,
  metrics,
  width,
}: {
  nodes: LayoutNode[];
  metrics: LayoutMetrics;
  width: number;
}) {
  // 段ごとの上端。同じ段は同じ y なので、番号と対にして拾う
  const rows = new Map<number, number>();
  for (const node of nodes) rows.set(node.generation, node.y);

  return (
    <g className="tree-canvas__ruler" aria-hidden="true">
      {[...rows].map(([generation, y]) => (
        <g key={generation}>
          <line
            className="tree-canvas__ruler-line"
            x1={-metrics.nodeWidth / 2}
            y1={y - metrics.vGap / 4}
            x2={width}
            y2={y - metrics.vGap / 4}
          />
          <text
            className="tree-canvas__ruler-label"
            x={-metrics.nodeWidth / 2 - 8}
            y={y + metrics.nodeHeight / 2}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {generation}
          </text>
        </g>
      ))}
    </g>
  );
}

/** 1枚のカード。行の並びを単体で確かめられるよう export している。 */
export function PersonCard({
  node,
  metrics,
  settings,
  selected,
  inLineage,
  distant,
  placeholder,
  house,
  birthOrder,
  draggable,
  dragOffset,
  swapOffset,
  onSelect,
  onCenter,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  node: LayoutNode;
  metrics: LayoutMetrics;
  settings: ViewSettings;
  selected: boolean;
  /** 選んだ人物からさかのぼる直系の筋にいるか */
  inLineage: boolean;
  /** 絞り込みの端にいて、この先にもまだ家系が続くか */
  distant: boolean;
  /** 実在しない「＋ 配偶者」の枠か */
  placeholder: boolean;
  /** 畳んだ家の1枚（「◯◯家（3人）」）か */
  house?: boolean;
  birthOrder: string | null;
  draggable: boolean;
  /** ドラッグ中の見た目の追従量（レイアウト座標）。動かしていなければ null。 */
  dragOffset: CardPosition | null;
  /** 並べ替えですれ違ったときに、譲る先へずらす量。すれ違っていなければ 0。 */
  swapOffset: number;
  onSelect: (id: string, anchor: CardAnchor) => void;
  /** キーボードから中央へ寄せる（マウスのダブルクリックにあたる操作） */
  onCenter: (id: string) => void;
  onPointerDown: (personId: string, event: React.PointerEvent<SVGGElement>) => void;
  onPointerMove: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerUp: (personId: string, event: React.PointerEvent<SVGGElement>) => void;
}) {
  const { person } = node;
  const left = node.x - metrics.nodeWidth / 2 + (dragOffset?.x ?? 0) + swapOffset;
  const top = node.y + (dragOffset?.y ?? 0);

  const names = nameLines(person, settings);
  const age = settings.showAge ? ageLabel(person) : '';

  /*
   * 表示すると決めた項目の数だけ、中身が空でも行の枠を取る。
   *
   * 空の行を詰めてしまうと、ふりがなの無い人だけ氏名が上へ繰り上がり、
   * 隣のカードと行がそろわなくなる（カードの高さは項目数から決めていて縮まないため）。
   * 空の行は文字を描かないだけにして、位置は動かさない。
   */
  // ふりがなだけは氏名の上に置く。読みは名前の一部という見え方にする。
  const showKana = settings.cardFields.includes('kana');
  const below = settings.cardFields
    .filter((field) => field !== 'kana')
    .map((field) => ({ field, text: fieldText(field, person, birthOrder) }));

  /*
   * 年齢は生没年に添える（「1950– 75歳」）。年齢は生没年から出る値なので、
   * 同じ行にあるほうが読みやすい。
   * 生没年を出していないときだけ、氏名の横に置く（設定を切っていないのに消えないように）。
   */
  const ageRow = below.findIndex((row) => row.field === 'lifespan' || row.field === 'meta');

  const rows: { text: string; className: string; age?: string }[] = [
    ...(showKana ? [{ text: displayNameKana(person), className: 'person-card__kana' }] : []),
    ...names.map((text, index) => ({
      text,
      className: 'person-card__name',
      age: ageRow === -1 && index === names.length - 1 ? age : undefined,
    })),
    ...below.map((row, index) => ({
      text: row.text,
      className: 'person-card__meta',
      age: index === ageRow ? age : undefined,
    })),
  ];

  // 読み上げでは、カードに出している補足行をそのまま読ませる（無音の行は読ませない）
  const ariaLabel = [displayName(person), ...below.map((row) => row.text)]
    .filter(Boolean)
    .join(' ');

  return (
    <g
      data-person-card
      className={[
        'person-card',
        `person-card--${person.gender}`,
        selected ? 'person-card--selected' : '',
        inLineage ? 'person-card--lineage' : '',
        distant ? 'person-card--distant' : '',
        placeholder ? 'person-card--placeholder' : '',
        house ? 'person-card--house' : '',
        person.isLiving ? '' : 'person-card--deceased',
        draggable ? 'person-card--draggable' : '',
        dragOffset ? 'person-card--dragging' : '',
        swapOffset !== 0 ? 'person-card--swapping' : '',
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
        // 画面の中央へ寄せる。ダブルタップと同じ操作をキーボードからも行えるように
        if (event.key === 'c' || event.key === 'C') {
          event.preventDefault();
          onCenter(person.id);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
    >
      <rect
        width={metrics.nodeWidth}
        height={metrics.nodeHeight}
        rx={8}
        className="person-card__box"
      />

      {/* 中身の無い行は描かない。ただし添字は詰めないので、行の位置は動かない */}
      {settings.vertical
        ? rows.map((row, index) =>
            row.text ? (
              <text
                key={index}
                // 縦書きは右の列から始める
                x={metrics.nodeWidth - 16 - index * VERTICAL_COLUMN}
                y={12}
                className={`${row.className} person-card__text--vertical`}
              >
                {row.text}
              </text>
            ) : null,
          )
        : rows.map((row, index) =>
            row.text || row.age ? (
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
            ) : null,
          )}
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

/**
 * 夫婦をつなぐ横線。
 *
 * 婚姻（死別を含む）は伝統的な書き方に合わせて二重の実線、
 * 婚姻届のないパートナーは一本の実線、離婚は破線で表す（仕様書 3.5-3）。
 */
function CoupleLine({
  id,
  a,
  b,
  metrics,
  status,
  dimmed,
  verticals,
}: {
  /** この線の持ち主。自分につながる縦線をまたがないために使う */
  id: string;
  a?: LayoutNode;
  b?: LayoutNode;
  metrics: LayoutMetrics;
  status: UnionStatus;
  /** 端の人物どうしの線。カードと同じだけ薄くする */
  dimmed: boolean;
  /** 図の中の縦線すべて。交差したところに弧を出す */
  verticals: Segment[];
}) {
  if (!a || !b) return null;

  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
  const x1 = left.x + metrics.nodeWidth / 2;
  const x2 = right.x - metrics.nodeWidth / 2;
  const y1 = left.y + metrics.nodeHeight / 2;
  const y2 = right.y + metrics.nodeHeight / 2;

  const className = status === 'divorced' ? 'link link--divorced' : 'link link--couple';
  // 二重線は上下に2本引いて表す。線の太さを変えるより、和装の家系図の見た目に近い
  const offsets = status === 'married' || status === 'widowed' ? [-2, 2] : [0];

  /*
   * 段の違う夫婦（婚姻で片方が引き下げられた場合など）は、まっすぐ斜めに結ぶ。
   * 飛び越えの弧は横線にしか付けられないので、そのときは弧を出さない。
   * ここを「左の人の高さ」で決め打ちすると、線が相手に届かず宙ぶらりんになる。
   */
  const level = y1 === y2;
  const crossings = level ? crossingsOn({ x1, y1, x2, y2, owner: id }, verticals) : [];

  return (
    <g className={dimmed ? 'link-group link-group--distant' : 'link-group'}>
      {offsets.map((offset) =>
        level ? (
          <path key={offset} d={hopPath(y1 + offset, x1, x2, crossings)} className={className} />
        ) : (
          <line
            key={offset}
            x1={x1}
            y1={y1 + offset}
            x2={x2}
            y2={y2 + offset}
            className={className}
          />
        ),
      )}
      <title>{UNION_STATUS_LABELS[status]}</title>
    </g>
  );
}

/**
 * 親から子へ引く線。
 * 親の下端 → 世代間の中間にある横棒（きょうだいバス） → 各子の上端、の3段で描く。
 */
function FamilyLines({
  owner,
  parents,
  children,
  childKinds,
  metrics,
  lineage,
  dimmed,
  verticals,
  busY: laneY,
}: {
  /** この家族の識別子。自分の幹や枝をまたがないために使う */
  owner: string;
  parents: (LayoutNode | undefined)[];
  children: (LayoutNode | undefined)[];
  /** 子ごとの親子の種別。実子は実線、縁組は破線で描き分ける */
  childKinds: Record<string, ParentKind>;
  metrics: LayoutMetrics;
  /** 直系の筋にいる人物。親と子の両方が入っている線だけを強調する */
  lineage: Set<string>;
  /** 絞り込みの端にいる人物。つながる線もカードと同じだけ薄くする */
  dimmed: ReadonlySet<string>;
  /** 図の中の縦線すべて。交差したところに弧を出す */
  verticals: Segment[];
  /** きょうだいの横棒の高さ。busLanes が決めた段（重なる家族は上へ逃げている） */
  busY?: number;
}) {
  const presentParents = parents.filter((p): p is LayoutNode => Boolean(p));
  const presentChildren = children.filter((c): c is LayoutNode => Boolean(c));

  if (presentParents.length === 0 || presentChildren.length === 0) return null;

  const parentX = presentParents.reduce((sum, parent) => sum + parent.x, 0) / presentParents.length;
  const parentBottom = Math.max(...presentParents.map((p) => p.y)) + metrics.nodeHeight;
  // 高さの決め方は busLanes に集約してある。渡されなかったときだけ既定の中間に置く
  const busY = laneY ?? Math.min(...presentChildren.map((c) => c.y)) - metrics.vGap / 2;

  const childXs = presentChildren.map((c) => c.x);
  const busLeft = Math.min(...childXs, parentX);
  const busRight = Math.max(...childXs, parentX);

  // 親と子の両方が筋に入っているときだけ、その親子の線をたどれるように強調する
  const parentInLineage = presentParents.some((parent) => lineage.has(parent.person.id));
  const lineageChildren = presentChildren.filter((child) => lineage.has(child.person.id));
  const highlighted = parentInLineage && lineageChildren.length > 0;
  const linkClass = (on: boolean) => (on ? 'link link--lineage' : 'link');

  // 親が全員そろって端にいるなら、この家族の線ごと薄くする
  const parentsDistant = presentParents.every((parent) => dimmed.has(parent.person.id));

  return (
    <g className={parentsDistant ? 'link-group link-group--distant' : 'link-group'}>
      <line
        x1={parentX}
        y1={parentBottom}
        x2={parentX}
        y2={busY}
        className={linkClass(highlighted)}
      />
      {/* きょうだいの横棒。よその家の縦線とぶつかるところは弧でまたぐ */}
      {busRight - busLeft > 1 && (
        <path
          d={hopPath(
            busY,
            busLeft,
            busRight,
            crossingsOn({ x1: busLeft, y1: busY, x2: busRight, y2: busY, owner }, verticals),
          )}
          className="link"
        />
      )}
      {presentChildren.map((child) => {
        // 実子は一本の実線、養子・連れ子・里子などの縁組は破線（仕様書 3.5-3）
        const kind = childKinds[child.person.id] ?? 'biological';
        const adoptive = kind !== 'biological';

        return (
          <line
            key={child.person.id}
            x1={child.x}
            y1={busY}
            x2={child.x}
            y2={child.y}
            className={[
              linkClass(highlighted && lineage.has(child.person.id)),
              adoptive ? 'link--adoptive' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <title>{PARENT_KIND_LABELS[kind]}</title>
          </line>
        );
      })}
    </g>
  );
}
