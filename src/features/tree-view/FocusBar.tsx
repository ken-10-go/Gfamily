import { FOCUS_GENERATION_CHOICES, type FocusOptions } from '@/features/tree-view/focus';
import { compareForDisplay } from '@/lib/relations';
import { displayName, lifespanLabel, type Person } from '@/types/models';

/** フォーカスの状態。centerId が空なら絞り込みをしていない。 */
export interface FocusState extends FocusOptions {
  centerId: string;
}

interface FocusBarProps {
  persons: Person[];
  value: FocusState;
  onChange: (next: FocusState) => void;
  /** 絞り込みをやめて全体に戻す。 */
  onClear: () => void;
}

/**
 * 中心人物と世代数を選ぶ操作列。ヘッダーの下に開く。
 *
 * 大きな家系図では画面に入り切らないので、見たい範囲だけを切り出して表示する。
 * 表示の絞り込みであってデータは変わらないため、保存はしない。
 */
export function FocusBar({ persons, value, onChange, onClear }: FocusBarProps) {
  const options = [...persons].sort(compareForDisplay);

  return (
    <div className="tree-page__focus">
      <label className="focus__field focus__field--grow">
        <span className="focus__label">中心</span>
        <select
          value={value.centerId}
          onChange={(event) => onChange({ ...value, centerId: event.target.value })}
          aria-label="フォーカスの中心人物"
        >
          <option value="">絞り込まない（全体）</option>
          {options.map((person) => (
            <option key={person.id} value={person.id}>
              {displayName(person)}
              {lifespanLabel(person) ? `（${lifespanLabel(person)}）` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="focus__field">
        <span className="focus__label">上へ</span>
        <select
          value={value.ancestors}
          onChange={(event) => onChange({ ...value, ancestors: Number(event.target.value) })}
          aria-label="上の世代数"
        >
          {FOCUS_GENERATION_CHOICES.map((count) => (
            <option key={count} value={count}>
              {count}世代
            </option>
          ))}
        </select>
      </label>

      <label className="focus__field">
        <span className="focus__label">下へ</span>
        <select
          value={value.descendants}
          onChange={(event) => onChange({ ...value, descendants: Number(event.target.value) })}
          aria-label="下の世代数"
        >
          {FOCUS_GENERATION_CHOICES.map((count) => (
            <option key={count} value={count}>
              {count}世代
            </option>
          ))}
        </select>
      </label>

      <label className="focus__field focus__field--checkbox">
        <input
          type="checkbox"
          checked={value.includeSpouses}
          onChange={(event) => onChange({ ...value, includeSpouses: event.target.checked })}
        />
        <span>配偶者も表示</span>
      </label>

      <button type="button" className="button" onClick={onClear} disabled={!value.centerId}>
        解除
      </button>

      {value.centerId && (
        <p className="note focus__note">
          絞り込み中は自動配置で表示し、カードの移動はできません。手で置いた位置は
          そのまま保存されていて、解除すると元どおりに並びます。
        </p>
      )}
    </div>
  );
}
