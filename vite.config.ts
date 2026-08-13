import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// GitHub Pages のサブパス配信（https://<user>.github.io/<repo>/）に対応するため、
// base は VITE_BASE_PATH から取得する。ルート配信（Vercel など）では既定の '/' でよい。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
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
