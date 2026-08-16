import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { useTreeKey } from '@/features/e2ee/useTreeKey';
import { AgeInput } from '@/features/persons/AgeInput';
import { JapaneseDateInput } from '@/features/persons/JapaneseDateInput';
import { EMPTY_SENSITIVE, type SensitiveFields } from '@/lib/crypto';
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
          birthEra: initial.birthEra,
          deathEra: initial.deathEra,
          birthDateUncertain: initial.birthDateUncertain,
          deathDateUncertain: initial.deathDateUncertain,
          encryptedData: initial.encryptedData,
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

  const key = useTreeKey();
  const [sensitive, setSensitive] = useState<SensitiveFields>(EMPTY_SENSITIVE);

  // 鍵が開いたら、保存済みの暗号文をほどいて入力欄に載せる
  useEffect(() => {
    let cancelled = false;
    if (!key.unlocked || !initial?.encryptedData) return;

    void key
      .decrypt(initial.encryptedData)
      .then((fields) => {
        if (!cancelled && fields) setSensitive(fields);
      })
      .catch(() => {
        if (!cancelled) setError('機微な項目を復号できませんでした（合言葉が違います）');
      });

    return () => {
      cancelled = true;
    };
  }, [key, initial]);

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
      // 鍵があるときだけ機微項目を書き換える。無ければ既存の暗号文をそのまま残す
      const encryptedData = key.unlocked ? await key.encrypt(sensitive) : input.encryptedData;
      await onSubmit({ ...input, encryptedData: encryptedData as PersonInput['encryptedData'] });
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
        <>
          <JapaneseDateInput
            label="没年月日"
            value={input.deathDate ?? ''}
            onChange={(value, era) =>
              setInput((current) => ({ ...current, deathDate: value, deathEra: era }))
            }
          />
          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={input.deathDateUncertain}
              onChange={(event) => update('deathDateUncertain', event.target.checked)}
            />
            <span>没年ははっきりしない（「頃」として扱う）</span>
          </label>
        </>
      )}

      <JapaneseDateInput
        label="生年月日"
        value={input.birthDate ?? ''}
        onChange={(value, era) =>
          setInput((current) => ({ ...current, birthDate: value, birthEra: era }))
        }
      />

      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={input.birthDateUncertain}
          onChange={(event) => update('birthDateUncertain', event.target.checked)}
        />
        <span>生年ははっきりしない（「頃」として扱う）</span>
      </label>

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

      <SensitiveFieldset
        payload={input.encryptedData}
        value={sensitive}
        onChange={setSensitive}
      />

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

/** 機微項目の入力欄。鍵が無いときは、そこに情報があることだけを伝えて中身は伏せる。 */
function SensitiveFieldset({
  payload,
  value,
  onChange,
}: {
  /** 保存済みの暗号文。鍵が無くても「入っているか」だけは分かる */
  payload: PersonInput['encryptedData'];
  value: SensitiveFields;
  onChange: (next: SensitiveFields) => void;
}) {
  const key = useTreeKey();
  const update = (patch: Partial<SensitiveFields>) => onChange({ ...value, ...patch });

  if (!key.unlocked) {
    return (
      <fieldset className="sensitive">
        <legend className="field__label">🔒 機微な情報</legend>
        <p className="note">
          {payload
            ? '本籍地・戒名などが暗号化して保存されています。表示・編集するには、表示設定の「機微な情報の鍵」で合言葉を入れてください。'
            : '本籍地・住所・戒名・お墓・思い出は暗号化して保存します。入力するには、表示設定の「機微な情報の鍵」で合言葉を入れてください。'}
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset className="sensitive">
      <legend className="field__label">🔒 機微な情報（この端末で暗号化して保存）</legend>

      <label className="field">
        <span className="field__label">本籍地</span>
        <input
          type="text"
          value={value.honseki}
          onChange={(event) => update({ honseki: event.target.value })}
          maxLength={200}
        />
      </label>

      <label className="field">
        <span className="field__label">現住所</span>
        <input
          type="text"
          value={value.address}
          onChange={(event) => update({ address: event.target.value })}
          maxLength={200}
        />
      </label>

      <label className="field">
        <span className="field__label">戒名・法名・法号</span>
        <input
          type="text"
          value={value.kaimyo}
          onChange={(event) => update({ kaimyo: event.target.value })}
          maxLength={200}
        />
      </label>

      <label className="field">
        <span className="field__label">お墓（霊園名・区画・墓石の刻字など）</span>
        <input
          type="text"
          value={value.graveLocation}
          onChange={(event) => update({ graveLocation: event.target.value })}
          maxLength={200}
        />
      </label>

      <label className="field">
        <span className="field__label">思い出・エピソード</span>
        <textarea
          value={value.biographyNotes}
          onChange={(event) => update({ biographyNotes: event.target.value })}
          rows={3}
          maxLength={4000}
        />
      </label>
    </fieldset>
  );
}
