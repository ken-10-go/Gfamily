import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * 画面に出すビルドの目印。
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

  return {
    commit: process.env.GITHUB_SHA || fromGit(),
    repository: process.env.GITHUB_REPOSITORY || 'ken-10-go/Gfamily',
    builtAt: new Date().toISOString(),
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
            source: JSON.stringify({ commit: build.commit, builtAt: build.builtAt }),
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
