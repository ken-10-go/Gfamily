import { useState, type FormEvent } from 'react';

import { JapaneseDateInput } from '@/features/persons/JapaneseDateInput';
import { ParentKindSelect } from '@/features/persons/ParentKindSelect';
import { EMPTY_PERSON_INPUT, type ParentKind, type PersonInput } from '@/types/models';

/** 両親の入力結果。名前を入れなかった側は null になる。 */
export interface ParentsDraft {
  father: PersonInput | null;
  mother: PersonInput | null;
  /** 2人とも入力したとき、夫婦としてもつなぐか。 */
  marry: boolean;
  /** 子から見た親子の種別（実親・養親など）。 */
  kind: ParentKind;
}

interface ParentsFormProps {
  /** 子の姓。父母の姓の初期値にする。 */
  defaultFamilyName?: string | null;
  /** 子の姓の読み。姓と同じく引き継ぐ。 */
  defaultFamilyNameKana?: string | null;
  onSubmit: (draft: ParentsDraft) => Promise<void>;
  onCancel: () => void;
}

interface ParentDraft {
  familyName: string;
  givenName: string;
  familyNameKana: string;
  givenNameKana: string;
  maidenName: string;
  birthDate: string;
  isLiving: boolean;
}

const EMPTY_PARENT: ParentDraft = {
  familyName: '',
  givenName: '',
  familyNameKana: '',
  givenNameKana: '',
  maidenName: '',
  birthDate: '',
  isLiving: true,
};

const named = (draft: ParentDraft) => Boolean(draft.familyName.trim() || draft.givenName.trim());

/**
 * 父と母をまとめて登録する。
 *
 * 親を1人ずつ追加すると「フォームを開く → 保存 → もう一度開く → 夫婦としてつなぐ」の
 * 3手が要る。両親はほぼ必ず2人まとめて分かるので、1回の入力で済ませられるようにする。
 *
 * 詳しい項目（出生地・改姓の履歴・メモ）はここには置かない。
 * まず2人を家系図に載せることを優先し、細部はあとから人物の編集で足してもらう。
 */
export function ParentsForm({
  defaultFamilyName,
  defaultFamilyNameKana,
  onSubmit,
  onCancel,
}: ParentsFormProps) {
  // 子の姓とその読みを引き継ぐ。同じ姓を2回打ち直さずに済む
  const inherited = {
    ...EMPTY_PARENT,
    familyName: defaultFamilyName ?? '',
    familyNameKana: defaultFamilyNameKana ?? '',
  };
  const [father, setFather] = useState<ParentDraft>(inherited);
  const [mother, setMother] = useState<ParentDraft>(inherited);
  const [marry, setMarry] = useState(true);
  const [kind, setKind] = useState<ParentKind>('biological');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!named(father) && !named(mother)) {
      setError('父か母のどちらかは名前を入力してください');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        father: named(father) ? toInput(father, 'male') : null,
        mother: named(mother) ? toInput(mother, 'female') : null,
        marry,
        kind,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <p className="note">
        名前を入れた側だけを登録します。片方が分からないときは空のままで構いません。
      </p>

      <ParentFields legend="父" value={father} onChange={setFather} />
      <ParentFields legend="母" value={mother} onChange={setMother} showMaidenName />

      <ParentKindSelect
        value={kind}
        onChange={setKind}
        label="この子から見た続柄（実親・養親など）"
      />

      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={marry}
          onChange={(event) => setMarry(event.target.checked)}
          disabled={!named(father) || !named(mother)}
        />
        <span>2人を夫婦としてつなぐ</span>
      </label>

      {error && <p className="alert alert--error">{error}</p>}

      <div className="form__actions">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? '保存中…' : '追加'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}

function ParentFields({
  legend,
  value,
  onChange,
  showMaidenName = false,
}: {
  legend: string;
  value: ParentDraft;
  onChange: (next: ParentDraft) => void;
  showMaidenName?: boolean;
}) {
  const update = <K extends keyof ParentDraft>(key: K, next: ParentDraft[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <fieldset className="parents__group">
      <legend className="field__label">{legend}</legend>

      <div className="form__row">
        <label className="field">
          <span className="field__label">姓</span>
          <input
            type="text"
            value={value.familyName}
            onChange={(event) => update('familyName', event.target.value)}
            maxLength={100}
          />
        </label>
        <label className="field">
          <span className="field__label">名</span>
          <input
            type="text"
            value={value.givenName}
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
            value={value.familyNameKana}
            onChange={(event) => update('familyNameKana', event.target.value)}
            maxLength={100}
          />
        </label>
        <label className="field">
          <span className="field__label">めい（ふりがな）</span>
          <input
            type="text"
            value={value.givenNameKana}
            onChange={(event) => update('givenNameKana', event.target.value)}
            maxLength={100}
          />
        </label>
        {showMaidenName && (
          <label className="field">
            <span className="field__label">旧姓</span>
            <input
              type="text"
              value={value.maidenName}
              onChange={(event) => update('maidenName', event.target.value)}
              maxLength={100}
            />
          </label>
        )}
      </div>

      <JapaneseDateInput
        label="生年月日"
        value={value.birthDate}
        onChange={(next) => update('birthDate', next)}
      />

      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={value.isLiving}
          onChange={(event) => update('isLiving', event.target.checked)}
        />
        <span>存命</span>
      </label>
    </fieldset>
  );
}

function toInput(draft: ParentDraft, gender: 'male' | 'female'): PersonInput {
  return {
    ...EMPTY_PERSON_INPUT,
    familyName: draft.familyName,
    familyNameKana: draft.familyNameKana,
    givenName: draft.givenName,
    givenNameKana: draft.givenNameKana,
    maidenName: draft.maidenName,
    gender,
    birthDate: draft.birthDate,
    isLiving: draft.isLiving,
  };
}
