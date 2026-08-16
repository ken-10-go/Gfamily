import { PARENT_KIND_LABELS, type ParentKind } from '@/types/models';

/**
 * 親子の種別を選ぶ欄。
 *
 * 戸籍では実子と養子の区別が重要で、家系図でも線を描き分ける
 * （実子は実線、縁組は破線）。既定は実子。
 */
export function ParentKindSelect({
  value,
  onChange,
  label = '親子の種別',
}: {
  value: ParentKind;
  onChange: (next: ParentKind) => void;
  label?: string;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as ParentKind)}>
        {Object.entries(PARENT_KIND_LABELS).map(([kind, text]) => (
          <option key={kind} value={kind}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
