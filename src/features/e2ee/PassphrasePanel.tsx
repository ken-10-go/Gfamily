import { useState, type FormEvent } from 'react';

import { useTreeKey } from '@/features/e2ee/useTreeKey';

/**
 * 機微項目の鍵を作る画面。
 *
 * 本籍地・住所・戒名・お墓・思い出は、この端末の中で暗号化してから保存する。
 * 合言葉（パスフレーズ）はどこにも保存しないので、運営でも復元できない。
 * 忘れても家系図の骨組み（氏名・生没年・関係）は残る、という設計をここで伝える。
 */
export function PassphrasePanel({ onDone }: { onDone?: () => void }) {
  const { unlocked, unlock, lock } = useTreeKey();
  const [passphrase, setPassphrase] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (passphrase.length < 8) {
      setError('合言葉は8文字以上にしてください');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await unlock(passphrase);
      // 鍵を作ったらすぐ捨てる。画面に残しておく理由がない
      setPassphrase('');
      onDone?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '鍵を作れませんでした');
    } finally {
      setBusy(false);
    }
  }

  if (unlocked) {
    return (
      <div className="form">
        <p className="alert alert--success">
          🔓 機微な項目を表示・編集できます。この端末でこの画面を開いている間だけ有効です。
        </p>
        <div className="form__actions">
          <button type="button" className="button" onClick={lock}>
            鍵を閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <p className="note">
        本籍地・住所・戒名・お墓・思い出は、この端末の中で暗号化してから保存します。
        Google のサーバー上でも中身は読めません。
      </p>

      <label className="field">
        <span className="field__label">家族の合言葉（パスフレーズ）</span>
        <input
          type={reveal ? 'text' : 'password'}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          autoComplete="off"
          autoFocus
        />
      </label>

      <label className="field field--checkbox">
        <input
          type="checkbox"
          checked={reveal}
          onChange={(event) => setReveal(event.target.checked)}
        />
        <span>入力した合言葉を表示する</span>
      </label>

      <p className="alert alert--error">
        ⚠️ 合言葉はどこにも保存されません。忘れると、暗号化した本籍地や戒名は二度と読めません
        （運営でも復元できません）。氏名・生没年・家系のつながりは残ります。
        親族で同じ合言葉を共有し、紙に控えて仏壇や金庫に保管してください。
      </p>

      {error && <p className="alert alert--error">{error}</p>}

      <div className="form__actions">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? '鍵を作っています…' : '合言葉で鍵を作る'}
        </button>
      </div>
    </form>
  );
}
