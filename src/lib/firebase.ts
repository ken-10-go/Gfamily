import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
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

/**
 * App Check（bot よけ）の鍵。
 *
 * 「この呼び出しは本物のアプリから来たか」を Firebase 側で見分けるための仕組み。
 * 招待からの登録（`registerWithInvitation`）は未ログインでも呼べる入口なので、
 * ここを素通しにしておくと外から機械的に叩かれる。
 *
 * 鍵を入れていない環境（手元・エミュレータ）では何もしない。
 * コンソール側を「強制」にするまでは、入れても今までどおり動く（印を添えるだけ）。
 */
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

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

  if (!app) {
    app = initializeApp(config);
    startAppCheck(app);
  }
  return app;
}

/**
 * App Check を始める。失敗しても落とさない。
 *
 * ここで例外を投げると、鍵の設定ミスだけでアプリが丸ごと開かなくなる。
 * 強制にする前なら印が付かないだけで済むので、記録に残して先へ進む。
 */
function startAppCheck(instance: FirebaseApp): void {
  if (!recaptchaSiteKey || useEmulators) return;

  try {
    initializeAppCheck(instance, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      // 端末ごとの印を更新し続ける。開きっぱなしでも切れないように
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn('App Check を始められませんでした', error);
  }
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
