/**
 * 和暦と、日付の一部しか分からない場合（曖昧な日付）の取り扱い。
 *
 * 古い戸籍謄本を読みながら入力する場面を想定している。
 *   * 「明治32年」までしか分からない、といった精度の欠けた日付を保持できる
 *   * 和暦と西暦を相互に変換し、画面では併記する
 *
 * 保存形式は `YYYY` / `YYYY-MM` / `YYYY-MM-DD` の文字列。
 * 文字列のまま比較しても古い順に並ぶため、並び替えは単純な比較で足りる。
 */

export interface EraDefinition {
  name: string;
  /** その元号が始まった日（グレゴリオ暦） */
  start: string;
}

/**
 * 元号の開始日。改元日は新しい元号に属するものとして扱う。
 * 例: 1912-07-29 は明治45年、1912-07-30 は大正元年。
 *
 * 明治は改暦の事情で開始日の扱いに諸説あるが、
 * グレゴリオ暦での明治元年9月8日にあたる 1868-10-23 を採用している。
 */
export const ERAS: EraDefinition[] = [
  { name: '明治', start: '1868-10-23' },
  { name: '大正', start: '1912-07-30' },
  { name: '昭和', start: '1926-12-25' },
  { name: '平成', start: '1989-01-08' },
  { name: '令和', start: '2019-05-01' },
];

export type DatePrecision = 'day' | 'month' | 'year';

export interface PartialDate {
  year: number;
  month?: number;
  day?: number;
  precision: DatePrecision;
}

export interface EraDate {
  era: string;
  /** 元号内の年。1 は元年。 */
  year: number;
}

const DATE_PATTERN = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

/** 保存形式の文字列を解釈する。解釈できなければ null。 */
export function parsePartialDate(value: string | null | undefined): PartialDate | null {
  if (!value) return null;

  const matched = DATE_PATTERN.exec(value.trim());
  if (!matched) return null;

  const [, yearText, monthText, dayText] = matched;
  const year = Number(yearText);
  const month = monthText ? Number(monthText) : undefined;
  const day = dayText ? Number(dayText) : undefined;

  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (day !== undefined && (day < 1 || day > daysInMonth(year, month as number))) return null;
  // 日が分かっているのに月が分からない、という状態は許さない
  if (day !== undefined && month === undefined) return null;

  return {
    year,
    month,
    day,
    precision: day !== undefined ? 'day' : month !== undefined ? 'month' : 'year',
  };
}

