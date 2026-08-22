import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { avatarColor } from '@/features/home/avatar';
import { PersonCard } from '@/features/tree-view/TreeCanvas';
import { verticalText } from '@/features/tree-view/verticalText';
import { DEFAULT_METRICS, type LayoutNode } from '@/features/tree-view/layout';
import {
  DEFAULT_VIEW_SETTINGS,
  type CardField,
  type ViewSettings,
} from '@/features/tree-view/useViewSettings';
import { EMPTY_PERSON, type Person } from '@/types/models';

/*
 * 行の並びを見るテストなので、横書きで確かめる。
 * 既定は縦書きだが、縦書きでは1行が1列になり、行の高さという考え方が無い。
 */
const HORIZONTAL: ViewSettings = { ...DEFAULT_VIEW_SETTINGS, vertical: false };

function node(overrides: Partial<Person>): LayoutNode {
  return {
    person: {
      ...EMPTY_PERSON,
      id: overrides.givenName ?? '本人',
      familyName: '寺原',
      ...overrides,
    },
    x: 0,
    y: 0,
    generation: 0,
    placedByHand: false,
  };
}

/** カードを1枚描いて、行ごとの文字と Y 座標を取り出す。 */
function draw(person: Partial<Person>, cardFields?: CardField[]) {
  const settings: ViewSettings = cardFields ? { ...HORIZONTAL, cardFields } : HORIZONTAL;

  const { container } = render(
    <svg>
      <PersonCard
        node={node(person)}
        metrics={DEFAULT_METRICS}
        settings={settings}
        selected={false}
        inLineage={false}
        distant={false}
        placeholder={false}
        birthOrder={null}
        draggable={false}
        dragOffset={null}
        swapOffset={0}
        onSelect={vi.fn()}
        onCenter={vi.fn()}
        onPointerDown={vi.fn()}
        onPointerMove={vi.fn()}
        onPointerUp={vi.fn()}
      />
    </svg>,
  );

  // 行の検査なので、左端に添える丸アバターの文字は数えない
  return [...container.querySelectorAll('text:not(.person-card__initial)')].map((text) => ({
    text: text.textContent,
    className: text.getAttribute('class') ?? '',
    y: Number(text.getAttribute('y')),
  }));
}

const nameY = (rows: ReturnType<typeof draw>) =>
  rows.find((row) => row.className.includes('person-card__name'))?.y;

/** ふりがなも生没年もある人。ほかのカードはこれと行がそろっていてほしい */
const complete = { givenName: 'サツエ', familyNameKana: 'てらばる', givenNameKana: 'さつえ' };

describe('PersonCard', () => {
  it('ふりがなが無くても、氏名の位置は変わらない', () => {
    const withKana = draw(complete);
    const withoutKana = draw({ givenName: 'リカ' });

    expect(nameY(withoutKana)).toBe(nameY(withKana));
  });

  it('生没年が無くても、氏名の位置は変わらない', () => {
    const withDates = draw({ ...complete, birthDate: '1931', deathDate: '2025', isLiving: false });
    const withoutDates = draw(complete);

    expect(nameY(withoutDates)).toBe(nameY(withDates));
  });

  it('中身の無い行は描かない', () => {
    const rows = draw({ givenName: 'リカ' });

    // 描かれるのは氏名の1行だけ。ふりがなと生没年は枠だけ取って空のまま
    expect(rows).toHaveLength(1);
    expect(rows[0].className).toContain('person-card__name');
  });

  it('ふりがなを出さない設定なら、氏名が先頭の行に来る', () => {
    const withKanaRow = draw(complete);
    const withoutKanaRow = draw(complete, ['lifespan']);

    expect(nameY(withoutKanaRow)).toBeLessThan(nameY(withKanaRow) as number);
  });

  it('年齢は生没年の行に添える', () => {
    const rows = draw({
      ...complete,
      birthDate: '1931-01-01',
      deathDate: '2025-01-01',
      isLiving: false,
    });

    const meta = rows.find((row) => row.className.includes('person-card__meta'));
    expect(meta?.text).toContain('1931');
    expect(meta?.text).toContain('享年');
    // 氏名の行には年齢を出さない
    expect(rows.find((row) => row.className.includes('person-card__name'))?.text).not.toContain(
      '享年',
    );
  });
});

describe('カードの丸アバター', () => {
  /** 丸アバターだけを取り出す。色と文字が一覧と同じかを見る */
  function avatarOf(overrides: Partial<Person>, settings: Partial<ViewSettings> = {}) {
    const { container } = render(
      <svg>
        <PersonCard
          node={{
            person: { ...EMPTY_PERSON, id: 'p1', familyName: '寺原', ...overrides },
            x: 0,
            y: 0,
            generation: 0,
            placedByHand: false,
          }}
          metrics={DEFAULT_METRICS}
          settings={{ ...HORIZONTAL, ...settings }}
          selected={false}
          inLineage={false}
          distant={false}
          placeholder={false}
          birthOrder={null}
          draggable={false}
          dragOffset={null}
          swapOffset={0}
          onSelect={vi.fn()}
          onCenter={vi.fn()}
          onPointerDown={vi.fn()}
          onPointerMove={vi.fn()}
          onPointerUp={vi.fn()}
        />
      </svg>,
    );

    return {
      circle: container.querySelector('.person-card__avatar circle'),
      initial: container.querySelector('.person-card__initial')?.textContent,
    };
  }

  it('姓の1文字を、一覧と同じ色で出す', () => {
    const { circle, initial } = avatarOf({});

    expect(initial).toBe('寺');
    expect(circle?.getAttribute('fill')).toBe(avatarColor('p1'));
  });

  it('出さない設定なら描かない', () => {
    expect(avatarOf({}, { showCardAvatar: false }).circle).toBeNull();
  });

  it('縦書きでは添えない（列の並びが崩れるため）', () => {
    expect(avatarOf({}, { vertical: true }).circle).toBeNull();
  });
});

describe('縦書きの文字', () => {
  it('生没年の横棒を、縦の棒に置き換える', () => {
    // 字を立てて組むので、横棒のままだと線が寝て途切れて見える
    expect(verticalText('1931–2025')).toBe('1931丨2025');
    expect(verticalText('1958–')).toBe('1958丨');
  });

  it('全角の縦線も、漢字の縦棒に直す（記号は縦書き字形で横に寝てしまう）', () => {
    expect(verticalText('1931｜2025')).toBe('1931丨2025');
  });

  it('横棒でない文字はそのまま', () => {
    expect(verticalText('寺原 サツエ')).toBe('寺原 サツエ');
    expect(verticalText('享年94')).toBe('享年94');
  });

  it('縦書きのカードでは、置き換えた文字で描く', () => {
    const { container } = render(
      <svg>
        <PersonCard
          node={node({
            givenName: 'サツエ',
            birthDate: '1931',
            deathDate: '2025',
            isLiving: false,
          })}
          metrics={DEFAULT_METRICS}
          settings={{ ...DEFAULT_VIEW_SETTINGS, vertical: true }}
          selected={false}
          inLineage={false}
          distant={false}
          placeholder={false}
          birthOrder={null}
          draggable={false}
          dragOffset={null}
          swapOffset={0}
          onSelect={vi.fn()}
          onCenter={vi.fn()}
          onPointerDown={vi.fn()}
          onPointerMove={vi.fn()}
          onPointerUp={vi.fn()}
        />
      </svg>,
    );

    expect(container.textContent).toContain('1931丨2025');
    expect(container.textContent).not.toContain('1931–2025');
  });
});
