import {
  CARD_FIELD_LABELS,
  CARD_FIELD_ORDER,
  MAX_CARD_FIELDS,
  THEME_LABELS,
  type CardField,
  type ThemeName,
  type ViewSettings,
} from '@/features/tree-view/useViewSettings';

interface ViewSettingsPanelProps {
  settings: ViewSettings;
  onChange: <K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) => void;
}

/** 家系図の見た目を切り替える。設定はこの端末にツリーごとに保存される。 */
export function ViewSettingsPanel({ settings, onChange }: ViewSettingsPanelProps) {
  /** 表示項目の入れ替え。並びは決まった順にそろえるので、選ぶ・外すだけでよい。 */
  function toggleField(field: CardField, on: boolean) {
    const next = CARD_FIELD_ORDER.filter((candidate) =>
      candidate === field ? on : settings.cardFields.includes(candidate),
    );
    onChange('cardFields', next.slice(0, MAX_CARD_FIELDS));
  }

  const full = settings.cardFields.length >= MAX_CARD_FIELDS;

  return (
    <div className="settings">
      <label className="settings__row">
        <span>配色</span>
        <select
          value={settings.theme}
          onChange={(event) => onChange('theme', event.target.value as ThemeName)}
        >
          {Object.entries(THEME_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="settings__group">
        <legend className="field__label">カードに出す項目（最大{MAX_CARD_FIELDS}行）</legend>
        <p className="note">氏名は常に表示します。ここで選んだ項目が、この順で下に並びます。</p>

        {CARD_FIELD_ORDER.map((field) => {
          const checked = settings.cardFields.includes(field);
          return (
            <label key={field} className="settings__row">
              <span>{CARD_FIELD_LABELS[field]}</span>
              <input
                type="checkbox"
                checked={checked}
                // 上限に達したら、外す操作だけを受け付ける
                disabled={!checked && full}
                onChange={(event) => toggleField(field, event.target.checked)}
              />
            </label>
          );
        })}
      </fieldset>

      <Toggle
        label="年齢を氏名の横に表示"
        checked={settings.showAge}
        onChange={(value) => onChange('showAge', value)}
      />
      <Toggle
        label="選んだ人の直系をたどって強調"
        checked={settings.highlightLineage}
        onChange={(value) => onChange('highlightLineage', value)}
      />
      <Toggle
        label="配偶者の空カードを出す（タップで追加）"
        checked={settings.showSpousePlaceholder}
        onChange={(value) => onChange('showSpousePlaceholder', value)}
      />
      <Toggle
        label="縦書きにする"
        checked={settings.vertical}
        onChange={(value) => onChange('vertical', value)}
      />

      <label className="settings__row">
        <span>姓名の順</span>
        <select
          value={settings.nameOrder}
          onChange={(event) =>
            onChange('nameOrder', event.target.value as ViewSettings['nameOrder'])
          }
        >
          <option value="family-first">姓 → 名</option>
          <option value="given-first">名 → 姓</option>
        </select>
      </label>

      <label className="settings__row">
        <span>氏名の行数</span>
        <select
          value={settings.nameLines}
          onChange={(event) =>
            onChange('nameLines', Number(event.target.value) as ViewSettings['nameLines'])
          }
        >
          <option value={1}>1行</option>
          <option value={2}>2行（姓と名で改行）</option>
        </select>
      </label>

      <label className="settings__row">
        <span>カードの大きさ</span>
        <select
          value={settings.uiSize}
          onChange={(event) => onChange('uiSize', event.target.value as ViewSettings['uiSize'])}
        >
          <option value="small">小</option>
          <option value="medium">中</option>
          <option value="large">大</option>
        </select>
      </label>

      <Toggle
        label="編集を止める（誤操作の防止）"
        checked={settings.locked}
        onChange={(value) => onChange('locked', value)}
      />

      <p className="note">この設定はこの端末にだけ保存されます。他のメンバーには影響しません。</p>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="settings__row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
