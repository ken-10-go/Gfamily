import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';

import pkg from './package.json' with { type: 'json' };
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * 画面に出す版の番号と、ビルドの目印。
 *
 * 版は `ver.メジャー.マイナー`。
 * **マイナーはコミットの数**で、push のたびに本番へ出る作りなので、
 * 出るたびに自然と1つ増える（別に数を覚えておく必要がない）。
 * メジャーは package.json の version から採り、上げるときは手で書き換える。
 *
 * 「直したはずの画面が出ない」ときに、開いているのがどのビルドかを確かめられるようにする。
 * GitHub Actions では GITHUB_SHA が入る。手元では git から拾い、
 * 取れなければ空にして「開発中」と表示する。
 */
function buildInfo() {
  const fromGit = () => {
    try {
      return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      return '';
    }
  };

  const countCommits = () => {
    try {
      return Number(
        execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim(),
      );
    } catch {
      return 0;
    }
  };

  const major = Number(pkg.version.split('.')[0]) || 1;

  return {
    commit: process.env.GITHUB_SHA || fromGit(),
    repository: process.env.GITHUB_REPOSITORY || 'ken-10-go/Gfamily',
    builtAt: new Date().toISOString(),
    version: `ver.${major}.${countCommits()}`,
  };
}

// GitHub Pages のサブパス配信（https://<user>.github.io/<repo>/）に対応するため、
// base は VITE_BASE_PATH から取得する。ルート配信（Vercel など）では既定の '/' でよい。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const build = buildInfo();

  return {
    base: env.VITE_BASE_PATH || '/',
    define: {
      __APP_COMMIT__: JSON.stringify(build.commit),
      __APP_REPOSITORY__: JSON.stringify(build.repository),
      __APP_BUILT_AT__: JSON.stringify(build.builtAt),
      __APP_VERSION__: JSON.stringify(build.version),
    },
    plugins: [
      react(),
      /*
       * いま出ている版を、画面から確かめられるように置いておく。
       * アプリはこれを読みに行って、自分より新しければ「更新があります」と出す。
       * ホーム画面に入れたまま開きっぱなしにされると、放っておいては古いままになる。
       */
      {
        name: 'app-version-file',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({
              commit: build.commit,
              builtAt: build.builtAt,
              version: build.version,
            }),
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // ルールのテストは Firestore エミュレータが要るので、通常の run からは外す。
      // 実行は npm run test:rules（エミュレータを起動してから走らせる）。
      exclude: ['node_modules/**', 'dist/**', 'functions/**', 'src/test/rules/**'],
    },
  };
});
