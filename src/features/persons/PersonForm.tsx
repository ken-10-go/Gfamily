import { useState, type FormEvent } from 'react';

import { GENDER_LABELS, type Gender, type Person, type PersonInput } from '@/types/models';

const EMPTY: PersonInput = {
  familyName: '',
  givenName: '',
  maidenName: '',
  gender: 'unknown',
  birthDate: '',
  deathDate: '',
  birthPlace: '',
  note: '',
  isLiving: true,
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
          familyName: initial.familyName ?? '',
          givenName: initial.givenName ?? '',
          maidenName: initial.maidenName ?? '',
          gender: initial.gender,
          birthDate: initial.birthDate ?? '',
          deathDate: initial.deathDate ?? '',
          birthPlace: initial.birthPlace ?? '',
          note: initial.note ?? '',
          isLiving: initial.isLiving,
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

  return (
    <form onSubmit={handleSubmit} className="form">
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

      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={input.isLiving}
          onChange={(event) => update('isLiving', event.target.checked)}
        />
        <span>存命</span>
      </label>

      <div className="form__row">
        <label className="field">
          <span className="field__label">生年月日</span>
          <input
            type="date"
            value={input.birthDate ?? ''}
            onChange={(event) => update('birthDate', event.target.value)}
          />
        </label>
        {!input.isLiving && (
          <label className="field">
            <span className="field__label">没年月日</span>
            <input
              type="date"
              value={input.deathDate ?? ''}
              onChange={(event) => update('deathDate', event.target.value)}
            />
          </label>
        )}
      </div>

      <label className="field">
        <span className="field__label">出生地</span>
        <input
          type="text"
          value={input.birthPlace ?? ''}
          onChange={(event) => update('birthPlace', event.target.value)}
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
