import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { arcPositions } from '@/features/persons/menuArc';
import { PersonMenu } from '@/features/persons/PersonMenu';
import { EMPTY_PERSON, type Person } from '@/types/models';

function person(overrides: Partial<Person> = {}): Person {
  return { ...EMPTY_PERSON, id: '本人', familyName: '後藤', givenName: '健一', ...overrides };
}

function renderMenu(canEdit: boolean, overrides: Partial<Person> = {}) {
  const onAction = vi.fn();
  render(
    <PersonMenu
      person={person(overrides)}
      anchor={{ x: 100, y: 300 }}
      canEdit={canEdit}
      onAction={onAction}
      onClose={vi.fn()}
    />,
  );
  return onAction;
}

describe('arcPositions', () => {
  it('上から下へ、等しい角度で並べる', () => {
    const arc = arcPositions(5, 'right');

    expect(arc).toHaveLength(5);
    // 上（負の dy）から下（正の dy）へ単調に下がる
    for (let i = 1; i < arc.length; i++) {
      expect(arc[i].dy).toBeGreaterThan(arc[i - 1].dy);
    }
    // 真ん中は真横
    expect(arc[2].dy).toBeCloseTo(0, 5);
    expect(arc[2].dx).toBeCloseTo(96, 5);
  });

  it('どの2つも離れていて、重ならない', () => {
    const arc = arcPositions(5, 'right');

    for (let i = 1; i < arc.length; i++) {
      const gap = Math.hypot(arc[i].dx - arc[i - 1].dx, arc[i].dy - arc[i - 1].dy);
      expect(gap).toBeGreaterThan(30);
    }
  });

  it('左へ開くときは横向きだけが反転し、上下の並びは変わらない', () => {
    const right = arcPositions(5, 'right');
    const left = arcPositions(5, 'left');

    left.forEach((point, index) => {
      expect(point.dx).toBeCloseTo(-right[index].dx, 5);
      expect(point.dy).toBeCloseTo(right[index].dy, 5);
    });
  });

  it('1つだけなら真横に置く', () => {
    expect(arcPositions(1, 'right')).toEqual([{ dx: 96, dy: 0 }]);
  });

  it('0個でも落ちない', () => {
    expect(arcPositions(0, 'right')).toEqual([]);
  });
});

describe('PersonMenu', () => {
  it('編集できるときは、よく使う5つを弧に出す', () => {
    renderMenu(true);

    for (const label of ['編集', '親を追加', '配偶者を追加', '子を追加', '削除']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeTruthy();
    }
    // 残りは畳んである
    expect(screen.queryByRole('menuitem', { name: '詳細を見る' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: '⋯ その他' })).toBeTruthy();
  });

  it('「その他」を開くと残りの操作が出る', () => {
    renderMenu(true);

    fireEvent.click(screen.getByRole('menuitem', { name: '⋯ その他' }));

    expect(screen.getByRole('menuitem', { name: '詳細を見る' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'この人を中心に絞り込む' })).toBeTruthy();
  });

  it('閲覧のみのときは弧を出さず、見るだけの操作を並べる', () => {
    renderMenu(false);

    expect(screen.queryByRole('menuitem', { name: '編集' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: '⋯ その他' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: '詳細を見る' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '画面の中央に寄せる' })).toBeTruthy();
  });

  it('並び順を戻す操作は、手で並べ替えた人にだけ出す', () => {
    renderMenu(true);
    fireEvent.click(screen.getByRole('menuitem', { name: '⋯ その他' }));
    expect(screen.queryByRole('menuitem', { name: '並び順を生年順に戻す' })).toBeNull();

    renderMenu(true, { siblingOrder: 2 });
    fireEvent.click(screen.getAllByRole('menuitem', { name: '⋯ その他' })[0]);
    expect(screen.getAllByRole('menuitem', { name: '並び順を生年順に戻す' })).toHaveLength(1);
  });

  it('弧の項目を押すと、その操作を伝える', () => {
    const onAction = renderMenu(true);

    fireEvent.click(screen.getByRole('menuitem', { name: '子を追加' }));

    expect(onAction).toHaveBeenCalledWith('add-child');
  });
});
