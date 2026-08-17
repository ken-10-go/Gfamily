import { describe, expect, it } from 'vitest';

import {
  cardMetrics,
  DEFAULT_VIEW_SETTINGS,
  migrateSettings,
  MAX_CARD_FIELDS,
} from '@/features/tree-view/useViewSettings';

describe('migrateSettings', () => {
  it('以前の showKana / showNote をカードの項目に読み替える', () => {
    const migrated = migrateSettings({ showKana: true, showNote: true });
    expect(migrated.cardFields).toEqual(['kana', 'lifespan', 'note']);
  });

  it('ふりがなを切っていた端末では、ふりがなを出さない', () => {
    expect(migrateSettings({ showKana: false }).cardFields).toEqual(['lifespan']);
  });

  it('新しい形の設定はそのまま使う', () => {
    const migrated = migrateSettings({ cardFields: ['birthDate', 'birthPlace'] });
    expect(migrated.cardFields).toEqual(['birthDate', 'birthPlace']);
  });

  it('知らない項目は捨て、上限を超えたぶんは切り落とす', () => {
    const migrated = migrateSettings({
      cardFields: [
        'kana',
        'meta',
        'birthOrder',
        'lifespan',
        'birthDate',
        'deathDate',
        'birthPlace',
        'note',
        // 別の版で保存された知らない項目
        'kamon' as never,
      ],
    });

    expect(migrated.cardFields).toHaveLength(MAX_CARD_FIELDS);
    expect(migrated.cardFields).not.toContain('kamon');
  });

  it('既定値は和風モダンで、ふりがなと生没年を出す', () => {
    const migrated = migrateSettings({});
    expect(migrated.theme).toBe('washi');
    expect(migrated.cardFields).toEqual(['kana', 'lifespan']);
  });

  it('前の既定のまま保存されていたら、新しい既定へ寄せる', () => {
    expect(migrateSettings({ cardFields: ['kana', 'meta'] }).cardFields).toEqual([
      'kana',
      'lifespan',
    ]);
  });

  it('自分で選び直した設定は、前の既定に似ていても変えない', () => {
    // 順が違う・項目が足りている場合は「選んだ結果」なので、そのまま尊重する
    expect(migrateSettings({ cardFields: ['meta', 'kana'] }).cardFields).toEqual(['meta', 'kana']);
    expect(migrateSettings({ cardFields: ['kana', 'meta', 'note'] }).cardFields).toEqual([
      'kana',
      'meta',
      'note',
    ]);
    expect(migrateSettings({ cardFields: ['meta'] }).cardFields).toEqual(['meta']);
  });
});

describe('cardMetrics', () => {
  it('カードの高さは氏名の行数と項目数で決まる', () => {
    const one = cardMetrics({ ...DEFAULT_VIEW_SETTINGS, cardFields: ['meta'] });
    const three = cardMetrics({
      ...DEFAULT_VIEW_SETTINGS,
      cardFields: ['kana', 'meta', 'birthPlace'],
    });

    expect(three.nodeHeight).toBeGreaterThan(one.nodeHeight);
    // 幅は変えない。高さだけが伸びる
    expect(three.nodeWidth).toBe(one.nodeWidth);
  });

  it('氏名を2行にすると、そのぶん高くなる', () => {
    const single = cardMetrics({ ...DEFAULT_VIEW_SETTINGS, nameLines: 1 });
    const double = cardMetrics({ ...DEFAULT_VIEW_SETTINGS, nameLines: 2 });

    expect(double.nodeHeight).toBeGreaterThan(single.nodeHeight);
  });
});
