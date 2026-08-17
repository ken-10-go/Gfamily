import { useId, useState, type FormEvent, type ReactNode } from 'react';

import { AgeInput } from '@/features/persons/AgeInput';
import { JapaneseDateInput } from '@/features/persons/JapaneseDateInput';
import {
  BIRTH_ORDER_OPTIONS,
  EMPTY_PERSON_INPUT,
  GENDER_LABELS,
  SURNAME_CHANGE_REASON_LABELS,
  type Gender,
  type House,
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
  /**
   * 選べる家。手で登録した家だけが並ぶ（自動判定の家は登録されるまで選べない）。
   * 空なら所属の欄そのものを出さない。
   */
  houses?: House[];
  onSubmit: (input: PersonInput) => Promise<void>;
  onCancel: () => void;
  /**
   * この人物を削除する。渡されたときだけフォームの末尾に削除ボタンを出す。
   *
   * 新規追加のフォームには渡さない（まだ存在しないものは消せない）。
   * 確認や実際の削除は呼び出し側が持つ。
   */
  onDelete?: () => void;
}

/** 編集画面のタブ。戸籍の骨組みと、その周辺の情報とで分ける。 */
type FormTab = 'basic' | 'culture';

const TABS: [FormTab, string][] = [
  ['basic', '基本情報'],
  ['culture', '文化的補足'],
];

export function PersonForm({
  initial,
  submitLabel,
  defaultFamilyName,
  defaultFamilyNameKana,
  defaultGender,
  derivedBirthOrder,
  extraFields,
  houses = [],
  onSubmit,
  onCancel,
  onDelete,
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
          houseIds: initial.houseIds,
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
  const [tab, setTab] = useState<FormTab>('basic');
  // 同じ画面に複数のフォームが出ても、ラジオのグループが混ざらないようにする
  const genderName = useId();

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
      // 指摘した欄が隠れていては直しようがないので、そのタブへ戻す
      setTab('basic');
      setError('姓か名のどちらかは入力してください');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      // 機微項目はこの画面では扱わない。保存済みの暗号文はそのまま持ち越す
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

      {/*
       * 2つのタブに分ける。どちらも DOM に残したまま hidden で切り替えるので、
       * 入力の途中で行き来しても値は消えず、保存では両方まとめて送れる。
       */}
      <div className="tabs" role="tablist" aria-label="編集する項目">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${genderName}-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`${genderName}-panel-${value}`}
            className={tab === value ? 'tabs__tab tabs__tab--active' : 'tabs__tab'}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${genderName}-panel-basic`}
        aria-labelledby={`${genderName}-tab-basic`}
        hidden={tab !== 'basic'}
      >
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

        <label className="field">
          <span className="field__label">旧姓</span>
          <input
            type="text"
            value={input.maidenName ?? ''}
            onChange={(event) => update('maidenName', event.target.value)}
            maxLength={100}
          />
        </label>

        {/* 性別はラジオにする。選択肢が4つと少なく、1タップで決まるため。
            存命も同じ行に並べて、チェックだけの行を作らない */}
        <fieldset className="field field--radios form__wide">
          <legend className="field__label">性別</legend>
          {Object.entries(GENDER_LABELS).map(([value, label]) => (
            <label key={value} className="field__radio">
              <input
                type="radio"
                name={genderName}
                value={value}
                checked={input.gender === value}
                onChange={() => update('gender', value as Gender)}
              />
              <span>{label}</span>
            </label>
          ))}
          <label className="field__radio field__radio--apart">
            <input
              type="checkbox"
              checked={input.isLiving}
              onChange={(event) => update('isLiving', event.target.checked)}
            />
            <span>存命</span>
          </label>
        </fieldset>

        {/* 没年月日を先に置く。享年から生年を逆算するときの基準になるため */}
        {!input.isLiving && (
          <JapaneseDateInput
            label="没年月日"
            value={input.deathDate ?? ''}
            onChange={(value, era) =>
              setInput((current) => ({ ...current, deathDate: value, deathEra: era }))
            }
            trailing={
              <label className="date-input__flag" title="はっきりしない没年は「頃」として扱う">
                <input
                  type="checkbox"
                  checked={input.deathDateUncertain}
                  onChange={(event) => update('deathDateUncertain', event.target.checked)}
                  aria-label="没年ははっきりしない（「頃」として扱う）"
                />
                <span aria-hidden="true">頃</span>
              </label>
            }
          />
        )}

        <JapaneseDateInput
          label="生年月日"
          value={input.birthDate ?? ''}
          onChange={(value, era) =>
            setInput((current) => ({ ...current, birthDate: value, birthEra: era }))
          }
          trailing={
            <label className="date-input__flag" title="はっきりしない生年は「頃」として扱う">
              <input
                type="checkbox"
                checked={input.birthDateUncertain}
                onChange={(event) => update('birthDateUncertain', event.target.checked)}
                aria-label="生年ははっきりしない（「頃」として扱う）"
              />
              <span aria-hidden="true">頃</span>
            </label>
          }
        />

        <AgeInput
          birthDate={input.birthDate ?? ''}
          deathDate={input.deathDate ?? ''}
          isLiving={input.isLiving}
          onChangeBirthDate={(value) => update('birthDate', value)}
        />
      </div>

      <div
        role="tabpanel"
        id={`${genderName}-panel-culture`}
        aria-labelledby={`${genderName}-tab-culture`}
        hidden={tab !== 'culture'}
      >
        {houses.length > 0 && (
          <fieldset className="field field--radios form__wide">
            <legend className="field__label">属する家</legend>
            <p className="note">
              生家と婚家のように、複数の家に属してかまいません。
              先頭に選んだ家が配置のまとまりに使われます。
            </p>
            {houses.map((house) => (
              <label key={house.id} className="field__radio">
                <input
                  type="checkbox"
                  checked={(input.houseIds ?? []).includes(house.id)}
                  onChange={(event) =>
                    update(
                      'houseIds',
                      event.target.checked
                        ? [...(input.houseIds ?? []), house.id]
                        : (input.houseIds ?? []).filter((id) => id !== house.id),
                    )
                  }
                />
                <span>{house.name}</span>
              </label>
            ))}
          </fieldset>
        )}

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

        <label className="field">
          <span className="field__label">出生地</span>
          <input
            type="text"
            value={input.birthPlace ?? ''}
            onChange={(event) => update('birthPlace', event.target.value)}
            maxLength={200}
          />
        </label>

        <fieldset className="surname-history form__wide">
          <legend className="field__label">改姓の履歴</legend>
          <p className="note">婚姻・養子縁組・分家などで姓が変わった経過を、古い順に登録します。</p>

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

        <label className="field form__wide">
          <span className="field__label">メモ・エピソード</span>
          <textarea
            value={input.note ?? ''}
            onChange={(event) => update('note', event.target.value)}
            rows={3}
            maxLength={4000}
          />
        </label>
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      <div className="form__actions">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? '保存中…' : submitLabel}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>

      {/* 編集中の人物だけ。誤って押さないよう、保存の下に離して置く */}
      {onDelete && (
        <button type="button" className="button button--danger form__delete" onClick={onDelete}>
          🗑 この人物を削除する
        </button>
      )}
    </form>
  );
}
