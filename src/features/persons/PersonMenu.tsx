import { useEffect, useRef } from 'react';

import { displayName, type Person } from '@/types/models';

/** メニューから選べる操作。 */
export type PersonAction =
  | 'detail'
  | 'edit'
  | 'add-parent'
  | 'add-spouse'
  | 'add-child'
  | 'connect-parent'
  | 'connect-spouse'
  | 'connect-child'
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
}

const ITEMS: MenuItem[] = [
  { action: 'detail', label: '詳細を見る' },
  { action: 'edit', label: '編集', editOnly: true },
  { action: 'add-parent', label: '親を追加', editOnly: true },
  { action: 'add-spouse', label: '配偶者を追加', editOnly: true },
  { action: 'add-child', label: '子を追加', editOnly: true },
  { action: 'connect-parent', label: '既存の人物を親にする', editOnly: true },
  { action: 'connect-spouse', label: '既存の人物を配偶者にする', editOnly: true },
  { action: 'connect-child', label: '既存の人物を子にする', editOnly: true },
  { action: 'delete', label: '削除', editOnly: true, danger: true },
];

/**
 * カードのそばに出す操作メニュー。
 * サイドパネルへ視線を移さずに済むので、狭い画面でも操作しやすい。
 */
export function PersonMenu({ person, anchor, canEdit, onAction, onClose }: PersonMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

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

  const items = ITEMS.filter((item) => canEdit || !item.editOnly);

  return (
    <div
      ref={ref}
      className="person-menu"
      style={{ left: anchor.x, top: anchor.y }}
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
