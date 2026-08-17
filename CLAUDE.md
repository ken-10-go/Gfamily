# CLAUDE.md

家族・親戚限定で共有する家系図Webアプリ。セットアップは [README.md](README.md) を参照。

仕様書は `specs/` の8本（「絆ツリー」要件v4・アーキテクチャv3・DBスキーマv3・セキュリティv3・
UIデザイン・ワイヤーフレーム・パフォーマンス・ロードマップ）が正。
[要件定義書.md](要件定義書.md) は初期の下書きで、`specs/` と食い違う箇所は `specs/` を優先する。

仕様書は Flutter 前提で書かれているが、**実装は React Web を継続する**方針。
Flutter 固有の記述（CustomPainter・RepaintBoundary・InteractiveViewer）は
Web の等価物（SVG・React.memo・自前のパン/ズーム）に読み替える。

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

## 仕様書と実装の名前の対応

スキーマは現行の名前を維持し、仕様書の名前には合わせていない（本番データの移行を避けるため）。
将来 Flutter 版と Firestore を共有するなら、ここが移行対象になる。

| 仕様書 | 実装 |
| --- | --- |
| `isDeceased` | `isLiving`（真偽が逆） |
| `lastName` / `firstName` / `lastNameKana` | `familyName` / `givenName` / `familyNameKana` |
| `relationships`（1コレクション） | `parentChild` + `unions`（親1人ずつの辺で持つ） |
| `members` サブコレクション | ツリー文書の `roles` マップ + `memberIds` 配列 |
| `HybridDate` | 日付文字列（`YYYY[-MM[-DD]]`）+ `birthEra` / `deathEra`（和暦の生データ） |
| `sortOrder` | `siblingOrder` |
| `subtype: biological \| adoptive` | `kind`（実子・養子・特別養子・婿養子・連れ子・里子の6種） |

新しく作るものは仕様書の名前に合わせる（`treeBridges` など）。

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
- **機微項目（本籍地・住所・戒名・お墓・思い出）は端末で暗号化してから保存する。**
  鍵はパスフレーズとツリーの `e2eeSalt` から導き、メモリ（React の Context）にしか置かない。
  平文をサーバーへ送らない・保存しないこと。氏名・生没年・関係は暗号化しない（骨組みは残す）。
- **⚠ 他家とのつながりは、いま暫定でセキュリティを外している。**
  本来は Cloud Functions 経由でのみ作り、双方のオーナーが承認して初めて
  `/treeBridges/{treeId}_{uid}` が配られ、ルールが `exists()` 1回で見て
  「他家の故人だけ」を許可する。今は管理すべき家族の単位を決めるまでのあいだ、
  クライアントから直接その文書を書いてつないでいる。この状態では
  **ログインしていれば誰でも、相手の承認なしに任意の家系図を読める。**
  締め直す手順は `firestore.rules` の `treeBridges` のコメントに書いてある
  （ルール2か所・`src/lib/api.ts` の `connectTree`/`previewTree`/`revokeBridge`・
  ルールのテスト2件・Functions の手動デプロイ）。
- **`main` と `claude/**` への push で本番へ自動デプロイされる。** GitHub Actions が
  Hosting（画面）と Firestore のルール・インデックスを反映する。PR やマージは要らない。
  デプロイ前に typecheck・lint・`npm test`・`npm run test:rules`・build が走り、
  1つでも落ちれば反映されない。裏を返すと、通れば未レビューでも本番に出る。
  Functions だけは権限の都合で手動デプロイ（理由と手順は README のデプロイ節）。

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

## 実装済みと未実装（specs/ のロードマップに対して）

実装済み: 認証・人物/関係CRUD・ツリービュー・招待・権限制御・和暦（江戸期含む）・
フォーカスモード・手動配置・監査ログ・ゴミ箱・配色テーマ・カード表示項目の選択・
直系の強調・機微項目のE2EE・他家とのつながり（合同表示。承認の仕組みは暫定で外してある）。

未実装: 回忌法要と長寿祝いの通知（Cloud Functions）、家紋・名字マスター、
エクスポート（PDF/GEDCOM）、復旧バックアップPDF、写真添付（Cloud Storage の設計が必要）、
縦書き折本レイアウトの作り込み（縦書きトグルはある）、ミニマップ、大規模ツリーの仮想化。

## カードの3つのジェスチャー（仕様書 UI デザインガイド 4.1）

**1回タップ = メニュー。** よく使う5つ（編集・親を追加・配偶者を追加・子を追加・削除）と
「⋯ その他」への入口を、カードのまわりの弧に出す。弧の座標は
`src/features/persons/menuArc.ts` の `arcPositions`（純粋関数）。画面の右端では左へ開く。
**弧と枠付きのリストを同時に出さない。** 弧は枠の外へ張り出すので、両方出すと重なって読めない。
弧のあいだは枠・背景・影を消し（`.person-menu--radial`）、名前のチップだけを浮かせる。
「その他」を押したら弧を畳んで枠付きのリストへ切り替える。
閲覧のみのときは弧に載るものが無いので、はじめから従来の縦リストにする。

**ダブルタップ = その人を中心に絞り込む＋中央へ寄せる。** もう一度叩けば全体に戻る。
絞り込むと図が組み直されるので、寄せ直しは新しい図が出てから `centerRequest` 経由で行う
（その場の座標へ寄せても意味がない）。中央へ寄せるだけなら、メニューの
「画面の中央に寄せる」とキーボードの `c`（`usePanZoom` の `centerOn`、1秒）。
手で動かす操作が始まったらアニメーションは譲る。

