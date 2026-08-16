/// <reference types="vite/client" />

// Firebase のクライアント設定は公開前提の値（アクセス制御はセキュリティルールで行う）。
// 秘密鍵ではないが、プロジェクトごとに変わるため環境変数で持つ。
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_USE_FIREBASE_EMULATORS?: string;
  readonly VITE_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * ビルド時に vite.config.ts が埋め込む値。画面右上のバージョン表示に使う。
 * commit は空になることがある（git の無い環境でのビルド）。
 */
declare const __APP_COMMIT__: string;
declare const __APP_REPOSITORY__: string;
declare const __APP_BUILT_AT__: string;
