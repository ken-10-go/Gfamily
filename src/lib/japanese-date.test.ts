import { describe, expect, it } from 'vitest';

import {
  ageInYears,
  ageLabel,
  birthDateFromAge,
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

  it('江戸期の元号も求まる（戸籍をさかのぼると必ず出てくる）', () => {
    expect(toEraDates('1850')).toEqual([{ era: '嘉永', year: 3 }]);
    expect(toEraDates('1867')).toEqual([{ era: '慶応', year: 3 }]);
  });

  it('載せている最も古い元号より前は求まらない', () => {
    expect(toEraDates('1700')).toEqual([]);
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

  it('江戸期も併記する', () => {
    expect(formatWithEra('1850')).toBe('1850年（嘉永3年）');
  });

  it('元号が分からないほど古ければ西暦だけを返す', () => {
    expect(formatWithEra('1700')).toBe('1700年');
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

  it('江戸期の元号も西暦に直せる', () => {
    expect(eraYearToGregorian('慶応', 1)).toBe(1865);
    expect(eraYearToGregorian('嘉永', 3)).toBe(1850);
  });

  it('知らない元号は null', () => {
    expect(eraYearToGregorian('享保', 1)).toBeNull();
  });

  it('その元号に存在しない年は受け付けない', () => {
    // 慶応は4年（1868）まで
    expect(eraYearToGregorian('慶応', 5)).toBeNull();
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
    expect(ageLabel(living('1960-05-15'), today, 'exact')).toBe('66歳');
  });

  it('満年齢では、誕生日前ならまだ歳を取っていない', () => {
    expect(ageLabel(living('1960-12-31'), today, 'exact')).toBe('65歳');
    expect(ageLabel(living('1960-08-13'), today, 'exact')).toBe('66歳');
    expect(ageLabel(living('1960-08-14'), today, 'exact')).toBe('65歳');
  });

  it('月日が分からなくても「約」は付けない', () => {
    expect(ageLabel(living('1960'), today, 'exact')).toBe('66歳');
    expect(ageLabel(living('1960-05'), today, 'exact')).toBe('66歳');
  });

  it('学年では、その年度に何歳になるかを出す（誕生日の前でも上がる）', () => {
    // 2026年8月 → 2026年度（2027年3月31日まで）
    expect(ageLabel(living('1960-12-31'), today)).toBe('66歳');
    expect(ageLabel(living('1960-05-15'), today)).toBe('66歳');
  });

  it('4月1日生まれは、前の学年（1つ上の数字）に入る', () => {
    // 誕生日の前日に歳を取るので、4月1日生まれが早生まれの最後になる
    expect(ageLabel(living('2015-04-01'), today)).toBe('12歳');
    expect(ageLabel(living('2015-04-02'), today)).toBe('11歳');
  });

  it('年度が変わると数字が上がる', () => {
    const march = new Date('2027-03-31T00:00:00Z');
    const april = new Date('2027-04-01T00:00:00Z');

    expect(ageLabel(living('2015-05-24'), march)).toBe('11歳');
    expect(ageLabel(living('2015-05-24'), april)).toBe('12歳');
  });

  it('享年は数え方によらず、亡くなった時点の満年齢', () => {
    expect(ageLabel(dead('1930-04-02', '2005-11-18'), today)).toBe('享年75');
    expect(ageLabel(dead('1930-04-02', '2005-11-18'), today, 'exact')).toBe('享年75');
  });

  it('没後は享年で表す', () => {
    expect(ageLabel(dead('1930-04-02', '2005-11-18'), today)).toBe('享年75');
    expect(ageLabel(dead('1899', '1962'), today)).toBe('享年63');
  });

  it('生年が分からなければ何も出さない', () => {
    expect(ageLabel(living(null), today)).toBe('');
    expect(ageLabel(dead(null, '2000-01-01'), today)).toBe('');
  });

  it('没年が分からない故人は何も出さない', () => {
    expect(ageLabel(dead('1930-01-01', null), today)).toBe('');
  });
});

describe('ageInYears', () => {
  const today = new Date('2026-08-13T00:00:00Z');

  it('満年齢を数値で返す', () => {
    expect(ageInYears({ birthDate: '1960-05-15', deathDate: null, isLiving: true }, today)).toBe(
      66,
    );
  });

  it('求められなければ null', () => {
    expect(ageInYears({ birthDate: null, deathDate: null, isLiving: true }, today)).toBeNull();
    expect(ageInYears({ birthDate: '1930', deathDate: null, isLiving: false }, today)).toBeNull();
  });
});

describe('birthDateFromAge', () => {
  const today = new Date('2026-08-13T00:00:00Z');
  const living = (birthDate: string | null = null) => ({
    birthDate,
    deathDate: null,
    isLiving: true,
  });
  const dead = (deathDate: string | null, birthDate: string | null = null) => ({
    birthDate,
    deathDate,
    isLiving: false,
  });

  it('存命の年齢から生まれ年を出す', () => {
    // 月日が分からないので年だけの曖昧な日付になる
    expect(birthDateFromAge(87, living(), today)).toBe('1939');
    expect(birthDateFromAge(0, living(), today)).toBe('2026');
  });

  it('故人は没年から逆算する', () => {
    expect(birthDateFromAge(75, dead('2005-11-18'), today)).toBe('1930');
    expect(birthDateFromAge(63, dead('1962'), today)).toBe('1899');
  });

  it('月日が分かっていれば、誕生日を迎えたかを踏まえて年を決める', () => {
    // 基準日は8/13。12/1生まれはまだ誕生日が来ていないので1年戻す
    expect(birthDateFromAge(87, living('1900-12-01'), today)).toBe('1938-12-01');
    // 3/1生まれは誕生日を過ぎている
    expect(birthDateFromAge(87, living('1900-03-01'), today)).toBe('1939-03-01');
    // 同月で日がまだ来ていない場合と、当日の場合
    expect(birthDateFromAge(87, living('1900-08-14'), today)).toBe('1938-08-14');
    expect(birthDateFromAge(87, living('1900-08-13'), today)).toBe('1939-08-13');
  });

  it('入れた年齢どおりに読み戻せる', () => {
    for (const age of [0, 1, 37, 87, 120]) {
      const withDay = birthDateFromAge(age, living('1900-12-01'), today);
      expect(ageInYears({ birthDate: withDay, deathDate: null, isLiving: true }, today)).toBe(age);

      const yearOnly = birthDateFromAge(age, living(), today);
      expect(ageInYears({ birthDate: yearOnly, deathDate: null, isLiving: true }, today)).toBe(age);
    }
  });

  it('没年が分からない故人は逆算できない', () => {
    expect(birthDateFromAge(75, dead(null), today)).toBeNull();
  });

  it('ありえない年齢は受け付けない', () => {
    expect(birthDateFromAge(-1, living(), today)).toBeNull();
    expect(birthDateFromAge(151, living(), today)).toBeNull();
    expect(birthDateFromAge(1.5, living(), today)).toBeNull();
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
