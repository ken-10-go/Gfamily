import { useAppUpdate } from '@/features/app/useAppUpdate';

/**
 * 新しい版が出ているときだけ出す帯。
 *
 * ホーム画面に入れて使うと、古い画面をいつまでも開いたままになりやすい。
 * 押せば入れ替わる場所を、どの画面にいても目に入るところへ置く。
 */
export function UpdateBanner() {
  const { available, update } = useAppUpdate();

  if (!available) return null;

  return (
    <div className="update-banner" role="status">
      <span>新しい版があります</span>
      <button type="button" className="button button--primary" onClick={() => void update()}>
        更新する
      </button>
    </div>
  );
}
