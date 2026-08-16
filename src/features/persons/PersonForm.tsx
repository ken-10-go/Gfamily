import { useState, type FormEvent, type ReactNode } from 'react';

import { AgeInput } from '@/features/persons/AgeInput';
import { JapaneseDateInput } from '@/features/persons/JapaneseDateInput';
import {
  BIRTH_ORDER_OPTIONS,
  EMPTY_PERSON_INPUT,
  GENDER_LABELS,
  SURNAME_CHANGE_REASON_LABELS,
  type Gender,
  type Person,
  type PersonInput,
  type SurnameChangeReason,
  type SurnameRecord,
} from '@/types/models';

interface PersonFormProps {
  initial?: Person;
  submitLabel: string;
  /** 親族として追加するときに、関係元の姓をあらかじめ入れておく。 */
  defaultFamilyName?: string | null;
  /** 姓と同じく、せいのふりがなも引き継ぐ。 */
  defaultFamilyNameKana?: string | null;
  /** 関係から推測できる性別の初期選択。ユーザーはいつでも変えられる。 */
  defaultGender?: Gender;
  /** 自動で導いた続柄。手動指定が空のときの目安として表示する。 */
  derivedBirthOrder?: string | null;
  /** 人物の項目より前に差し込む欄。親の選択など、関係づけの指定に使う。 */
  extraFields?: ReactNode;
  onSubmit: (input: PersonInput) => Promise<void>;
  onCancel: () => void;
}

