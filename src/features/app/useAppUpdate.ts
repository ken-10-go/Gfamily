import { useCallback, useEffect, useState } from 'react';

/**
 * 新しい版が出ていないかを見て、その場で入れ替えられるようにする。
 *
 * ホーム画面に入れて使うと、画面を開きっぱなしにしたまま何日も経つ。
 * 直したはずのものが出ない、という状態を放置しないよう、
 * ビルドのたびに置いている `version.json` と、いま動いている版を突き合わせる。
 *
 * 見に行くのは「開いたとき」と「画面に戻ってきたとき」だけ。
 * 一定間隔で叩き続けても、家族で使う道具では意味がない。
 */
const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;

export function useAppUpdate() {
  const [latest, setLatest] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      // 溜め込まれた版を見ても意味がないので、必ず取りに行く
      const response = await fetch(VERSION_URL, { cache: 'no-store' });
      if (!response.ok) return;

      const data = (await response.json()) as { commit?: string };
      setLatest(data.commit ?? null);
    } catch {
      // 圏外などで取れないことはふつうにある。次に画面へ戻ったときに見る
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [check]);

  /**
   * 新しい版に入れ替える。
   *
   * サービスワーカーと溜め込みを捨ててから読み込み直す。
   * いまは溜め込まない作りだが、前に入れた版が端末に残っていることがあるので、
   * ここで確実に片づける（これをしないと、古い画面から抜け出せない端末が出る）。
   */
  const update = useCallback(async () => {
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((registrations ?? []).map((registration) => registration.unregister()));

      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      // 片づけに失敗しても、読み込み直しはやる
    }

    window.location.reload();
  }, []);

  return {
    /** 動いている版と、置いてある版が食い違っているか */
    available: latest !== null && __APP_COMMIT__ !== '' && latest !== __APP_COMMIT__,
    current: __APP_COMMIT__,
    /** 画面に出す版（ver.メジャー.マイナー） */
    version: __APP_VERSION__,
    latest,
    checking,
    check,
    update,
  };
}