**長押し＆ドラッグ = きょうだいの並べ替え。** 判定は `src/features/tree-view/reorder.ts`
（`siblingOrderAfterDrag` / `swapPreview` / `isOutsideSiblingRow`、すべて純粋関数）。
きょうだいの列の中で離せば `api.setSiblingOrder`、列から `SLOT` 以上外して離せば
今までどおり X 座標として `api.setPersonPosition`。並べ替えでは座標を保存しない
（順番は表示設定が変わっても意味を保つが、座標は保たないため）。
ドラッグ中はすれ違った相手1枚だけをずらして見せる（図の全体は組み直さない）。
戻すときはメニューの「並び順を生年順に戻す」（`api.clearSiblingOrder`、その列の全員）。

## カードと入力画面の作り

カードの既定は **ふりがな／氏名／生没年（年齢つき）** の3行
（`DEFAULT_VIEW_SETTINGS.cardFields = ['kana', 'lifespan']`）。続柄（長男・次女）は
出したい人だけが表示設定で足す。年齢は生没年の行に添える。生没年を出していないときだけ
氏名の横に戻す（設定を切っていないのに年齢が消えないように）。
既定を変えたときは `migrateSettings` の `PREVIOUS_DEFAULT_CARD_FIELDS` を更新する。
保存済みの設定が「前の既定そのまま」なら新しい既定へ寄せ、選び直した設定は触らない。

編集画面は2タブ。**基本情報**＝姓名・ふりがな・旧姓・性別＋存命・生没年月日・年齢からの逆算。
**文化的補足**＝続柄・出生地・改姓の履歴・メモ。どちらも DOM に残したまま `hidden` で
切り替えるので、行き来しても入力は消えない。保存でエラーが出たら基本情報タブへ戻す。
機微項目（本籍地・戒名など）は**この画面では扱わない**。保存済みの暗号文は
`input.encryptedData` のまま持ち越すこと（空で暗号化し直すと消えてしまう）。
読む側の `PersonDetail` には残してある。

## 絞り込みと手動配置

フォーカスモード（中心人物のまわりだけを表示）は `src/features/tree-view/focus.ts` の
`focusGraph` が担う。純粋関数なので、描画とは切り離してテストできる。
絞り込むのは描画に渡す家系図だけで、検索や人物メニューは絞り込み前のデータを見る。
絞り込み中は `computeLayout` に `ignoreManualPositions` を渡して自動配置で描く
（手動の座標は全体を前提にした値なので、一部だけを取り出すと取り残される）。
範囲の一番外側にいる人は `focusBoundary` で拾って薄く描く。「ここで切れているが、
その先にも家系は続く」と伝えるため。切り替えは `sceneKey` を変えてフェードでつなぐ。

**手で置けるのは横だけ。縦は必ず `世代 × 行の高さ` に置く。** 縦まで自由にすると、
カードの大きさや表示項目を変えて行の高さが変わったときに、保存済みの座標が
古い高さのまま取り残されて世代がそろわなくなる。ドラッグでも y は保存しない。
指でのドラッグは長押し（400ms）から始まる。なぞっただけで動くと、意図しない配置が
保存されて「勝手に固定された」ように見えるため。
まとめて戻したいときは「⋯ → 全体を自動配置に戻す」（`api.clearAllPositions`）。
あわせて、手で置いた親の下にいる自動配置の子は親の真下へ寄せ直す。この寄せは
下の世代へ連鎖するので、親を動かすとその家系がまとまってついてくる。
ただし寄せた先がふさがっているときは、ぶつかる手前で止める（重なりを作らないほうを優先）。

線が交わるところは「飛び越え」の弧で示す（`src/features/tree-view/hops.ts`）。
**横線が縦線をまたぐ**という回路図と同じ約束にしてある。横線はきょうだいの横棒と
夫婦線の2つだけなので、この2つを `<line>` ではなく `<path>`（`hopPath`）で描く。
同じ家族の縦線は横棒に「刺さって」いるだけなので、`owner` が同じものは交差に数えない。

**きょうだいの横棒の高さは `busLanes` が決める。** 放っておくと同じ世代に子を持つ家族の
横棒が全部同じ高さ（`世代 × ROW − vGap/2`）に並び、左右が重なると2本が1本に見える。
重なるものだけを 10px ずつ上へ逃がす（幹が潰れない範囲まで）。
`verticalSegments` と `FamilyLines` は必ずこの値を使うこと。片方だけ変えると弧がずれる。

⚠ y は `世代 × ROW` から決まる固定値なので、**手で書いた座標のテストだけでは足りない**。
段をずらす前は縦線が横棒の端点で終わるだけで、飛び越えが構造的に一度も出なかった。
`hops.integration.test.ts` が `computeLayout` を通した実座標で検証しているので、
交差まわりを触ったらここも必ず通すこと。

関係線は種別で描き分ける（仕様書 要件v4 3.5-3）。実子は一本の実線、養子・特別養子・
婿養子・連れ子・里子は破線、婚姻と死別は二重の実線、パートナーは一本の実線、離婚は破線。
種別は `FamilyUnit.childKinds`（子ごとの `ParentKind`）で描画側へ渡す。片方の親とだけ
縁組している子（連れ子など）は、縁組のほうを採って破線にする。
縁組や離婚がある家系図でだけ、左下に線の凡例を出す。