export function PersonForm({
  initial,
  submitLabel,
  defaultFamilyName,
  defaultFamilyNameKana,
  defaultGender,
  derivedBirthOrder,
  extraFields,
  onSubmit,
  onCancel,
}: PersonFormProps) {
  const [input, setInput] = useState<PersonInput>(() =>
    initial
      ? {
          familyName: initial.familyName ?? '',
          givenName: initial.givenName ?? '',
          familyNameKana: initial.familyNameKana ?? '',
          givenNameKana: initial.givenNameKana ?? '',
          maidenName: initial.maidenName ?? '',
          gender: initial.gender,
          birthDate: initial.birthDate ?? '',
          deathDate: initial.deathDate ?? '',
          birthPlace: initial.birthPlace ?? '',
          note: initial.note ?? '',
          isLiving: initial.isLiving,
          birthOrder: initial.birthOrder ?? '',
          surnameHistory: initial.surnameHistory ?? [],
        }
      : {
          ...EMPTY_PERSON_INPUT,
          familyName: defaultFamilyName ?? '',
          familyNameKana: defaultFamilyNameKana ?? '',
          gender: defaultGender ?? EMPTY_PERSON_INPUT.gender,
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof PersonInput>(key: K, value: PersonInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function updateSurname(index: number, patch: Partial<SurnameRecord>) {
    setInput((current) => ({
      ...current,
      surnameHistory: (current.surnameHistory ?? []).map((record, i) =>
        i === index ? { ...record, ...patch } : record,
      ),
    }));
  }

  function addSurname() {
    setInput((current) => ({
      ...current,
      surnameHistory: [
        ...(current.surnameHistory ?? []),
        {
          // 1件目は出生時の姓とみなすのが自然なので、既定の理由を出生にする
          familyName: (current.surnameHistory ?? []).length === 0 ? (current.familyName ?? '') : '',
          date: null,
          reason: (current.surnameHistory ?? []).length === 0 ? 'birth' : 'marriage',
          note: null,
        },
      ],
    }));
  }

  function removeSurname(index: number) {
    setInput((current) => ({
      ...current,
      surnameHistory: (current.surnameHistory ?? []).filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!input.familyName?.trim() && !input.givenName?.trim()) {
      setError('姓か名のどちらかは入力してください');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await onSubmit(input);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  const surnameHistory = input.surnameHistory ?? [];

  return (
    <form onSubmit={handleSubmit} className="form">
      {extraFields}

      <div className="form__row">
        <label className="field">
          <span className="field__label">姓</span>
          <input
            type="text"
            value={input.familyName ?? ''}
            onChange={(event) => update('familyName', event.target.value)}
            maxLength={100}
          />
        </label>
        <label className="field">
          <span className="field__label">名</span>
          <input
            type="text"
            value={input.givenName ?? ''}
            onChange={(event) => update('givenName', event.target.value)}
            maxLength={100}
          />
        </label>
      </div>

      <div className="form__row">
        <label className="field">
          <span className="field__label">せい（ふりがな）</span>
          <input
            type="text"
            value={input.familyNameKana ?? ''}
            onChange={(event) => update('familyNameKana', event.target.value)}
            maxLength={100}
          />
        </label>
        <label className="field">
          <span className="field__label">めい（ふりがな）</span>
          <input
            type="text"
            value={input.givenNameKana ?? ''}
            onChange={(event) => update('givenNameKana', event.target.value)}
            maxLength={100}
          />
        </label>
      </div>

      <div className="form__row">
        <label className="field">
          <span className="field__label">旧姓</span>
          <input
            type="text"
            value={input.maidenName ?? ''}
            onChange={(event) => update('maidenName', event.target.value)}
            maxLength={100}
          />
        </label>
        <label className="field">
          <span className="field__label">性別</span>
          <select
            value={input.gender}
            onChange={(event) => update('gender', event.target.value as Gender)}
          >
            {Object.entries(GENDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field__label">続柄</span>
        <select
          value={input.birthOrder ?? ''}
          onChange={(event) => update('birthOrder', event.target.value)}
        >
          <option value="">
            {derivedBirthOrder ? `自動（${derivedBirthOrder}）` : '自動（生年から判定）'}
          </option>
          {/* 既存データが選択肢に無い表記でも失わないよう、その値を先頭に足す */}
          {input.birthOrder && !BIRTH_ORDER_OPTIONS.includes(input.birthOrder) && (
            <option value={input.birthOrder}>{input.birthOrder}</option>
          )}
          {BIRTH_ORDER_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={input.isLiving}
          onChange={(event) => update('isLiving', event.target.checked)}
        />
        <span>存命</span>
      </label>

      {/* 没年月日を先に置く。享年から生年を逆算するときの基準になるため */}
      {!input.isLiving && (
        <JapaneseDateInput
          label="没年月日"
          value={input.deathDate ?? ''}
          onChange={(value) => update('deathDate', value)}
        />
      )}

      <JapaneseDateInput
        label="生年月日"
        value={input.birthDate ?? ''}
        onChange={(value) => update('birthDate', value)}
      />

      <AgeInput
        birthDate={input.birthDate ?? ''}
        deathDate={input.deathDate ?? ''}
        isLiving={input.isLiving}
        onChangeBirthDate={(value) => update('birthDate', value)}
      />

      <label className="field">
        <span className="field__label">出生地</span>
        <input
          type="text"
          value={input.birthPlace ?? ''}
          onChange={(event) => update('birthPlace', event.target.value)}
          maxLength={200}
        />
      </label>

      <fieldset className="surname-history">
        <legend className="field__label">改姓の履歴</legend>
        <p className="note">
          婚姻・養子縁組・分家などで姓が変わった経過を、古い順に登録します。
        </p>

        {surnameHistory.map((record, index) => (
          <div key={index} className="surname-history__row">
            <input
              type="text"
              value={record.familyName}
              onChange={(event) => updateSurname(index, { familyName: event.target.value })}
              placeholder="姓"
              aria-label={`${index + 1}件目の姓`}
              maxLength={100}
            />
            <select
              value={record.reason}
              onChange={(event) =>
                updateSurname(index, { reason: event.target.value as SurnameChangeReason })
              }
              aria-label={`${index + 1}件目の理由`}
            >
              {Object.entries(SURNAME_CHANGE_REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button"
              onClick={() => removeSurname(index)}
              aria-label={`${index + 1}件目を削除`}
            >
              ×
            </button>
            <JapaneseDateInput
              label="時期"
              value={record.date ?? ''}
              onChange={(value) => updateSurname(index, { date: value || null })}
            />
          </div>
        ))}

        <button type="button" className="button" onClick={addSurname}>
          改姓を追加
        </button>
      </fieldset>

      <label className="field">
        <span className="field__label">メモ・エピソード</span>
        <textarea
          value={input.note ?? ''}
          onChange={(event) => update('note', event.target.value)}
          rows={3}
          maxLength={4000}
        />
      </label>

      {error && <p className="alert alert--error">{error}</p>}

      <div className="form__actions">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? '保存中…' : submitLabel}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
