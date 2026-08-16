import { useCallback, useEffect, useRef, useState } from 'react';

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/**
 * SVG のパン・ズーム操作。
 *
 * ホイールでカーソル位置を中心にズームし、ドラッグで平行移動する。
 * 大人数の家系図でも再レンダリングが重くならないよう、状態は viewport 1つに集約する。
 */
export function usePanZoom(initial: Viewport = { x: 0, y: 0, scale: 1 }) {
  const [viewport, setViewport] = useState<Viewport>(initial);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  /** 実行中の中央寄せ。次の指示や手動の操作が来たら止める */
  const animationRef = useRef<number | null>(null);
  /** アニメーションの開始位置を読むための控え。state を依存に持たずに済ませる */
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const cancelAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  // 画面を離れるときに走りっぱなしにしない
  useEffect(() => cancelAnimation, [cancelAnimation]);

  const onWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      cancelAnimation();
      const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    setViewport((current) => {
      const next = clampScale(current.scale * Math.exp(-event.deltaY / 500));
      if (next === current.scale) return current;

      // カーソル下の座標が動かないように平行移動量を補正する
      const ratio = next / current.scale;
      return {
        scale: next,
        x: pointerX - (pointerX - current.x) * ratio,
        y: pointerY - (pointerY - current.y) * ratio,
      };
      });
    },
    [cancelAnimation],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      // 手で動かし始めたら、中央寄せの途中でも譲る
      cancelAnimation();

      // カード上でのクリックは選択操作なので、パンを始めない
      if ((event.target as Element).closest('[data-person-card]')) return;

      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsPanning(true);
    },
    [cancelAnimation],
  );

  const onPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    drag.startX = event.clientX;
    drag.startY = event.clientY;

    setViewport((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsPanning(false);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      cancelAnimation();
      setViewport((current) => ({ ...current, scale: clampScale(current.scale * factor) }));
    },
    [cancelAnimation],
  );

  /**
   * 図全体が収まるように表示位置を合わせる。
   *
   * minScale を指定すると、そこまでしか縮小しない。狭い画面で大きな家系図を
   * 全部入れようとすると文字が潰れて読めなくなるため、読める大きさで止めて
   * あとはパンしてもらう。収まりきらないときは上端から見せる。
   */
  const fitTo = useCallback(
    (
      contentWidth: number,
      contentHeight: number,
      viewWidth: number,
      viewHeight: number,
      minScale = MIN_SCALE,
    ) => {
      cancelAnimation();
      if (contentWidth <= 0 || contentHeight <= 0) return;

      const padding = 24;
      const fitted = Math.min(
        (viewWidth - padding * 2) / contentWidth,
        (viewHeight - padding * 2) / contentHeight,
        1,
      );
      const scale = clampScale(Math.max(fitted, Math.min(minScale, 1)));

      const scaledHeight = contentHeight * scale;
      setViewport({
        scale,
        x: (viewWidth - contentWidth * scale) / 2,
        y: scaledHeight > viewHeight - padding * 2 ? padding : (viewHeight - scaledHeight) / 2,
      });
    },
    [cancelAnimation],
  );

  /**
   * 指定した点が画面の中央に来るように、なめらかに寄せる。
   *
   * 大きな家系図では、見たい人が画面の外にいることがよくある。
   * 一瞬で飛ぶと今どこを見ているのか分からなくなるので、
   * 1秒かけて動かし、目で追えるようにする。
   *
   * 途中で新しい指示が来たら、そちらへ切り替える（前の動きは捨てる）。
   */
  const centerOn = useCallback(
    (targetX: number, targetY: number, viewWidth: number, viewHeight: number, duration = 1000) => {
      cancelAnimation();

      const from = viewportRef.current;
      const to = {
        scale: from.scale,
        x: viewWidth / 2 - targetX * from.scale,
        y: viewHeight / 2 - targetY * from.scale,
      };

      // すでにほぼ中央にいるなら動かさない（わずかな揺れを見せない）
      if (Math.abs(to.x - from.x) < 1 && Math.abs(to.y - from.y) < 1) return;

      const started = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        // 動き始めと止まり際をなめらかにする（ease-in-out）
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;

        setViewport({
          scale: from.scale,
          x: from.x + (to.x - from.x) * eased,
          y: from.y + (to.y - from.y) * eased,
        });

        animationRef.current = progress < 1 ? requestAnimationFrame(step) : null;
      };

      animationRef.current = requestAnimationFrame(step);
    },
    [cancelAnimation],
  );

  return {
    viewport,
    isPanning,
    zoomBy,
    fitTo,
    centerOn,
    handlers: { onWheel, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
