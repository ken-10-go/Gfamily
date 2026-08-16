import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { displayName, type Person } from '@/types/models';

/** メニューから選べる操作。 */
export type PersonAction =
  | 'detail'
  | 'edit'
  | 'add-parent'
  | 'add-parents'
  | 'add-spouse'
  | 'add-child'
  | 'connect-parent'
  | 'connect-spouse'
  | 'connect-child'
  | 'focus'
  | 'reset-position'
  | 'delete';

interface PersonMenuProps {
  person: Person;
  /** カードの画面上の位置。ここに寄せて出す。 */
  anchor: { x: number; y: number };
  canEdit: boolean;
  onAction: (action: PersonAction) => void;
  onClose: () => void;
}

interface MenuItem {
  action: PersonAction;
  label: string;
  editOnly?: boolean;
  danger?: boolean;
  /** 出す条件。指定が無ければ常に出す。 */
  when?: (person: Person) => boolean;
}

const ITEMS: MenuItem[] = [
  { action: 'detail', label: '詳細を見る' },
  { action: 'edit', label: '編集', editOnly: true },
  { action: 'add-parent', label: '親を追加', editOnly: true },
  { action: 'add-parents', label: '両親をまとめて追加', editOnly: true },
  { action: 'add-spouse', label: '配偶者を追加', editOnly: true },
  { action: 'add-child', label: '子を追加', editOnly: true },
  { action: 'connect-parent', label: '既存の人物を親にする', editOnly: true },
  { action: 'connect-spouse', label: '既存の人物を配偶者にする', editOnly: true },
  { action: 'connect-child', label: '既存の人物を子にする', editOnly: true },
  { action: 'focus', label: 'この人を中心に絞り込む' },
  {
    action: 'reset-position',
    label: '自動配置に戻す',
    editOnly: true,
    // 手で置いたカードにだけ出す。指でのタップがドラッグと判定されて
    // 意図せず動いてしまうことがあるので、その場で戻せるようにしておく。
    when: (person) => person.position !== null,
  },
  { action: 'delete', label: '削除', editOnly: true, danger: true },
];

/**
 * カードのそばに出す操作メニュー。
 * サイドパネルへ視線を移さずに済むので、狭い画面でも操作しやすい。
 */
export function PersonMenu({ person, anchor, canEdit, onAction, onClose }: PersonMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState(anchor);

  // 画面の端で切れないように、出したあとで位置を内側へ寄せる
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;

    const margin = 8;
    const x = Math.max(margin, Math.min(anchor.x, window.innerWidth - box.width - margin));
    const y = Math.max(margin, Math.min(anchor.y, window.innerHeight - box.height - margin));

    if (x !== placement.x || y !== placement.y) setPlacement({ x, y });
    // anchor が変わったときだけ計算し直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.x, anchor.y, canEdit]);

  // 外側をクリックするか Esc で閉じる
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    // 開いた直後の同じクリックで閉じないよう、次のタイミングから拾う
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', handlePointerDown);
    }, 0);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const items = ITEMS.filter(
    (item) => (canEdit || !item.editOnly) && (item.when?.(person) ?? true),
  );

  return (
    <div
      ref={ref}
      className="person-menu"
      style={{ left: placement.x, top: placement.y }}
      role="menu"
      aria-label={`${displayName(person)} の操作`}
    >
      <p className="person-menu__title">{displayName(person)}</p>
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className={item.danger ? 'person-menu__item person-menu__item--danger' : 'person-menu__item'}
          onClick={() => onAction(item.action)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
