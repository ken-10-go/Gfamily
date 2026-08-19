import { describe, expect, it } from 'vitest';

import { parseSuisui } from '@/lib/suisui';

/*
 * 書き出しの形をそのまま持つ、明確なダミーのデータ。
 * 実際の家族のデータはリポジトリに入れない。
 */
const person = (
  id: string,
  parentUnion: string,
  order: number,
  cells: {
    familyName?: string;
    givenName?: string;
    familyNameKana?: string;
    givenNameKana?: string;
    birth?: [number, number, number, number];
    death?: [number, number, number, number];
    gender?: string;
    note?: string;
  },
) =>
  [
    id,
    '0',
    parentUnion,
    String(order),
    '0',
    '0',
    '0.00',
    '0.00',
    '0',
    '0',
    '0',
    '0',
    cells.familyName ?? '',
    cells.givenName ?? '',
    cells.familyNameKana ?? '',
    cells.givenNameKana ?? '',
    ...(cells.birth ?? [2, 0, 0, 0]).map(String),
    ...(cells.death ?? [2, 0, 0, 0]).map(String),
    cells.gender ?? '1',
    '',
    '',
    '',
    cells.note ?? '',
  ].join('\t');

const union = (id: string, husband: string, wife: string) =>
  [id, '0', husband, '0', wife, '0', '0.00', '0.00', '0', '0', '0', '0'].join('\t');

const sample = [
  '3\t1\t100',
  person('100', '0', 0, {
    familyName: '見本',
    givenName: '太郎',
    familyNameKana: 'みほん',
    givenNameKana: 'たろう',
    birth: [1785, 55, 11, 7],
    gender: '1',
    note: 'ためし',
  }),
  person('200', '0', 0, {
    familyName: '見本',
    givenName: '花子',
    birth: [128, 1960, 3, 1],
    death: [128, 2020, 9, 5],
    gender: '2',
  }),
  person('300', '900', 0, {
    familyName: '見本',
    givenName: '次郎',
    birth: [999, 12, 1, 1],
    gender: '1',
  }),
  union('900', '100', '200'),
].join('\n');

describe('parseSuisui', () => {
  const data = parseSuisui(sample);

  it('見出しの件数ぶんだけ、人物と夫婦を読む', () => {
    expect(data.persons.map((p) => p.sourceId)).toEqual(['100', '200', '300']);
    expect(data.unions).toHaveLength(1);
  });

  it('和暦は西暦に直し、入力そのものも残す', () => {
    const taro = data.persons[0].input;

    // 昭和55年11月7日
    expect(taro.birthDate).toBe('1980-11-07');
    expect(taro.birthEra).toEqual({ eraName: '昭和', eraYear: 55, month: 11, day: 7 });
  });

  it('西暦はそのまま。没年が入っていれば故人として扱う', () => {
    const hanako = data.persons[1].input;

    expect(hanako.birthDate).toBe('1960-03-01');
    expect(hanako.deathDate).toBe('2020-09-05');
    expect(hanako.isLiving).toBe(false);
    expect(hanako.gender).toBe('female');
  });

  it('没年が入っていなければ存命', () => {
    expect(data.persons[0].input.isLiving).toBe(true);
  });

  it('ふりがな・メモも読む。空欄は null にする', () => {
    expect(data.persons[0].input.familyNameKana).toBe('みほん');
    expect(data.persons[0].input.note).toBe('ためし');
    expect(data.persons[1].input.familyNameKana).toBeNull();
  });

  it('夫婦と、その子のつながりを組み立てる', () => {
    expect(data.unions[0]).toEqual({
      sourceId: '900',
      partner1SourceId: '100',
      partner2SourceId: '200',
      childSourceIds: ['300'],
    });
  });

  it('知らない元号のコードは、黙って捨てずに持ち帰る', () => {
    // 日付は落とすが、落としたことが分かるようにする
    expect(data.persons[2].input.birthDate).toBeNull();
    expect(data.unknownEras).toEqual([999]);
  });

  it('BOM が付いていても読める', () => {
    expect(parseSuisui(`\uFEFF${sample}`).persons).toHaveLength(3);
  });
});
