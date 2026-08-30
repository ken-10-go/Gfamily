import { describe, expect, it } from 'vitest';

import { auditSentence, dayLabel, entityLabel, timeLabel } from '@/features/history/auditLabels';
import type { AuditLog } from '@/types/models';

function log(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'l1',
    actorId: 'hanako',
    entity: 'persons',
    entityId: 'p1',
    action: 'update',
    createdAt: '2026-03-01T05:20:00.000Z',
    ...overrides,
  };
}

describe('auditSentence', () => {
  it('人物の変更は、その人の名前で読める', () => {
    expect(auditSentence(log(), 'はなこ', '山田 太郎')).toBe(
      'はなこ さんが 山田 太郎 を編集しました',
    );
  });

  it('引けない人物は、消されたものとして書く', () => {
    expect(auditSentence(log({ action: 'delete' }), 'はなこ', null)).toBe(
      'はなこ さんが 消された人物 を削除しました',
    );
  });

  it('人物以外は、種類の名前だけを出す', () => {
    expect(auditSentence(log({ entity: 'unions', action: 'insert' }), 'たろう', null)).toBe(
      'たろう さんが 夫婦のつながり を追加しました',
    );
  });

  it('実行者が分からないときも、空欄にしない', () => {
    expect(auditSentence(log({ action: 'restore' }), null, '山田 太郎')).toBe(
      '（分からない人） さんが 山田 太郎 を元に戻しました',
    );
  });

  it('知らない種類は、そのままの値を出す（記録を落とさない）', () => {
    expect(entityLabel('somethingNew')).toBe('somethingNew');
  });
});

describe('日付と時刻', () => {
  it('行には時刻だけを出す', () => {
    expect(timeLabel('2026-03-01T05:20:00.000Z')).toMatch(/\d{2}:\d{2}/);
  });

  it('日付が無い記録も、見出しを持てる', () => {
    expect(dayLabel(null)).toBe('日付の分からない記録');
  });
});
