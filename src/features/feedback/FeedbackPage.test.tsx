import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedbackPage } from '@/features/feedback/FeedbackPage';
import * as api from '@/lib/api';
import type { Feedback, TreeRole } from '@/types/models';

vi.mock('@/lib/api');

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}));

function entry(overrides: Partial<Feedback> = {}): Feedback {
  return {
    id: 'f1',
    body: '家系図が開かない',
    status: 'open',
    reply: null,
    createdBy: 'hanako',
    appVersion: 'ver.1.2',
    userAgent: 'test-agent',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage(role: TreeRole, items: Feedback[]) {
  vi.mocked(api.getMyRole).mockResolvedValue(role);
  vi.mocked(api.listFeedback).mockResolvedValue(items);
  vi.mocked(api.listNicknames).mockResolvedValue(new Map([['hanako', 'はなこ']]));
  vi.mocked(api.createFeedback).mockResolvedValue('new');
  vi.mocked(api.updateFeedback).mockResolvedValue();
  vi.mocked(api.deleteFeedback).mockResolvedValue();

  render(
    <MemoryRouter initialEntries={['/trees/t1/feedback']}>
      <Routes>
        <Route path="/trees/:treeId/feedback" element={<FeedbackPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FeedbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('送る前に、使い方ガイドへ寄れる', async () => {
    renderPage('viewer', []);
    expect(await screen.findByRole('link', { name: '使い方ガイド' })).toHaveAttribute(
      'href',
      '/trees/t1/guide',
    );
  });

  it('空のままでは送れない', async () => {
    renderPage('viewer', []);
    expect(await screen.findByRole('button', { name: '送る' })).toBeDisabled();
  });

  it('書いて送ると、本文だけを渡す（種類は選ばせない）', async () => {
    renderPage('viewer', []);
    fireEvent.change(await screen.findByRole('textbox'), {
      target: { value: 'ここが押しにくい' },
    });
    fireEvent.click(screen.getByRole('button', { name: '送る' }));
    await waitFor(() => expect(api.createFeedback).toHaveBeenCalledWith('t1', 'ここが押しにくい'));
    expect(await screen.findByText('ありがとうございます。届きました。')).toBeInTheDocument();
  });

  it('投稿した人を呼び名で出す', async () => {
    renderPage('viewer', [entry()]);
    expect(await screen.findByText('はなこ・2026/8/1')).toBeInTheDocument();
  });

  it('オーナーは対応の状況を変えられる', async () => {
    renderPage('owner', [entry()]);
    fireEvent.change(await screen.findByLabelText('対応の状況'), { target: { value: 'doing' } });
    await waitFor(() =>
      expect(api.updateFeedback).toHaveBeenCalledWith('t1', 'f1', { status: 'doing' }),
    );
  });

  it('オーナー以外には状況を変える口を出さない', async () => {
    renderPage('viewer', [entry()]);
    await screen.findByText('はなこ・2026/8/1');
    expect(screen.queryByLabelText('対応の状況')).not.toBeInTheDocument();
  });

  it('自分の投稿は自分で消せる', async () => {
    renderPage('viewer', [entry({ createdBy: 'me' })]);
    fireEvent.click(await screen.findByRole('button', { name: '消す' }));
    await waitFor(() => expect(api.deleteFeedback).toHaveBeenCalledWith('t1', 'f1'));
  });

  it('他人の投稿は消せない', async () => {
    renderPage('viewer', [entry()]);
    await screen.findByText('はなこ・2026/8/1');
    expect(screen.queryByRole('button', { name: '消す' })).not.toBeInTheDocument();
  });

  it('対応済みは畳んでおき、押すと開く', async () => {
    renderPage('viewer', [entry({ status: 'done', body: '直りました' })]);
    await screen.findByText('対応済みも見る（1）');
    expect(screen.queryByText('直りました')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('対応済みも見る（1）'));
    expect(screen.getByText('直りました')).toBeInTheDocument();
  });

  it('オーナーからの一言が付いていれば出す', async () => {
    renderPage('viewer', [entry({ reply: '直しました' })]);
    expect(await screen.findByText('↳ 直しました')).toBeInTheDocument();
  });
});
