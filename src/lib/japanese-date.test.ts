import { describe, expect, it } from 'vitest';

import {
  ageLabel,
  eraYearToGregorian,
  formatEra,
  formatGregorian,
  formatWithEra,
  fromEra,
  maxEraYear,
  parsePartialDate,
  toEraDates,
  toPartialDateString,
} from '@/lib/japanese-date';

describe('parsePartialDate', () => {
  it('年月日を解釈する', () => {
    expect(parsePartialDate('1935-05-15')).toEqual({
      year: 1935,
      month: 5,
      day: 15,
      precision: 'day',
    });
  });

  it('年月までの日付を解釈する', () => {
    expect(parsePartialDate('1935-05')).toEqual({
      year: 1935,
      month: 5,
      day: undefined,
      precision: 'month',
    });
  });

  it('年だけの日付を解釈する', () => {
    expect(parsePartialDate('1935')).toEqual({
      year: 1935,
      month: undefined,
      day: undefined,
      precision: 'year',
    });
  });

  it('空や不正な値は null を返す', () => {
    expect(parsePartialDate(null)).toBeNull();
    expect(parsePartialDate('')).toBeNull();
    expect(parsePartialDate('明治32年')).toBeNull();
    expect(parsePartialDate('1935-13')).toBeNull();
    expect(parsePartialDate('1935-02-30')).toBeNull();
  });

  it('うるう年の2月29日を受け付ける', () => {
    expect(parsePartialDate('2024-02-29')?.day).toBe(29);
    expect(parsePartialDate('2023-02-29')).toBeNull();
  });
});

describe('toPartialDateString', () => {
  it('精度に応じた文字列を組み立てる', () => {
    expect(toPartialDateString(1935, 5, 15)).toBe('1935-05-15');
    expect(toPartialDateString(1935, 5)).toBe('1935-05');
    expect(toPartialDateString(1935)).toBe('1935');
    expect(toPartialDateString(1935, null, null)).toBe('1935');
  });

  it('文字列のまま比較しても古い順に並ぶ', () => {
    const sorted = ['1935-05-15', '1899', '1935-05', '1912-07-30'].sort();
    expect(sorted).toEqual(['1899', '1912-07-30', '1935-05', '1935-05-15']);
  });
});

describe('toEraDates', () => {
  it('改元日は新しい元号に属する', () => {
    // 1912-07-30 は大正元年の初日
    expect(toEraDates('1912-07-29')).toEqual([{ era: '明治', year: 45 }]);
    expect(toEraDates('1912-07-30')).toEqual([{ era: '大正', year: 1 }]);
  });

  it('昭和の開始と終了を正しく判定する', () => {
    expect(toEraDates('1926-12-24')).toEqual([{ era: '大正', year: 15 }]);
    expect(toEraDates('1926-12-25')).toEqual([{ era: '昭和', year: 1 }]);
    expect(toEraDates('1989-01-07')).toEqual([{ era: '昭和', year: 64 }]);
    expect(toEraDates('1989-01-08')).toEqual([{ era: '平成', year: 1 }]);
  });

  it('平成から令和への改元を判定する', () => {
    expect(toEraDates('2019-04-30')).toEqual([{ era: '平成', year: 31 }]);
    expect(toEraDates('2019-05-01')).toEqual([{ era: '令和', year: 1 }]);
  });

  it('年しか分からず改元をまたぐ年は候補を両方返す', () => {
    // 戸籍に「大正15年生」とも「昭和元年生」とも書かれうる
    expect(toEraDates('1926')).toEqual([
      { era: '大正', year: 15 },
      { era: '昭和', year: 1 },
    ]);
    expect(toEraDates('1989')).toEqual([
      { era: '昭和', year: 64 },
      { era: '平成', year: 1 },
    ]);
  });

  it('改元のない年は候補が1つだけになる', () => {
    expect(toEraDates('1935')).toEqual([{ era: '昭和', year: 10 }]);
  });

  it('明治より前は元号が求まらない', () => {
    expect(toEraDates('1850')).toEqual([]);
  });
});

