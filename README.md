# 家系図共有Webアプリ

家族・親戚間で家系図を作成し、招待された限定メンバーだけで共有するWebアプリケーションです。
個人情報を扱うため、**コードは公開・データは非公開**という方針で構成しています。

要件の詳細は [要件定義書.md](要件定義書.md) を参照してください。

> **現在の状態**: フェーズ1（MVP）実装済み。認証、人物・関係のCRUD、ツリービュー、招待、権限制御が動きます。
> ファンチャート／タイムライン、写真添付、GEDCOM入出力はフェーズ2以降です。

## 技術構成

| レイヤ | 採用技術 |
|---|---|
| フロントエンド | React 19 + TypeScript + Vite |
| ルーティング | React Router |
| 認証 / DB | Firebase Authentication + Cloud Firestore |
| サーバー処理 | Cloud Functions（招待の発行・受諾、変更履歴の記録） |
| 家系図描画 | 自前のレイアウト計算 + SVG |
| ホスティング | Firebase Hosting（GitHub Actions で自動デプロイ。Firestore のルールも同時に反映） |
| Lint / Format | ESLint（flat config）+ Prettier |
| テスト | Vitest + Testing Library + Firestore エミュレータ |

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

### 1. Firebase プロジェクトを用意する

1. [Firebase コンソール](https://console.firebase.google.com/) でプロジェクトを作成
2. **Firestore Database** を作成（本番モードでよい。ルールは後で上書きします）
3. **Authentication** を有効化し、**メール/パスワード** と **メールリンク** を有効にする
4. ウェブアプリ（`</>`）を登録し、表示される設定値を控える

**Cloud Functions を使うため Blaze（従量課金）プランが必要です。** 無料枠は大きいので
家族規模の利用で課金される可能性は低いですが、コンソールで予算アラートを設定しておくと安心です。

### 2. 認証を招待制にする

要件どおり「一般公開の新規登録は行わない」ため、自己サインアップを止めます。

1. **Authentication → Settings → User actions** で **Enable create (sign-up)** を **オフ**にする
2. 利用者は **Authentication → Users → Add user** から管理者が追加する

家系図への招待（アプリ内の招待リンク）は、この認証アカウントを持つ人に対して
「どの家系図に、どの権限で参加できるか」を与えるものです。両者は別の段階です。

### 3. 環境変数を設定する

```bash
cp .env.example .env
```

Firebase コンソールで控えた値を記入します。`.env` は `.gitignore` 済みです。

ここに入る値は**公開前提のクライアント設定**です（アプリのバンドルに埋め込まれます）。
秘密鍵ではありませんが、**アクセス制御は [firestore.rules](firestore.rules) が担っている**ため、
ルールを適用せずに公開しないでください。

### 4. ルールと Functions を反映する

```bash
npx firebase-tools deploy --only firestore,functions --project <プロジェクトID>
```

### 5. 起動する

```bash
npm install && npm ci --prefix functions
```

```bash
npm run dev
```

Firebase を設定しなくてもツリービューの描画だけは確認できます。開発サーバー起動後に
`/demo` を開いてください（架空データ。本番ビルドには含まれません）。

## npm scripts

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバーを起動 |
| `npm run emulators` | Firebase エミュレータ一式を起動（`VITE_USE_FIREBASE_EMULATORS=true` と併用） |
| `npm run build` | 型チェック + 本番ビルド（`dist/`） |
| `npm run typecheck` | 型チェックのみ |
| `npm run lint` | ESLint |
| `npm test` | 単体テスト |
| `npm run test:rules` | セキュリティルールのテスト（エミュレータを自動起動） |
| `npm run test:all` | 上記テストをまとめて実行 |
| `npm run format` | Prettier で整形 |

## テスト

セキュリティルールは、実際の Firestore エミュレータにルールを適用して検証しています。
`npm run test:rules` で以下が確認されます（38件）。

- 非メンバーは他人の家系図を読めない / 書けない / 自分をメンバーに追加できない
- 閲覧者は読めるが書けない、編集者は書けるが物理削除・招待操作はできない
- 実行者（`updatedBy`）を詐称できず、省略もできない
- 監査ログはオーナーでも書き込み・改ざん・削除ができない
- 家系図から最後のオーナーが居なくなる更新は拒否される
- `roles` と `memberIds` が食い違う更新は拒否される
- ルールに定義していないパスは一切読み書きできない

エミュレータの実行には Java が必要です（`brew install openjdk`）。

家系図のレイアウト計算は純粋関数なので、世代の決定・きょうだいの導出・複数婚・
データの循環といったケースを単体テストで押さえています（15件）。

## デプロイ

`main` と `claude/**` ブランチへの push で [deploy.yml](.github/workflows/deploy.yml) が
**Hosting（画面）と Firestore のルール・インデックス**を反映します。
PR やマージを待たずに本番へ出るので、スマホから直した内容もそのまま家族に届きます。

デプロイの前に typecheck・lint・ユニットテスト・**ルールのテスト**・build が走り、
どれか1つでも落ちればデプロイ手順まで進みません。裏を返すと、検査さえ通れば
レビュー前の変更でも本番に出ます。試したいだけの変更は別名のブランチ
（`claude/` 以外）に置いてください。

事前に以下を登録してください。

**Settings → Secrets and variables → Actions → Variables**（公開前提の値）

`VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_PROJECT_ID` /
`VITE_FIREBASE_STORAGE_BUCKET` / `VITE_FIREBASE_MESSAGING_SENDER_ID` / `VITE_FIREBASE_APP_ID`

**Settings → Secrets and variables → Actions → Secrets**（秘密）

- `FIREBASE_SERVICE_ACCOUNT` … Firebase コンソール → プロジェクトの設定 → サービスアカウント
  → 「新しい秘密鍵の生成」で得た JSON の中身をそのまま貼る

デプロイ後、**Authentication → Settings → 承認済みドメイン**に公開URLのドメインを追加してください。
ログインリンクが機能しなくなります。

画面の右上には、そのとき表示しているビルドのコミット（短縮ハッシュ）が出ます。
押すと GitHub のそのコミットのページが開きます。「直したはずの画面にならない」ときは、
まずここが最新のコミットかを確かめてください。古ければ、開いているのは前のビルドです。

ルール・インデックスの反映は、`firestore.rules` か `firestore.indexes.json` を
変更した push のときだけ走ります。画面だけ直した push では投げません。
Actions から手動実行（`workflow_dispatch`）した場合は、差分に関わらず必ず反映します
（権限を直したあとなど、ルールだけ入れ直したいときはこれを使ってください）。

そのため、サービスアカウントには Hosting の権限に加えて以下が要ります。
**足りていない場合、Hosting は反映されたうえでルールの反映だけが失敗します**
（画面が古いまま止まることはありません）。

- Firebase Rules 管理者（`roles/firebaserules.admin`）
- Cloud Datastore インデックス管理者（`roles/datastore.indexAdmin`）
- Service Usage コンシューマ（`roles/serviceusage.serviceUsageConsumer`）
  … デプロイ前に Firestore API の有効化を確認するために要る

付与は Google Cloud コンソール → IAM と管理 → IAM で、
`FIREBASE_SERVICE_ACCOUNT` に使ったサービスアカウントに対して行います。
付与しないうちは、ルールを変えたときだけ手元から反映してください（下記）。

### Functions だけは手動デプロイ

`functions/` を変更したときは手元から反映してください。

```bash
npx firebase-tools deploy --only functions --project family-505409
```

自動化しない理由: Functions のデプロイには Cloud Functions 管理者・Service Account User・
Artifact Registry・Cloud Run・Eventarc といった広い権限が要り、
公開リポジトリの Secrets に置く鍵としては強すぎるためです。変更頻度も高くありません。

手元からルールだけを反映したいときは、これまでどおり次のコマンドが使えます。

```bash
npm run test:rules && npx firebase-tools deploy --only firestore --project family-505409
```

### PR プレビュー

PR を作ると [preview.yml](.github/workflows/preview.yml) が Hosting のプレビューチャンネルへ
デプロイし、URL を PR にコメントします。手元に環境が無くても（スマホからでも）
マージ前に画面を確認できます。プレビューは 7 日で失効します。

反映されるのは Hosting だけで、**Firestore のルール・インデックス・Functions は本番のもの**が
使われます。プレビューから触るデータも本番です。確認用の家系図を別に作って使ってください。

### スマホ・ブラウザから開発を続ける

[claude.ai/code](https://claude.ai/code) の Claude Code on the web からこのリポジトリを開くと、
クラウド上で編集・テストを実行してブランチを push できます。
`claude/**` ブランチへ push した時点で `deploy.yml` が本番へ反映します
（PR を作った場合は、マージ前にプレビューURL でも確認できます）。

クラウド側には `.env` が無いため、`npm run dev` と `firebase deploy` は動きません
（typecheck・lint・ユニットテストは動きます）。実データを触る確認と Functions のデプロイは手元で行ってください。

## セキュリティ方針

- 一般公開の新規登録は行わず、招待されたメンバーのみが利用できる
- 家系図（ツリー）単位でアクセス制御し、オーナー / 編集者 / 閲覧者の3ロールを持つ
- Firestore セキュリティルールで「自分が所属するツリーのデータのみ」に限定する
- パスワードは自前保存せず Firebase Authentication に委譲する
- 招待トークンは SHA-256 ハッシュのみを保存し、平文は発行時に1度だけ表示する
- 招待の発行・受諾は Cloud Functions だけが行い、クライアントからは書き込めない
- 監査ログは Cloud Functions のトリガーだけが書き込み、クライアントは読み取りのみ
- サービスアカウント鍵はリポジトリに含めず GitHub Secrets で管理する

個人情報は要件定義書 2.3 に従い必要最小限に絞っており、住所・電話番号・メールアドレスは
人物データとして保持しません。メンバー一覧でも他人のメールアドレスは表示されません。

## リポジトリに含めないもの

このリポジトリは**コードのみ**を公開します。以下は含めません。

- 実際の家族データ（人物情報、写真、GEDCOM ファイル）
- サービスアカウント鍵、`.env`

動作確認用のサンプルは、実在の家族と混同しないよう明確なダミーデータとして用意します。
