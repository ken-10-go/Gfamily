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
    expect(linkTo('人物を追加')).toBe('/');
  });
});
