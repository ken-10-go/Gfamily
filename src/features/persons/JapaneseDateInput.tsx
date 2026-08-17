import { useState, type ReactNode } from 'react';

import type { EraDate } from '@/types/models';
import {
  ERAS,
  eraStartYear,
  eraYearToGregorian,
  formatWithEra,
  maxEraYear,
  parsePartialDate,
  toEraDates,
  toPartialDateString,
} from '@/lib/japanese-date';

interface JapaneseDateInputProps {
  label: string;
  /** `YYYY` / `YYYY-MM` / `YYYY-MM-DD` のいずれか。未入力は空文字。 */
  value: string;
  /**
   * 変更の通知。era は和暦で入力されたときの生データで、西暦入力なら null。
   * 旧暦の月日は西暦に直せないので、入力そのものを残したい側だけが受け取る。
   */
  onChange: (value: string, era: EraDate | null) => void;
  /**
   * 日付の行の右端に差し込む要素。
   * 「はっきりしない」のような、その日付にだけ関わる指定をここへ置いて行数を減らす。
   */
  trailing?: ReactNode;
}

const GREGORIAN = '西暦';

/**
 * 和暦・西暦のどちらでも入力できる日付欄。
 *
 * 古い戸籍では「明治32年」までしか分からないことが多いため、
 * 月・日は空のままでも登録できる。入力中は西暦と和暦を併記して確認できる。
 *
 * どの元号で入力するかは利用者の選択なので、値から逆算せず状態として持つ。
 * 逆算にすると、値が空のあいだ元号の選択を保持できない。
 */
export function JapaneseDateInput({ label, value, onChange, trailing }: JapaneseDateInputProps) {
  const parsed = parsePartialDate(value);
  const [era, setEra] = useState<string>(() => toEraDates(value)[0]?.era ?? GREGORIAN);

  /** 選択中の元号で表示すべき年。範囲外なら空にする。 */
  const displayedYear = (() => {
    if (!parsed) return '';
    if (era === GREGORIAN) return parsed.year;

    const start = eraStartYear(era);
    if (start === null) return '';

    const eraYear = parsed.year - start + 1;
    return eraYear >= 1 && eraYear <= maxEraYear(era) ? eraYear : '';
  })();

  function emit(year: number | '', month: number | '', day: number | '') {
    if (year === '') {
      onChange('', null);
      return;
    }

    const gregorianYear = era === GREGORIAN ? year : eraYearToGregorian(era, year);
    // その元号に存在しない年（昭和65年など）は取り込まず、入力を続けさせる
    if (gregorianYear === null) return;

    // 和暦で入れたときは、戸籍に書かれていたであろう元号・年・月日をそのまま添える
    const raw: EraDate | null =
      era === GREGORIAN
        ? null
        : { eraName: era, eraYear: year, month: month || null, day: day || null };

    onChange(toPartialDateString(gregorianYear, month || null, day || null), raw);
  }

  return (
    <fieldset className="date-input">
      <legend className="field__label">{label}</legend>

      <div className="date-input__row">
        <select
          value={era}
          onChange={(event) => setEra(event.target.value)}
          aria-label={`${label}の元号`}
        >
          <option value={GREGORIAN}>{GREGORIAN}</option>
          {ERAS.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}
            </option>
          ))}
        </select>

        <input
          type="number"
          className="date-input__year"
          value={displayedYear}
          min={1}
          max={era === GREGORIAN ? 2200 : maxEraYear(era)}
          placeholder="年"
          aria-label={`${label}の年`}
          onChange={(event) => {
            const year = event.target.value === '' ? '' : Number(event.target.value);
            emit(year, parsed?.month ?? '', parsed?.day ?? '');
          }}
        />
        <span className="date-input__unit">年</span>

        <select
          className="date-input__part"
          value={parsed?.month ?? ''}
          aria-label={`${label}の月`}
          disabled={!parsed}
          onChange={(event) => {
            const month = event.target.value === '' ? '' : Number(event.target.value);
            // 月を消したら日も消す（日だけ分かる状態は作らない）
            emit(displayedYear, month, month === '' ? '' : (parsed?.day ?? ''));
          }}
        >
          <option value="">不明</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
        <span className="date-input__unit">月</span>

        <select
          className="date-input__part"
          value={parsed?.day ?? ''}
          aria-label={`${label}の日`}
          disabled={!parsed?.month}
          onChange={(event) => {
            const day = event.target.value === '' ? '' : Number(event.target.value);
            emit(displayedYear, parsed?.month ?? '', day);
          }}
        >
          <option value="">不明</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        <span className="date-input__unit">日</span>

        {value && (
          <button
            type="button"
            className="icon-button"
            onClick={() => onChange('', null)}
            aria-label={`${label}を消す`}
            title="消す"
          >
            ×
          </button>
        )}

        {/* 併記は入力の確認用なので、同じ行の右端に小さく回して1行に収める */}
        <p className="date-input__preview">
          {formatWithEra(value) || '分かる範囲だけで構いません'}
        </p>

        {trailing}
      </div>
    </fieldset>
  );
}
