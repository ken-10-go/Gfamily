import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { arcPositions, ARC_RADIUS } from '@/features/persons/menuArc';
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
  | 'center'
  | 'reset-position'
  | 'reset-sibling-order'
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

/**
 * カードのまわりに弧で並べる操作。
 *
 * 「編集して、家族を足して、間違えたら消す」がほとんどの用なので、その5つだけを近くに置く。
 * 順番がそのまま上から下の並びになる。削除は端に置いて、間違って触りにくくする。
 */
const QUICK_ITEMS: MenuItem[] = [
  { action: 'edit', label: '編集' },
  { action: 'add-parent', label: '親を追加' },
  { action: 'add-spouse', label: '配偶者を追加' },
  { action: 'add-child', label: '子を追加' },
  { action: 'delete', label: '削除', danger: true },
];

/** 弧に載せない操作。「⋯ その他」から縦のリストで開く。 */
const MORE_ITEMS: MenuItem[] = [
  { action: 'detail', label: '詳細を見る' },
  { action: 'add-parents', label: '両親をまとめて追加', editOnly: true },
  { action: 'connect-parent', label: '既存の人物を親にする', editOnly: true },
  { action: 'connect-spouse', label: '既存の人物を配偶者にする', editOnly: true },
  { action: 'connect-child', label: '既存の人物を子にする', editOnly: true },
  { action: 'center', label: '画面の中央に寄せる' },
  { action: 'focus', label: 'この人を中心に絞り込む' },
  {
    action: 'reset-position',
    label: '自動配置に戻す',
    editOnly: true,
    // 手で置いたカードにだけ出す。指でのタップがドラッグと判定されて
    // 意図せず動いてしまうことがあるので、その場で戻せるようにしておく。
    when: (person) => person.position !== null,
  },
  {
    action: 'reset-sibling-order',
    label: '並び順を生年順に戻す',
    editOnly: true,
    when: (person) => person.siblingOrder !== null,
  },
];

/**
 * カードのそばに出す操作メニュー。
 * サイドパネルへ視線を移さずに済むので、狭い画面でも操作しやすい。
 *
 * 編集できるときは、よく使う5つをカードのまわりの弧に出す（仕様書 3つのコア・ジェスチャー）。
 * 閲覧のみのときは弧に載るものが無いので、従来どおりの縦のリストだけを出す。
 */
export function PersonMenu({ person, anchor, canEdit, onAction, onClose }: PersonMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState(anchor);
  const [side, setSide] = useState<'left' | 'right'>('right');
  const [showMore, setShowMore] = useState(false);

  // 画面の端で切れないように、出したあとで位置を内側へ寄せる
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;

    // 弧は枠の外へ張り出すので、そのぶんの余白も見て内側へ寄せる
    const margin = 8;
    const reach = canEdit ? ARC_RADIUS : 0;
    const x = Math.max(margin, Math.min(anchor.x, window.innerWidth - box.width - margin));
    const y = Math.max(
      margin + reach,
      Math.min(anchor.y, window.innerHeight - box.height - margin - reach),
    );

    if (x !== placement.x || y !== placement.y) setPlacement({ x, y });
    // 弧は、はみ出さないほうへ開く
    setSide(anchor.x + ARC_RADIUS + 120 > window.innerWidth ? 'left' : 'right');
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

  const visible = (items: MenuItem[]) =>
    items.filter((item) => (canEdit || !item.editOnly) && (item.when?.(person) ?? true));

  const quick = canEdit ? QUICK_ITEMS : [];
  const more = visible(MORE_ITEMS);
  const arc = arcPositions(quick.length, side);

  return (
    <div
      ref={ref}
      className={quick.length > 0 ? 'person-menu person-menu--radial' : 'person-menu'}
      style={{ left: placement.x, top: placement.y }}
      role="menu"
      aria-label={`${displayName(person)} の操作`}
    >
      <p className="person-menu__title">{displayName(person)}</p>

      {quick.length > 0 && (
        <div className="person-menu__arc">
          {quick.map((item, index) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              className={
                item.danger ? 'person-menu__spoke person-menu__spoke--danger' : 'person-menu__spoke'
              }
              style={{ transform: `translate(${arc[index].dx}px, ${arc[index].dy}px)` }}
              onClick={() => onAction(item.action)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* 弧に載せた5つ以外は、必要な人だけが開けばよい */}
      {quick.length > 0 && !showMore ? (
        <button
          type="button"
          role="menuitem"
          className="person-menu__item"
          onClick={() => setShowMore(true)}
        >
          ⋯ その他
        </button>
      ) : (
        more.map((item) => (
          <button
            key={item.action}
            type="button"
            role="menuitem"
            className={
              item.danger ? 'person-menu__item person-menu__item--danger' : 'person-menu__item'
            }
            onClick={() => onAction(item.action)}
          >
            {item.label}
          </button>
        ))
      )}
    </div>
  );
}
