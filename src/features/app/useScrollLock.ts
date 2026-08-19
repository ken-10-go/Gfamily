import { useEffect } from 'react';

/**
 * 開いている間、背面のページをスクロールさせない。
 *
 * モーダルの中をスクロールしていると、指が端に着いたところで背面の家系図まで
 * 一緒に動いてしまう（モバイルデザイン仕様 3.4）。`<dialog>` は操作こそ塞ぐが、
 * スクロールの連動までは止めてくれない。
 *
 * 位置を `fixed` にして今のスクロール量を打ち消し、閉じるときに元の位置へ戻す。
 * `overflow: hidden` だけだと、iOS では慣性スクロールが残って効かない。
 */
export function useScrollLock() {
  useEffect(() => {
    const { body } = document;
    const offset = window.scrollY;
    const kept = { position: body.style.position, top: body.style.top, width: body.style.width };

    body.style.position = 'fixed';
    body.style.top = `-${offset}px`;
    body.style.width = '100%';

    return () => {
      body.style.position = kept.position;
      body.style.top = kept.top;
      body.style.width = kept.width;
      window.scrollTo(0, offset);
    };
  }, []);
}
