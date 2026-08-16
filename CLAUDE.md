# CLAUDE.md

家族・親戚限定で共有する家系図Webアプリ。要件は [要件定義書.md](要件定義書.md)、セットアップは [README.md](README.md) を参照。

フェーズ1（認証・人物/関係CRUD・ツリービュー・招待・権限制御）まで実装済み。

## スタック

React 19 + TypeScript + Vite / React Router / Firebase（Auth + Firestore + Functions + Hosting） /
Vitest + Testing Library + Firestore エミュレータ / ESLint flat config + Prettier / GitHub Actions

家系図描画は自前のレイアウト計算 + SVG。D3.js / React Flow は使っていない。

> 当初は Supabase で実装していたが、無料枠でプロジェクトが自動休止する点を避けて Firebase に移行した。
> 要件定義書 2.2 の表は Supabase 推奨のままなので、記述と実装が食い違っている点に注意。

## ディレクトリ

```
firestore.rules            アクセス制御の中核
firestore.indexes.json     招待のトークン検索・履歴の並び替え用
functions/src/index.ts     招待の発行/受諾/取り消し、監査ログのトリガー
src/
├── lib/firebase.ts        SDK の初期化（getDb / getFirebaseAuth / getFns）
├── lib/api.ts             データアクセス層。UIから直接 Firestore を触らない
├── types/models.ts        ドメイン型と表示用ラベル
├── features/
│   ├── auth/              AuthProvider・ログイン・ルート保護
│   ├── trees/             一覧・詳細（ツリービューとパネルの土台）
│   ├── persons/           人物フォームと詳細パネル
│   ├── tree-view/         レイアウト計算・SVG描画・パン/ズーム・開発用デモ
│   ├── members/           メンバー管理・招待発行・招待受諾
│   └── history/           監査ログとゴミ箱
└── test/rules/            エミュレータによるセキュリティルールのテスト
```

`@/*` は `src/*` のエイリアス。

## コマンド

```bash
npm run dev
```

変更後は `npm run typecheck && npm run lint && npm test` を通すこと。
ルールを触ったら `npm run test:rules` も必ず走らせる（Java が必要）。
Firebase なしで描画を見たいときは `/demo`（DEV ビルドのみ）。

## 設計上の決まりごと

- **UI から Firestore を直接触らない。** クエリは `src/lib/api.ts` に集約する。
- **権限はツリー文書の `roles` マップが正。** `memberIds` は「自分が参加しているツリー」を
  `array-contains` で引くための複製で、ルールの `membersAreConsistent()` が両者の一致を強制する。
  片方だけ更新してはいけない。
- **`list` のルールで `roles` マップを参照しない。** list 評価では `resource.data` のマップ項目を
  参照できず `Property roles is undefined` になる。一覧の判定は `memberIds` 配列で行う。
- **書き込み時は必ず `updatedBy` に自分の uid を入れる。** ルールが詐称を弾いており、
  監査ログの「誰が」はこの値を使う。省略すると書き込み自体が拒否される。
- **削除はソフト削除（`deletedAt`）。** 物理削除の権限はオーナーにしか無い。ゴミ箱から復元できる。
- **招待と監査ログはクライアントから書けない。** Cloud Functions（Admin SDK）経由のみ。
- **ルールを変更したら `src/test/rules/firestore.test.ts` を必ず更新・実行する。**
- **自動デプロイは Hosting だけ。** `main` への push で GitHub Actions が画面を反映する。
  ルール・インデックス・Functions は手元から手動で反映する（理由と手順は README のデプロイ節）。

## 制約

- **秘匿情報をコミットしない。** サービスアカウント鍵は GitHub Secrets のみ。
  `.env` に入る Firebase 設定は公開前提の値だが、`.env` 自体は gitignore 済み。
- **実際の家族データをリポジトリに入れない。** サンプルは明確なダミーデータにする。
- 認証は Firebase Authentication に委譲し、パスワードを自前で保存しない。
- 新規登録は Firebase コンソール側で無効化する前提（Enable create (sign-up) をオフ）。
- 個人情報の項目は必要最小限に絞る。フィールドを足すときは要件定義書 2.3 と照らして判断する。

## 既知の弱点

- Firestore トリガーは実行者を受け取れないため、監査ログの「誰が」は `updatedBy` に依存する。
  物理削除（オーナーのみ）では削除実行者ではなく最後の更新者が記録される。
- バンドルが約 830KB（gzip 約 250KB）。Firebase SDK が大きい。ルート単位の遅延読み込みが有効。

## 残りのフェーズ

2. ファンチャート・タイムライン・家族カードビュー、写真添付、GEDCOM インポート
3. エクスポート（画像/PDF/GEDCOM）、命日リマインド、PWA、監査ログ強化

未実装のうち要件定義書に挙がっているもの: ミニマップ、
大規模ツリーの仮想化、写真添付（Cloud Storage の設計が必要）。

フォーカスモード（中心人物のまわりだけを表示）は `src/features/tree-view/focus.ts` の
`focusGraph` が担う。純粋関数なので、描画とは切り離してテストできる。
絞り込むのは描画に渡す家系図だけで、検索や人物メニューは絞り込み前のデータを見る。
