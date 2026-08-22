import { useEffect, useState } from 'react';

/**
 * 「ホーム画面に追加」をアプリの中から押せるようにする。
 *
 * Chrome などは、条件がそろうと `beforeinstallprompt` を投げてくる。
 * これを捕まえて取っておき、押されたときに出す。既定の案内は出るタイミングが
 * ブラウザ任せで見落としやすいので、設定の中にいつでも押せる場所を用意する。
 *
 * iOS Safari はこの仕掛けを持たない（共有メニューから追加する）。
 * その場合は `available` が false のままなので、画面側で手順を書いておく。
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (raw: Event) => {
      // 既定の案内を止めて、こちらの都合の良いときに出す
      raw.preventDefault();
      setEvent(raw as InstallPromptEvent);
    };
    const onInstalled = () => {
      setEvent(null);
      setInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  /** すでにホーム画面から開いているか。開いていれば案内は要らない */
  const standalone =
    typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;

  return {
    available: event !== null,
    installed: installed || Boolean(standalone),
    async install() {
      if (!event) return;
      await event.prompt();
      await event.userChoice;
      setEvent(null);
    },
  };
}
