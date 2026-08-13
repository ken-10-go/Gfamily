import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Cloud Functions のリージョン。functions/src/index.ts と揃える必要がある。 */
const FUNCTIONS_REGION = 'asia-northeast1';

/**
 * 設定が揃っているか。
 *
 * Firebase の設定値は公開前提（アクセス制御はセキュリティルールで行う）なので秘密ではないが、
 * 未設定のまま起動すると原因の分かりにくいエラーになるため、UI 側で案内できるようにする。
 */
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let functions: Functions | null = null;

function getApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase の環境変数が未設定です。.env.example をコピーして .env を作成し、' +
        'Firebase コンソールの設定値を記入してください。',
    );
  }

  app ??= initializeApp(config);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getApp());
    if (useEmulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
  }
  return auth;
}

export function getDb(): Firestore {
  if (!firestore) {
    firestore = getFirestore(getApp());
    if (useEmulators) {
      connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    }
  }
  return firestore;
}

export function getFns(): Functions {
  if (!functions) {
    functions = getFunctions(getApp(), FUNCTIONS_REGION);
    if (useEmulators) {
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    }
  }
  return functions;
}