describe('formatWithEra', () => {
  it('西暦と和暦を併記する', () => {
    expect(formatWithEra('1935-05-15')).toBe('1935年（昭和10年）5月15日');
  });

  it('元年は「元年」と表す', () => {
    expect(formatWithEra('2019-05-01')).toBe('2019年（令和元年）5月1日');
  });

  it('年月までしか分からない場合も併記する', () => {
    expect(formatWithEra('1899-03')).toBe('1899年（明治32年）3月');
  });

  it('年だけの場合は年で止める', () => {
    expect(formatWithEra('1899')).toBe('1899年（明治32年）');
  });

  it('改元をまたぐ年は両方の和暦を並べる', () => {
    expect(formatWithEra('1926')).toBe('1926年（大正15年・昭和元年）');
  });

  it('明治より前は西暦だけを返す', () => {
    expect(formatWithEra('1850')).toBe('1850年');
  });

  it('値が無ければ空文字', () => {
    expect(formatWithEra(null)).toBe('');
  });
});

describe('formatEra / formatGregorian', () => {
  it('和暦だけ・西暦だけの表記を返す', () => {
    expect(formatEra('1935-05-15')).toBe('昭和10年');
    expect(formatGregorian('1935-05-15')).toBe('1935年5月15日');
    expect(formatGregorian('1935-05')).toBe('1935年5月');
    expect(formatGregorian('1935')).toBe('1935年');
  });
});

describe('eraYearToGregorian', () => {
  it('和暦の年を西暦に変換する', () => {
    expect(eraYearToGregorian('昭和', 10)).toBe(1935);
    expect(eraYearToGregorian('明治', 1)).toBe(1868);
    expect(eraYearToGregorian('令和', 1)).toBe(2019);
  });

  it('その元号に存在しない年は受け付けない', () => {
    // 昭和は64年まで
    expect(eraYearToGregorian('昭和', 64)).toBe(1989);
    expect(eraYearToGregorian('昭和', 65)).toBeNull();
    expect(eraYearToGregorian('大正', 16)).toBeNull();
  });

  it('0年や負の年は受け付けない', () => {
    expect(eraYearToGregorian('昭和', 0)).toBeNull();
    expect(eraYearToGregorian('昭和', -1)).toBeNull();
  });

  it('知らない元号は null', () => {
    expect(eraYearToGregorian('慶応', 1)).toBeNull();
  });
});

describe('fromEra', () => {
  it('和暦の年月日を保存形式にする', () => {
    expect(fromEra('昭和', 10, 5, 15)).toBe('1935-05-15');
    expect(fromEra('明治', 32, 3)).toBe('1899-03');
    expect(fromEra('大正', 15)).toBe('1926');
  });

  it('西暦へ変換して戻すと元に戻る', () => {
    const original = '1935-05-15';
    const [eraDate] = toEraDates(original);
    expect(fromEra(eraDate.era, eraDate.year, 5, 15)).toBe(original);
  });
});

describe('ageLabel', () => {
  const today = new Date('2026-08-13T00:00:00Z');
  const living = (birthDate: string | null) => ({ birthDate, deathDate: null, isLiving: true });
  const dead = (birthDate: string | null, deathDate: string | null) => ({
    birthDate,
    deathDate,
    isLiving: false,
  });

  it('存命の満年齢を出す', () => {
    expect(ageLabel(living('1960-05-15'), today)).toBe('66歳');
  });

  it('誕生日前ならまだ歳を取っていない', () => {
    expect(ageLabel(living('1960-12-31'), today)).toBe('65歳');
    expect(ageLabel(living('1960-08-13'), today)).toBe('66歳');
    expect(ageLabel(living('1960-08-14'), today)).toBe('65歳');
  });

  it('月日が分からなければ「約」を付ける', () => {
    expect(ageLabel(living('1960'), today)).toBe('約66歳');
    expect(ageLabel(living('1960-05'), today)).toBe('約66歳');
  });

  it('没後は享年で表す', () => {
    expect(ageLabel(dead('1930-04-02', '2005-11-18'), today)).toBe('享年75');
    expect(ageLabel(dead('1899', '1962'), today)).toBe('享年約63');
  });

  it('生年が分からなければ何も出さない', () => {
    expect(ageLabel(living(null), today)).toBe('');
    expect(ageLabel(dead(null, '2000-01-01'), today)).toBe('');
  });

  it('没年が分からない故人は何も出さない', () => {
    expect(ageLabel(dead('1930-01-01', null), today)).toBe('');
  });
});

describe('maxEraYear', () => {
  it('元号ごとの最大年を返す', () => {
    expect(maxEraYear('明治')).toBe(45);
    expect(maxEraYear('大正')).toBe(15);
    expect(maxEraYear('昭和')).toBe(64);
    expect(maxEraYear('平成')).toBe(31);
  });

  it('現行の元号は今年までを上限にする', () => {
    expect(maxEraYear('令和', new Date('2026-08-13T00:00:00Z'))).toBe(8);
  });
});
