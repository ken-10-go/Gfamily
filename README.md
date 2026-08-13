# 家系図共有Webアプリ

家族・親戚間で家系図を作成し、招待された限定メンバーだけで共有するWebアプリケーションです。
個人情報を扱うため、**コードは公開・データは非公開**という方針で構成しています。

要件の詳細は [要件定義書.md](要件定義書.md) を参照してください。

> **現在の状態**: フェーズ1（MVP）実装済み。認証、人物・関係のCRUD、ツリービュー、招待、RLSによる権限制御が動きます。
> ファンチャート／タイムライン、写真添付、GEDCOM入出力はフェーズ2以降です。

## 技術構成

| レイヤ | 採用技術 |
|---|---|
| フロントエンド | React 19 + TypeScript + Vite |
| ルーティング | React Router |
| バックエンド / 認証 / DB | Supabase（PostgreSQL + Auth + Row Level Security） |
| 家系図描画 | 自前のレイアウト計算 + SVG |
| ホスティング | GitHub Pages（GitHub Actions で自動デプロイ） |
| Lint / Format | ESLint（flat config）+ Prettier |
| テスト | Vitest + Testing Library + PGlite |

家系図の描画は D3.js / React Flow を使わず、自前のレイアウト計算（[layout.ts](src/features/tree-view/layout.ts)）と
SVG で実装しています。家系図は「親子＋婚姻」の有向グラフで厳密な木ではなく、複数婚や養子縁組を含むため
汎用のツリーレイアウトが素直に当てはまらないこと、依存を増やさずバンドルを小さく保てることが理由です。

## 機能

- 招待制のログイン（パスワード / ログインリンク）
- 家系図の作成、オーナー / 編集者 / 閲覧者の3権限
- 人物の追加・編集・ソフト削除・復元、親 / 配偶者 / 子を起点にした関係の追加
- ツリービュー（世代配置、夫婦の連結、離婚は破線、ズーム・パン、名前検索）
- 招待リンクの発行・取り消し・受諾、メンバーの権限変更
- 変更履歴（誰がいつ何を編集したか）とゴミ箱からの復元

## セルフホスト手順

### 1. Supabase プロジェクトを用意する

1. [Supabase](https://supabase.com/) で無料プロジェクトを作成
2. Project Settings > API から **Project URL** と **anon public key** を控える
3. `service_role` key はサーバー専用の秘密鍵です。フロントエンドやリポジトリには絶対に置かないでください

### 2. スキーマを適用する

SQL Editor で [supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql) を実行します。
テーブル、RLSポリシー、権限判定関数、招待用RPC、監査ログのトリガーがまとめて作成されます。

動作確認用のダミーデータが必要な場合は、ユーザーを1人作った後に
[supabase/seed.sql](supabase/seed.sql) を実行してください（架空の人物のみが入ります）。

### 3. 認証を招待制にする

要件どおり「一般公開の新規登録は行わない」ため、Supabase 側で自己サインアップを止めます。

1. Authentication > Providers > Email で **Enable Sign Ups** を **オフ**にする
2. 利用者は Authentication > Users の **Invite user** から管理者が追加する

アプリのログインリンクは `shouldCreateUser: false` で要求するため、
未登録のメールアドレスにリンクが送られてアカウントが作られることはありません。

家系図への招待（アプリ内の招待リンク）は、この認証アカウントを持つ人に対して
「どの家系図に、どの権限で参加できるか」を与えるものです。両者は別の段階です。

### 4. 環境変数を設定する

```bash
cp .env.example .env
```

`.env` に控えた値を記入します。`.env` は `.gitignore` 済みです。

| 変数名 | 必須 | 説明 |
|---|---|---|
| `VITE_SUPABASE_URL` | ○ | Supabase の Project URL |
| `VITE_SUPABASE_ANON_KEY` | ○ | Supabase の anon public key |
| `VITE_BASE_PATH` | | 配信先のベースパス。既定は `/`。GitHub Pages のサブパス配信では `/<リポジトリ名>/` |

### 5. 起動する

```bash
npm install
```

```bash
npm run dev
```

Supabase を設定しなくてもツリービューの描画だけは確認できます。開発サーバー起動後に
`/demo` を開いてください（架空データ。本番ビルドには含まれません）。

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

## テスト

RLSポリシーは、実際の PostgreSQL（WASM版の [PGlite](https://pglite.dev/)）にマイグレーションを適用して検証しています。
Docker も Supabase CLI も不要で、`npm test` だけで以下が確認されます。

- 非メンバーは他人の家系図を読めない / 書けない
- 閲覧者は読めるが書けない、編集者は書けるが物理削除・招待発行はできない
- 招待トークンは平文で保存されず、期限切れ・取り消し済み・使用済み・宛先違いは受諾できない
- 監査ログはクライアントから改ざん・削除できない
- 家系図から最後のオーナーが居なくなる操作は拒否される

家系図のレイアウト計算は純粋関数なので、世代の決定・きょうだいの導出・複数婚・
データの循環といったケースを単体テストで押さえています。

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
- 招待トークンは SHA-256 ハッシュのみを保存し、平文は発行時に1度だけ表示する
- 監査ログはトリガーでのみ書き込み、クライアントには読み取り権限しか与えない
- 秘匿情報は環境変数（ローカルは `.env`、CI は GitHub Secrets）で管理し、リポジトリに含めない
- 依存パッケージの脆弱性は Dependabot で監視する

個人情報は要件定義書 2.3 に従い必要最小限に絞っており、住所・電話番号・メールアドレスは
人物データとして保持しません。メンバー一覧でも他人のメールアドレスは表示されません。

## リポジトリに含めないもの

このリポジトリは**コードのみ**を公開します。以下は含めません。

- 実際の家族データ（人物情報、写真、GEDCOM ファイル）
- Supabase の接続情報・APIキー・DB ダンプ

動作確認用のサンプルは、実在の家族と混同しないよう明確なダミーデータとして用意します。
