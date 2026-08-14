import type { ViewSettings } from '@/features/tree-view/useViewSettings';

interface ViewSettingsPanelProps {
  settings: ViewSettings;
  onChange: <K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) => void;
}

/** 家系図の見た目を切り替える。設定はこの端末にツリーごとに保存される。 */
export function ViewSettingsPanel({ settings, onChange }: ViewSettingsPanelProps) {
  return (
    <div className="settings">
      <Toggle
        label="年齢を表示"
        checked={settings.showAge}
        onChange={(value) => onChange('showAge', value)}
      />
      <Toggle
        label="ふりがなを表示"
        checked={settings.showKana}
        onChange={(value) => onChange('showKana', value)}
      />
      <Toggle
        label="メモの1行目を表示"
        checked={settings.showNote}
        onChange={(value) => onChange('showNote', value)}
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
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
