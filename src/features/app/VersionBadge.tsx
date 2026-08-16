/**
 * いま表示しているビルドの目印。ヘッダーの右上に出す。
 *
 * 「直したはずの画面にならない」ときに、開いているのが最新のビルドかを
 * その場で確かめられるようにするためのもの。コミットの短縮ハッシュを出し、
 * GitHub のそのコミットのページへ直接飛べるようにしている。
 *
 * 値はビルド時に vite.config.ts が埋め込む。実行時には変わらない。
 */
export function VersionBadge() {
  const commit = __APP_COMMIT__;
  const repository = __APP_REPOSITORY__;
  const short = commit.slice(0, 7);

  // git の無い環境でビルドすると空になる。その場合は目印だけ出す
  if (!short) {
    return <span className="app__version">dev</span>;
  }

  const builtAt = new Date(__APP_BUILT_AT__);
  const label = Number.isNaN(builtAt.getTime())
    ? short
    : `${short}（${builtAt.toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })} 時点）`;

  return (
    <a
      className="app__version"
      href={`https://github.com/${repository}/commit/${commit}`}
      target="_blank"
      rel="noreferrer"
      title={`このビルドの元になったコミット: ${label}`}
    >
      {short}
    </a>
  );
}
