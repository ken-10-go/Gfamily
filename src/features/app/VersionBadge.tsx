/**
 * いま表示している版。ヘッダーの右上に出す。
 *
 * 「直したはずの画面にならない」ときに、開いているのが新しい版かを
 * その場で確かめられるようにするためのもの。
 * 版は `ver.メジャー.マイナー` で、マイナーは本番へ出るたびに増える。
 *
 * 値はビルド時に vite.config.ts が埋め込む。実行時には変わらない。
 */
export function VersionBadge() {
  const version = __APP_VERSION__;
  const builtAt = new Date(__APP_BUILT_AT__);
  const stamp = Number.isNaN(builtAt.getTime())
    ? ''
    : builtAt.toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <span className="app__version" title={stamp ? `${stamp} のビルド` : undefined}>
      {version}
    </span>
  );
}
