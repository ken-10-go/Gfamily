import { useState, type FormEvent } from 'react';

import { GENDER_LABELS, type Gender, type Person, type PersonInput } from '@/types/models';

const EMPTY: PersonInput = {
  family_name: '',
  given_name: '',
  maiden_name: '',
  gender: 'unknown',
  birth_date: '',
  death_date: '',
  birth_place: '',
  note: '',
  is_living: true,
};

interface PersonFormProps {
  initial?: Person;
  submitLabel: string;
  onSubmit: (input: PersonInput) => Promise<void>;
  onCancel: () => void;
}

export function PersonForm({ initial, submitLabel, onSubmit, onCancel }: PersonFormProps) {
  const [input, setInput] = useState<PersonInput>(() =>
    initial
      ? {
          family_name: initial.family_name ?? '',
          given_name: initial.given_name ?? '',
          maiden_name: initial.maiden_name ?? '',
          gender: initial.gender,
          birth_date: initial.birth_date ?? '',
          death_date: initial.death_date ?? '',
          birth_place: initial.birth_place ?? '',
          note: initial.note ?? '',
          is_living: initial.is_living,
        }
      : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof PersonInput>(key: K, value: PersonInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!input.family_name?.trim() && !input.given_name?.trim()) {
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

  return (
    <form onSubmit={handleSubmit} className="form">
      <div className="form__row">
        <label className="field">
          <span className="field__label">姓</span>
          <input
            type="text"
            value={input.family_name ?? ''}
            onChange={(event) => update('family_name', event.target.value)}
            maxLength={100}
          />
        </label>
        <label className="field">
          <span className="field__label">名</span>
          <input
            type="text"
            value={input.given_name ?? ''}
            onChange={(event) => update('given_name', event.target.value)}
            maxLength={100}
          />
        </label>
      </div>

      <div className="form__row">
        <label className="field">
          <span className="field__label">旧姓</span>
          <input
            type="text"
            value={input.maiden_name ?? ''}
            onChange={(event) => update('maiden_name', event.target.value)}
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

      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={input.is_living}
          onChange={(event) => update('is_living', event.target.checked)}
        />
        <span>存命</span>
      </label>

      <div className="form__row">
        <label className="field">
          <span className="field__label">生年月日</span>
          <input
            type="date"
            value={input.birth_date ?? ''}
            onChange={(event) => update('birth_date', event.target.value)}
          />
        </label>
        {!input.is_living && (
          <label className="field">
            <span className="field__label">没年月日</span>
            <input
              type="date"
              value={input.death_date ?? ''}
              onChange={(event) => update('death_date', event.target.value)}
            />
          </label>
        )}
      </div>

      <label className="field">
        <span className="field__label">出生地</span>
        <input
          type="text"
          value={input.birth_place ?? ''}
          onChange={(event) => update('birth_place', event.target.value)}
          maxLength={200}
        />
      </label>

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
