import { useState, type FormEvent } from 'react';

import { displayName, type Person } from '@/types/models';

/**
 * 段（世代の行）を数値で指定する。
 *
 * 「1つ上／下へ」だけだと、思ったところへ行かないときに何段ずれているのかが
 * 分からず、当てずっぽうで押すことになる。図の左に出している番号と同じ値を
 * ここに入れて、直接その段へ移す。
 *
 * 保存するのは「自動で決まる段からのずれ」で、ここで受け取った番号との差から出す。
 * 人物を足して自動側が動いても、指定の意味（何段ずらしたか）が保たれる。
 */
export function GenerationDialog({
  person,
  current,
  onSubmit,
  onCancel,
}: {
  person: Person;
  /** いま何段目か。図に出している番号と同じ */
  current: number;
  /** 指定された段へ移す。無効なときは呼び出し側が理由を出す */
  onSubmit: (generation: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(String(current));
  const [busy, setBusy] = useState(false);

  const shift = person.generationShift ?? 0;
  const target = Number.parseInt(value, 10);
  const invalid = Number.isNaN(target) || target < 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (invalid || busy) return;

    setBusy(true);
    try {
      await onSubmit(target);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <p className="note">
        {displayName(person)} は <strong>いま {current} 段目</strong>です
        {shift !== 0 && `（自動から ${shift > 0 ? '+' : ''}${shift} 段ずらしています）`}。
      </p>

      <label className="field">
        <span className="field__label">移したい段</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        />
      </label>

      <p className="note">
        いちばん上が 0 段目です。配偶者も同じ段について来ます。
        親と同じ段（またはそれより上）や、子と同じ段（またはそれより下）には移せません。
      </p>

      <div className="form__actions">
        <button type="submit" className="button button--primary" disabled={invalid || busy}>
          この段へ移す
        </button>
        <button type="button" className="button" onClick={onCancel} disabled={busy}>
          キャンセル
        </button>
        {shift !== 0 && (
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onSubmit(current - shift).finally(() => setBusy(false));
            }}
          >
            自動に戻す
          </button>
        )}
      </div>
    </form>
  );
}
