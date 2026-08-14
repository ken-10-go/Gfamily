import { useEffect, useRef, type ReactNode } from 'react';

interface PersonDialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 人物の編集や詳細を出すモーダル。
 *
 * ネイティブの <dialog> を使う。フォーカスの閉じ込め、Esc で閉じる、
 * 背面の操作を止める、といった挙動がブラウザ側で用意されているため、
 * 自前で組むより取りこぼしが少ない。
 */
export function PersonDialog({ title, onClose, children }: PersonDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog?.open) dialog?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      onClose={onClose}
      // 背景（::backdrop）をクリックしたときだけ閉じる。中身のクリックでは閉じない。
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      <div className="dialog__head">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={() => ref.current?.close()}
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
      <div className="dialog__body">{children}</div>
    </dialog>
  );
}
