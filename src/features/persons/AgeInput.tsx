import { useEffect, useState } from 'react';

import { ageInYears, birthDateFromAge, formatWithEra } from '@/lib/japanese-date';

interface AgeInputProps {
  /** 生年月日（`YYYY` / `YYYY-MM` / `YYYY-MM-DD`）。未入力は空文字。 */
  birthDate: string;
  deathDate: string;
  isLiving: boolean;
  onChangeBirthDate: (value: string) => void;
}

/**
 * 年齢から生年を逆算する入力欄。
 *
 * 戸籍や親族への聞き取りでは「今 87歳」「享年75」しか分からないことがある。
 * 生年月日から年齢を出すのと同じ関係を逆向きにも使えるようにして、
 * 分かっているほうを入れれば済むようにする。
 */
export function AgeInput({ birthDate, deathDate, isLiving, onChangeBirthDate }: AgeInputProps) {
  const person = { birthDate: birthDate || null, deathDate: deathDate || null, isLiving };
  const derived = ageInYears(person);

  // 入力途中（空欄や桁の増減）を保持したいので、表示用の値は自前で持つ
  const [draft, setDraft] = useState(derived === null ? '' : String(derived));

  // 生年月日が別の場所から変わったら、こちらの表示も合わせる
  useEffect(() => {
    setDraft(derived === null ? '' : String(derived));
  }, [derived]);

  // 故人で没年が分からないと、何年前を基準にすればよいか決められない
  const disabled = !isLiving && !deathDate;
  const label = isLiving ? '年齢から生年を入れる' : '享年から生年を入れる';

  function handleChange(value: string) {
    setDraft(value);
    if (value === '') return;

    const age = Number(value);
    const next = birthDateFromAge(age, person);
    if (next) onChangeBirthDate(next);
  }

  return (
    <div className="age-input">
      <label className="field">
        <span className="field__label">{label}</span>
        <span className="age-input__row">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={150}
            value={draft}
            disabled={disabled}
            onChange={(event) => handleChange(event.target.value)}
            aria-label={label}
          />
          <span className="date-input__unit">{isLiving ? '歳' : '歳（享年）'}</span>
        </span>
      </label>

      <p className="note">
        {disabled
          ? '没年月日を先に入れると、享年から生年を計算できます。'
          : birthDate
            ? `生年月日は ${formatWithEra(birthDate)} になります。`
            : '月日が分からなければ年齢だけで構いません。生まれ年を計算します。'}
      </p>
    </div>
  );
}
