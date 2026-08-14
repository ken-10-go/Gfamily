import { useCallback, useRef, useState } from 'react';

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

  const onWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
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
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    // カード上でのクリックは選択操作なので、パンを始めない
    if ((event.target as Element).closest('[data-person-card]')) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  }, []);

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

  const zoomBy = useCallback((factor: number) => {
    setViewport((current) => ({ ...current, scale: clampScale(current.scale * factor) }));
  }, []);

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
    [],
  );

  return {
    viewport,
    isPanning,
    zoomBy,
    fitTo,
    handlers: { onWheel, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
