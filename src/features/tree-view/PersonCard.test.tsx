import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PersonCard } from '@/features/tree-view/TreeCanvas';
import { DEFAULT_METRICS, type LayoutNode } from '@/features/tree-view/layout';
import {
  DEFAULT_VIEW_SETTINGS,
  type CardField,
  type ViewSettings,
} from '@/features/tree-view/useViewSettings';
import { EMPTY_PERSON, type Person } from '@/types/models';

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
  const settings: ViewSettings = cardFields
    ? { ...DEFAULT_VIEW_SETTINGS, cardFields }
    : DEFAULT_VIEW_SETTINGS;

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

  return [...container.querySelectorAll('text')].map((text) => ({
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