/** 年・月・日から保存形式の文字列を組み立てる。 */
export function toPartialDateString(
  year: number,
  month?: number | null,
  day?: number | null,
): string {
  const yearText = String(year).padStart(4, '0');
  if (!month) return yearText;

  const monthText = String(month).padStart(2, '0');
  if (!day) return `${yearText}-${monthText}`;

  return `${yearText}-${monthText}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 日付を数値に潰して比較しやすくする。月日が不明な場合はその年の最初として扱う。 */
function comparableValue(date: PartialDate): number {
  return date.year * 10000 + (date.month ?? 1) * 100 + (date.day ?? 1);
}

/**
 * その日が属する元号を求める。
 *
 * 年しか分からず、その年に改元がある場合は、候補が2つ返る。
 * 例: 1926年 は「大正15年」と「昭和元年」の両方でありうる。
 */
export function toEraDates(value: string | null | undefined): EraDate[] {
  const date = parsePartialDate(value);
  if (!date) return [];

  const candidates = ERAS.filter((era) => {
    const start = parsePartialDate(era.start);
    if (!start) return false;

    if (date.precision === 'year') {
      // 年しか分からないときは、その年に少しでも重なる元号をすべて拾う
      const eraEndYear = nextEraStartYear(era.name);
      return date.year >= start.year && (eraEndYear === null || date.year <= eraEndYear);
    }

    return comparableValue(date) >= comparableValue(start) && isBeforeNextEra(era.name, date);
  });

  return candidates.map((era) => {
    const start = parsePartialDate(era.start) as PartialDate;
    return { era: era.name, year: date.year - start.year + 1 };
  });
}

function nextEraStartYear(eraName: string): number | null {
  const index = ERAS.findIndex((era) => era.name === eraName);
  const next = ERAS[index + 1];
  if (!next) return null;
  return (parsePartialDate(next.start) as PartialDate).year;
}

function isBeforeNextEra(eraName: string, date: PartialDate): boolean {
  const index = ERAS.findIndex((era) => era.name === eraName);
  const next = ERAS[index + 1];
  if (!next) return true;

  const nextStart = parsePartialDate(next.start) as PartialDate;
  return comparableValue(date) < comparableValue(nextStart);
}

/** 和暦の年を「元年」「10年」のように表す。 */
export function formatEraYear(eraYear: number): string {
  return eraYear === 1 ? '元年' : `${eraYear}年`;
}

/** 和暦だけの表記。「昭和10年」「大正15年・昭和元年」 */
export function formatEra(value: string | null | undefined): string {
  const eraDates = toEraDates(value);
  if (eraDates.length === 0) return '';
  return eraDates.map((entry) => `${entry.era}${formatEraYear(entry.year)}`).join('・');
}

/** 西暦だけの表記。「1935年5月15日」「1935年5月」「1935年」 */
export function formatGregorian(value: string | null | undefined): string {
  const date = parsePartialDate(value);
  if (!date) return '';

  let text = `${date.year}年`;
  if (date.month !== undefined) text += `${date.month}月`;
  if (date.day !== undefined) text += `${date.day}日`;
  return text;
}

/**
 * 画面表示用の併記。「1935年（昭和10年）5月15日」
 * 明治より前など元号が求まらない場合は西暦だけを返す。
 */
export function formatWithEra(value: string | null | undefined): string {
  const date = parsePartialDate(value);
  if (!date) return '';

  const era = formatEra(value);
  const head = era ? `${date.year}年（${era}）` : `${date.year}年`;

  let tail = '';
  if (date.month !== undefined) tail += `${date.month}月`;
  if (date.day !== undefined) tail += `${date.day}日`;

  return head + tail;
}

/** 和暦から西暦の年を求める。範囲外なら null。 */
export function eraYearToGregorian(eraName: string, eraYear: number): number | null {
  const era = ERAS.find((entry) => entry.name === eraName);
  if (!era || eraYear < 1) return null;

  const start = parsePartialDate(era.start) as PartialDate;
  const year = start.year + eraYear - 1;

  // その元号に存在しない年（昭和65年など）は受け付けない
  const lastYear = lastYearOf(eraName);
  if (lastYear !== null && year > lastYear) return null;

  return year;
}

/** その元号が始まった西暦の年。知らない元号なら null。 */
export function eraStartYear(eraName: string): number | null {
  const era = ERAS.find((entry) => entry.name === eraName);
  if (!era) return null;
  return (parsePartialDate(era.start) as PartialDate).year;
}

/** その元号の最終年（西暦）。現行の元号は null。 */
export function lastYearOf(eraName: string): number | null {
  const index = ERAS.findIndex((era) => era.name === eraName);
  const next = ERAS[index + 1];
  if (!next) return null;
  return (parsePartialDate(next.start) as PartialDate).year;
}

/** その元号で指定できる最大の年（元年からの通し）。現行の元号は今年まで。 */
export function maxEraYear(eraName: string, today = new Date()): number {
  const era = ERAS.find((entry) => entry.name === eraName);
  if (!era) return 1;

  const start = parsePartialDate(era.start) as PartialDate;
  const last = lastYearOf(eraName) ?? today.getFullYear();
  return last - start.year + 1;
}

/** 和暦の年月日から保存形式の文字列へ。 */
export function fromEra(
  eraName: string,
  eraYear: number,
  month?: number | null,
  day?: number | null,
): string | null {
  const year = eraYearToGregorian(eraName, eraYear);
  if (year === null) return null;
  return toPartialDateString(year, month, day);
}

/** 生没年の表記に使う年だけの取り出し。 */
export function yearOf(value: string | null | undefined): number | null {
  return parsePartialDate(value)?.year ?? null;
}

/** 誕生日を迎えているかを見て満年齢を出す。月日が不明な部分は迎えていない扱いにしない。 */
function fullYearsBetween(from: PartialDate, to: PartialDate): number {
  let years = to.year - from.year;

  if (from.month !== undefined && to.month !== undefined) {
    if (to.month < from.month) {
      years -= 1;
    } else if (to.month === from.month && from.day !== undefined && to.day !== undefined) {
      if (to.day < from.day) years -= 1;
    }
  }

  return years;
}

/**
 * 年齢の表示。存命なら「◯歳」、没後は「享年◯」。
 *
 * 月日まで分からない日付では1歳ずれることがあるため「約」を付ける。
 * 古い戸籍では年しか分からないことが多く、断定しないほうが誠実。
 */
export function ageLabel(
  person: { birthDate: string | null; deathDate: string | null; isLiving: boolean },
  today = new Date(),
): string {
  const birth = parsePartialDate(person.birthDate);
  if (!birth) return '';

  const end = person.isLiving
    ? {
        year: today.getFullYear(),
        month: today.getMonth() + 1,
        day: today.getDate(),
        precision: 'day' as DatePrecision,
      }
    : parsePartialDate(person.deathDate);

  if (!end) return '';

  const years = fullYearsBetween(birth, end);
  if (years < 0) return '';

  // どちらかの精度が日まで揃っていなければ、年齢は前後しうる
  const exact = birth.precision === 'day' && end.precision === 'day';
  const prefix = exact ? '' : '約';

  return person.isLiving ? `${prefix}${years}歳` : `享年${prefix}${years}`;
}
