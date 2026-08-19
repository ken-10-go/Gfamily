import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { lastTreeId, rememberTree } from '@/features/app/lastTree';
import { TabBar } from '@/features/app/TabBar';

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<TabBar />} />
      </Routes>
    </MemoryRouter>,
  );
}

const linkTo = (name: string) =>
  (screen.getByRole('link', { name }) as HTMLAnchorElement).getAttribute('href');

describe('TabBar', () => {
  beforeEach(() => window.localStorage.clear());

  it('家系図を開いていれば、その家系図へのタブになる', () => {
    renderAt('/trees/t1');

    expect(linkTo('家族')).toBe('/trees/t1/people');
    expect(linkTo('人物を追加')).toBe('/trees/t1?add=person');
    expect(linkTo('設定')).toBe('/trees/t1/settings');
  });

  it('家系図を開いていないときは、直前に開いたものへ戻す', () => {
    rememberTree('t9');
    renderAt('/');

    expect(lastTreeId()).toBe('t9');
    expect(linkTo('家族')).toBe('/trees/t9/people');
  });

  it('行き先が分からないときは、ホームへ送る（押せないタブを作らない）', () => {
    renderAt('/');

    expect(linkTo('家族')).toBe('/');
  });

  it('「＋」は家系図の画面でだけ出す', () => {
    // 図を見ていない画面で追加できても、何が起きたのか分からない
    renderAt('/');
    expect(screen.queryByRole('link', { name: '人物を追加' })).toBeNull();
  });

  it('家系図の中の別の画面（家族・設定）でも「＋」は出さない', () => {
    rememberTree('t1');
    renderAt('/trees/t1/people');

    expect(screen.queryByRole('link', { name: '人物を追加' })).toBeNull();
  });
});
