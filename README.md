# 家系図共有Webアプリ

家族・親戚間で家系図を作成し、招待された限定メンバーだけで共有するWebアプリケーションです。
個人情報を扱うため、**コードは公開・データは非公開**という方針で構成しています。

要件の詳細は [要件定義書.md](要件定義書.md) を参照してください。

> **現在の状態**: プロジェクト雛形のみ。認証・人物/関係のCRUD・ツリービューは未実装です。

## 技術構成

| レイヤ | 採用技術 |
|---|---|
| フロントエンド | React 19 + TypeScript + Vite |
| ルーティング | React Router |
| バックエンド / 認証 / DB | Supabase（PostgreSQL + Auth + Row Level Security） |
| ホスティング | GitHub Pages（GitHub Actions で自動デプロイ） |
| Lint / Format | ESLint（flat config）+ Prettier |
| テスト | Vitest + Testing Library |

家系図の描画ライブラリ（D3.js / React Flow）はツリービュー実装時に選定します。

## セルフホスト手順

### 1. Supabase プロジェクトを用意する

1. [Supabase](https://supabase.com/) で無料プロジェクトを作成
2. Project Settings > API から **Project URL** と **anon public key** を控える
3. `service_role` key はサーバー専用の秘密鍵です。フロントエンドやリポジトリには絶対に置かないでください

### 2. 環境変数を設定する

```bash
cp .env.example .env
```

`.env` に控えた値を記入します。`.env` は `.gitignore` 済みです。

| 変数名 | 必須 | 説明 |
|---|---|---|
| `VITE_SUPABASE_URL` | ○ | Supabase の Project URL |
| `VITE_SUPABASE_ANON_KEY` | ○ | Supabase の anon public key |
| `VITE_BASE_PATH` | | 配信先のベースパス。既定は `/`。GitHub Pages のサブパス配信では `/<リポジトリ名>/` |

### 3. 起動する

```bash
npm install
```

```bash
npm run dev
```

## npm scripts

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | 型チェック + 本番ビルド（`dist/`） |
| `npm run preview` | ビルド結果をローカル配信 |
| `npm run typecheck` | 型チェックのみ |
| `npm run lint` | ESLint |
| `npm test` | Vitest（1回実行） |
| `npm run format` | Prettier で整形 |

## デプロイ（GitHub Pages）

`main` への push で `.github/workflows/deploy.yml` が動きます。事前に以下を設定してください。

1. リポジトリの Settings > Pages > Source を **GitHub Actions** にする
2. Settings > Secrets and variables > Actions に以下を登録する
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

anon key はフロントエンドのバンドルに埋め込まれる前提の公開鍵です。
**実際のアクセス制御は Supabase 側の Row Level Security で行う**ため、RLS ポリシーを設定せずに公開しないでください。

## セキュリティ方針

- 一般公開の新規登録は行わず、招待されたメンバーのみが利用できる
- 家系図（ツリー）単位でアクセス制御し、オーナー / 編集者 / 閲覧者の3ロールを持つ
- DB は RLS で「自分が所属するツリーのデータのみ」に限定する
- パスワードは自前保存せず Supabase Auth に委譲する
- 秘匿情報は環境変数（ローカルは `.env`、CI は GitHub Secrets）で管理し、リポジトリに含めない
- 依存パッケージの脆弱性は Dependabot で監視する

## リポジトリに含めないもの

このリポジトリは**コードのみ**を公開します。以下は含めません。

- 実際の家族データ（人物情報、写真、GEDCOM ファイル）
- Supabase の接続情報・APIキー・DB ダンプ

動作確認用のサンプルは、実在の家族と混同しないよう明確なダミーデータとして用意します。
