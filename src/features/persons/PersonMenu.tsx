import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { arcPositions, menuPlacement, type MenuPlacement } from '@/features/persons/menuArc';
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
  | 'raise-generation'
  | 'lower-generation'
  | 'reset-generation'
  | 'collapse-house'
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
 * 残りへの入口（⋯ その他）も弧に載せる。枠付きのリストを併せて出すと弧と重なるため。
 * 順番がそのまま上から下の並びになる。削除は下端に置いて、間違って触りにくくする。
 */
const QUICK_ITEMS: { action: PersonAction | 'more'; label: string; danger?: boolean }[] = [
  { action: 'edit', label: '編集' },
  { action: 'add-parent', label: '親を追加' },
  { action: 'add-spouse', label: '配偶者を追加' },
  { action: 'add-child', label: '子を追加' },
  { action: 'more', label: '⋯ その他' },
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
  { action: 'collapse-house', label: 'この家を1枚に畳む' },
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
  { action: 'raise-generation', label: '1つ上の段へ', editOnly: true },
  { action: 'lower-generation', label: '1つ下の段へ', editOnly: true },
  {
    action: 'reset-generation',
    label: '段を自動に戻す',
    editOnly: true,
    when: (person) => (person.generationShift ?? 0) !== 0,
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
  const [placement, setPlacement] = useState<MenuPlacement>({
    x: anchor.x,
    y: anchor.y,
    side: 'right',
    sheet: false,
  });
  const [showMore, setShowMore] = useState(false);

  // 画面の端で切れないように、出したあとで位置を内側へ寄せる。
  // 弧はボタンが枠の外へ張り出すので、そのぶんも menuPlacement が見込む。
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;

    setPlacement(
      menuPlacement(
        anchor,
        { width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
        canEdit && !showMore,
      ),
    );
  }, [anchor, canEdit, showMore]);

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

  const more = visible(MORE_ITEMS);
  /*
   * 弧を出すのは「編集できて、まだ その他 を開いていない」ときだけ。
   * 弧と枠付きのリストを同時に出すと、弧が枠の上に乗って読めなくなる。
   */
  const radial = canEdit && !showMore && !placement.sheet;
  const arc = arcPositions(radial ? QUICK_ITEMS.length : 0, placement.side);
  /*
   * 狭い画面では、弧の代わりに画面下のシートに並べる。
   * 弧はカードのまわりへ張り出すので、スマホの幅では必ずどこかが画面の外へ出て
   * 押せなくなる。確実に押せることを、見た目より優先する。
   */
  const quick = canEdit && placement.sheet && !showMore;

  const className = [
    'person-menu',
    radial ? 'person-menu--radial' : '',
    placement.sheet ? 'person-menu--sheet' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      className={className}
      style={placement.sheet ? undefined : { left: placement.x, top: placement.y }}
      role="menu"
      aria-label={`${displayName(person)} の操作`}
    >
      <p className="person-menu__title">{displayName(person)}</p>

      {quick ? (
        <div className="person-menu__grid">
          {QUICK_ITEMS.map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              className={
                item.danger ? 'person-menu__tile person-menu__tile--danger' : 'person-menu__tile'
              }
              onClick={() => (item.action === 'more' ? setShowMore(true) : onAction(item.action))}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : radial ? (
        <div className="person-menu__arc">
          {QUICK_ITEMS.map((item, index) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              className={
                item.danger ? 'person-menu__spoke person-menu__spoke--danger' : 'person-menu__spoke'
              }
              style={{ transform: `translate(${arc[index].dx}px, ${arc[index].dy}px)` }}
              onClick={() => (item.action === 'more' ? setShowMore(true) : onAction(item.action))}
            >
              {item.label}
            </button>
          ))}
        </div>
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
