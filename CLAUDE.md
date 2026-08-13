# CLAUDE.md

家族・親戚限定で共有する家系図Webアプリ。要件は [要件定義書.md](要件定義書.md)、セットアップは [README.md](README.md) を参照。

フェーズ1（認証・人物/関係CRUD・ツリービュー・招待・RLS）まで実装済み。

## スタック

React 19 + TypeScript + Vite / React Router / Supabase（Auth + PostgreSQL + RLS） /
Vitest + Testing Library + PGlite / ESLint flat config + Prettier / GitHub Pages（Actions でデプロイ）

家系図描画は自前のレイアウト計算 + SVG。D3.js / React Flow は使っていない。

## ディレクトリ

```
supabase/
├── migrations/0001_initial_schema.sql   スキーマ・RLS・RPC・監査トリガー
└── seed.sql                             架空のダミーデータ
src/
├── lib/supabase.ts        Supabase クライアント（getSupabaseClient() 経由）
├── lib/api.ts             データアクセス層。UIから直接 supabase を触らない
├── types/models.ts        ドメイン型と表示用ラベル
├── features/
│   ├── auth/              AuthProvider・ログイン・ルート保護
│   ├── trees/             一覧・詳細（ツリービューとパネルの土台）
│   ├── persons/           人物フォームと詳細パネル
│   ├── tree-view/         レイアウト計算・SVG描画・パン/ズーム・開発用デモ
│   ├── members/           メンバー管理・招待発行・招待受諾
│   └── history/           監査ログとゴミ箱
└── test/db/               PGlite による RLS テスト
```

`@/*` は `src/*` のエイリアス。

## コマンド

```bash
npm run dev
```

変更後は `npm run typecheck && npm run lint && npm test` を通すこと。
Supabase なしで描画を見たいときは `/demo`（DEV ビルドのみ）。

## 設計上の決まりごと

- **UI から Supabase を直接触らない。** クエリは `src/lib/api.ts` に集約する。
- **ツリー作成は `create_tree()` RPC 経由。** `trees` への直接 INSERT は権限を与えていない。
  作成直後はまだメンバーではないため、`INSERT ... RETURNING` が SELECT ポリシーに阻まれるのを避けている。
- **削除はソフト削除（`deleted_at`）。** 物理削除の権限はオーナーにしか無い。ゴミ箱から復元できる。
- **RLS ポリシーは `current_tree_role()` 系のヘルパー関数を使う。** `tree_members` を
  ポリシー内で直接参照すると無限再帰する。ヘルパーは SECURITY DEFINER + `search_path = ''`。
- **スキーマを変更したら `src/test/db/rls.test.ts` を必ず更新・実行する。** 実DB無しでも
  PGlite で本物の PostgreSQL に対して検証できる。

## 制約

- **秘匿情報をコミットしない。** 接続情報は `.env`（gitignore 済み）と GitHub Secrets のみ。
- **実際の家族データをリポジトリに入れない。** サンプルは明確なダミーデータにする。
- **Supabase の `service_role` key はフロントエンドで使わない。** アクセス制御は RLS で行う。
- 認証は Supabase Auth に委譲し、パスワードを自前で保存しない。
- 新規登録は Supabase 側で無効化する前提。マジックリンクは `shouldCreateUser: false` で要求する。
- 個人情報の項目は必要最小限に絞る。カラムを足すときは要件定義書 2.3 と照らして判断する。

## 残りのフェーズ

2. ファンチャート・タイムライン・家族カードビュー、写真添付、GEDCOM インポート
3. エクスポート（画像/PDF/GEDCOM）、命日リマインド、PWA、監査ログ強化

未実装のうち要件定義書に挙がっているもの: フォーカスモード、ミニマップ、
大規模ツリーの仮想化、写真添付（Supabase Storage の設計が必要）。
