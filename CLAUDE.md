# CLAUDE.md

家族・親戚限定で共有する家系図Webアプリ。要件は [要件定義書.md](要件定義書.md)、セットアップは [README.md](README.md) を参照。

## スタック

React 19 + TypeScript + Vite / React Router / Supabase（Auth + PostgreSQL + RLS） / Vitest + Testing Library / ESLint flat config + Prettier / GitHub Pages（Actions でデプロイ）

家系図描画ライブラリ（D3.js / React Flow）は未選定。ツリービュー実装時に決める。

## ディレクトリ

```
src/
├── lib/supabase.ts   Supabase クライアント（getSupabaseClient() 経由で取得）
├── test/setup.ts     Vitest セットアップ
├── App.tsx           ルーティング定義
└── main.tsx          エントリポイント
```

`@/*` は `src/*` のエイリアス。

## コマンド

```bash
npm run dev
```

変更後は `npm run typecheck && npm run lint && npm test` を通すこと。

## 制約

- **秘匿情報をコミットしない。** 接続情報は `.env`（gitignore 済み）と GitHub Secrets のみ。`.env.example` にはダミー値だけを置く。
- **実際の家族データをリポジトリに入れない。** サンプルは明確なダミーデータにする。
- **Supabase の `service_role` key はフロントエンドで使わない。** 使うのは anon key のみで、アクセス制御は RLS で行う。
- 認証は Supabase Auth に委譲し、パスワードを自前で保存しない。
- 個人情報の項目は必要最小限に絞る。新しい個人情報カラムを足すときは要件定義書 2.3 と照らして判断する。
- Supabase クライアントは `getSupabaseClient()` から取得する。環境変数が未設定なら例外を投げる設計なので、握りつぶさないこと。

## 開発フェーズ

1. **フェーズ1（MVP・現在地の次）**: 認証、人物/関係CRUD、ツリービュー1種、招待、RLS
2. フェーズ2: ファンチャート・タイムライン、写真添付、GEDCOM インポート
3. フェーズ3: エクスポート、リマインド、PWA、監査ログ強化
