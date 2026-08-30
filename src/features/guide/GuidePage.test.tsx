import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { GUIDE_SECTIONS } from '@/features/guide/guideContent';
import { GuidePage } from '@/features/guide/GuidePage';

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/trees/t1/guide']}>
      <Routes>
        <Route path="/trees/:treeId/guide" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GuidePage', () => {
  it('見ただけでは分からないところを扱う', () => {
    renderPage();
    for (const title of [
      '段（だん）は自動で決まります',
      '左右の位置は手で動かせます',
      '「◯◯家」というまとまり',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
  });

  it('目次から本文へ飛べる（印と行き先が対応している）', () => {
    renderPage();
    for (const section of GUIDE_SECTIONS) {
      const link = screen.getByRole('link', { name: section.title });
      expect(link).toHaveAttribute('href', `#${section.id}`);
      expect(document.getElementById(section.id)).not.toBeNull();
    }
  });

  it('よくある困りごとに答えがある', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: '困ったときの見分け方' })).toBeInTheDocument();
    expect(screen.getByText('Q. 段を上げ下げしても動きません')).toBeInTheDocument();
  });

  it('ここに無いことは、ご意見・不具合へ送れる', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'ご意見・不具合' })).toHaveAttribute(
      'href',
      '/trees/t1/feedback',
    );
  });
});
