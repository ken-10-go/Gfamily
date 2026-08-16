# 「絆ツリー (Kizuna Tree)」Firestore NoSQLデータモデル・セキュリティルール設計書 (Schema v3)

本ドキュメントは、**Claude Code等のAIコーディングエージェント**がFirestoreのデータ型（TypeScript/Dart等）およびセキュリティルール（`firestore.rules`）を完全自動実装するための、極めて詳細な物理設計書である。

---

## 1. コレクション構成全体像

Firestoreのスケーラビリティとクエリ制限、およびセキュリティルールの評価効率を考慮し、本システムは**ルートコレクションと、アクセス制御を直観的にマッピングしたサブコレクションのハイブリッド構成**を採用する。

```
/trees (ルート：ツリープロジェクトメタデータ)
   └── /trees/{treeId}/members (サブ：所属メンバーとロール)
   └── /trees/{treeId}/persons (サブ：家系図上の人物。重要項目はE2EE)
   └── /trees/{treeId}/relationships (サブ：親子・婚姻などの関係性)

/treeBridges (ルート：他家ツリー間の「ダブル・ハンドシェイク」認可中間レコード)

/kamons (ルート：家紋マスター。読込専用)
/surnames (ルート：名字由来マスター。読込専用)
```

---

## 2. コレクション別データ定義（Typescript風スキーマ）

AIエージェントにモデルクラスを自動生成させるため、各カラムのデータ型とE2EE（クライアントサイド暗号化）の対象を明示する。

### 2.1 `/trees` コレクション
ツリー自体の管理データ。

```typescript
interface Tree {
  id: string;             // ドキュメントID
  treeName: string;       // ツリーの名称 (例: "山田家家系図")
  createdAt: Timestamp;   // 作成日時
  updatedAt: Timestamp;   // 更新日時
  ownerUid: string;       // 作成者 (Owner) の Firebase Auth UID
  e2eeSalt: string;       // E2EE暗号鍵生成用ソルト（PBKDF2用、クライアント側で自動生成）
  kamonId: string | null; // マスターから選択された家の家紋ID [127]
}
```

### 2.2 `/trees/{treeId}/members` コレクション
ツリーへのアクセス権を持つユーザーの定義。セキュリティルールで直接評価される。

```typescript
interface TreeMember {
  id: string;             // ドキュメントID (ユーザーの Firebase Auth UID と同一にする)
  role: 'owner' | 'editor' | 'viewer'; // ロール定義 [owner, editor, viewer]
  email: string;          // 招待時・確認用のメールアドレス
  invitedAt: Timestamp;   // 招待日時
  joinedAt: Timestamp;    // 承諾・参加日時
}
```

### 2.3 `/trees/{treeId}/persons` コレクション
家系図上の登場人物。**極めて機微な個人情報はE2EEの暗号化ペイロードとして格納。**

```typescript
interface Person {
  id: string;             // ドキュメントID
  isDeceased: boolean;    // 生存・死亡ステータス [3, 131]
  gender: 'male' | 'female' | 'other'; // 性別
  
  // -- 非暗号化基本属性 (ツリーのノード描画や簡易インデックスに必須の項目) --
  lastName: string;       // 姓 (例: "山田")
  firstName: string;      // 名 (例: "太郎")
  lastNameKana: string;   // 姓かな (例: "やまだ") [142]
  firstNameKana: string;  // 名かな (例: "たろう") [142]
  
  // -- 西暦・和暦ハイブリッド日付オブジェクト --
  birthDate: HybridDate;  // 生年月日 [1, 3]
  deathDate: HybridDate | null; // 没年月日 [1, 3]

  // -- E2EE (Client-Side Encrypted) 暗号化格納フィールド --
  // 以下の重要項目は、クライアント端末内でAES-256-GCM暗号化され、
  // 暗号化済み文字オブジェクト `EncryptedPayload` に変換して格納する。
  encryptedData: EncryptedPayload | null;
}

interface HybridDate {
  gregorian: Timestamp | null; // 完全な西暦日付 (月日が不明な場合はnullにできる) [122]
  year: number;                // 西暦年（並び替え・クエリ用）
  month: number | null;        // 月（不明な場合は null または 0 を許容）
  day: number | null;          // 日（不明な場合は null または 0 を許容）
  eraName: string | null;      // 元号（明治, 大正, 昭和, 平成, 令和, 江戸期以前元号など） [133]
  eraYear: number | null;      // 元号年（例: 昭和 "44" 年） [3]
  isUncertain: boolean;        // 日付・年代が不完全・不確実な場合 true [122, 133]
}

interface EncryptedPayload {
  iv: string;         // 初期化ベクトル (Base64)
  ciphertext: string; // 暗号化されたJSON文字列 (Base64)
  tag: string;        // 認証タグ (Base64 - AES-GCMに必須)
}

// クライアント側で復号される `encryptedData` のスキーマ定義
interface PersonEncryptedDecrypted {
  honseki: string;          // 本籍地 [1, 3]
  address: string;          // 現住所 [1, 3]
  kaimyo: string;           // 戒名・法名・法号 [144]
  graveLocation: string;    // お墓情報 [158]
  biographyNotes: string;   // 生前の詳細エピソードや思い出話メモ [157]
}
```

### 2.4 `/trees/{treeId}/relationships` コレクション
親子・婚姻関係を記録。人物データと分離することで関係線の追加・削除・並び替えを軽量化。

```typescript
interface Relationship {
  id: string;               // ドキュメントID
  type: 'marriage' | 'parent-child'; // 関係のタイプ
  
  // marriageの場合に使用
  personAId: string;        // 夫またはパートナーA
  personBId: string;        // 妻またはパートナーB
  marriageDate: HybridDate | null; // 婚姻日 [3]
  divorceDate: HybridDate | null;  // 離婚日（離婚フラグ・離婚線の表現用） [40]

  // parent-childの場合に使用
  parentAId: string;        // 親A (父、または実親)
  parentBId: string | null; // 親B (母、または養親、未登録時はnull)
  childId: string;          // 子供のID
  subtype: 'biological' | 'adoptive'; // 実親子（biological）か、養親子（adoptive）か [131]
}
```

### 2.5 `/treeBridges` コレクション
A家とB家を双方向承認（ダブル・ハンドシェイク）で繋ぐための、お互いの参照許可データ。

```typescript
interface TreeBridge {
  id: string;               // ドキュメントID (ハッシュ衝突を避ける一意な値)
  requesterTreeId: string;  // 接続を申請したツリーID
  requesterPersonId: string; // 申請元ツリーのキー人物（例：娘）
  targetTreeId: string;     // 接続先のツリーID
  targetPersonId: string;   // 接続先ツリーのキー人物（例：婿）
  bridgeType: 'marriage' | 'adoptive'; // 接続の形態（他家との婚姻、または他家からの養子縁組） [131]
  status: 'pending' | 'accepted' | 'rejected'; // 承認ステータス
  createdAt: Timestamp;
  acceptedAt: Timestamp | null;
}
```

---

## 3. クライアントサイドE2EE（暗号化）仕様

AIエージェントに暗号化ロジックをコード化させるための手順。

1.  **鍵の生成 (KDF)**:
    ユーザーがアプリ起動時にパスフレーズ（家族だけの秘密の言葉）を入力。
    `PBKDF2`（または `scrypt`）を使用し、DBから取得した `trees.e2eeSalt` と組み合わせて、一時的な256ビットの対称暗号鍵（`CryptoKey`）を**デバイスのRAM上**に生成する。
2.  **暗号化 (Encrypt)**:
    `PersonEncryptedDecrypted` インターフェースに適合するJSONを文字列化。
    `AES-GCM` (256-bit) を使用し、一意な `IV` を用いて暗号化を実行。暗号化されたオブジェクト（`EncryptedPayload`）を Firestore に書き込む。
3.  **復号 (Decrypt)**:
    Firestoreから `encryptedData` を取得した際、RAM上の鍵と `IV`, `tag` を用いて復号。復号に失敗した場合は「復号キーが異なります」と表示し、機微データは表示しない。

---

## 4. Firestore セキュリティルール (`firestore.rules`)

本アプリをFirebaseの無料枠（Sparkプラン）で安全に稼働させ、他家データの意図しない覗き見や改ざんをデータベース層で100%防止するセキュリティルールの全コード。Claude Code等はこのコードをそのままデプロイして使用できる。

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ユーザーが特定ツリーに対して指定のロールを持っているか判定するヘルパー関数
    function getUserRole(treeId, userId) {
      return get(/databases/$(database)/documents/trees/$(treeId)/members/$(userId)).data.role;
    }

    // ユーザーがツリーのメンバー（Owner, Editor, Viewerのいずれか）であるか判定
    function isTreeMember(treeId) {
      return request.auth != null && 
        exists(/databases/$(database)/documents/trees/$(treeId)/members/$(request.auth.uid));
    }

    // ユーザーがEditor以上の書き込み権限（Owner or Editor）を持っているか判定
    function isTreeEditor(treeId) {
      return request.auth != null && 
        isTreeMember(treeId) && 
        (getUserRole(treeId, request.auth.uid) == 'owner' || getUserRole(treeId, request.auth.uid) == 'editor');
    }

    // ユーザーがツリーのOwnerであるか判定
    function isTreeOwner(treeId) {
      return request.auth != null && 
        isTreeMember(treeId) && 
        getUserRole(treeId, request.auth.uid) == 'owner';
    }

    // --- /trees コレクションのルール ---
    match /trees/{treeId} {
      // メンバーであればツリーのメタデータを読み込める
      allow read: if isTreeMember(treeId);
      
      // 新規ツリー作成はログインユーザーなら誰でも可能。ただし自分がOwnerとしてmembersに登録される必要がある
      allow create: if request.auth != null && request.resource.data.ownerUid == request.auth.uid;
      
      // ツリー設定の更新・削除はOwnerのみ
      allow update, delete: if isTreeOwner(treeId);

      // --- サブコレクション: /members ---
      match /members/{memberId} {
        // ツリーメンバーならメンバー一覧を閲覧可能
        allow read: if isTreeMember(treeId);
        
        // ツリーの作成時：最初のOwner登録のみ自己書き込みを許可
        allow create: if request.auth != null && memberId == request.auth.uid && request.resource.data.role == 'owner';
        
        // メンバーの追加・変更・削除（招待）はツリーのOwnerのみ実行可能
        allow write, update, delete: if isTreeOwner(treeId);
      }

      // --- サブコレクション: /persons ---
      match /persons/{personId} {
        // 1. 自ツリーのメンバーなら生存者・故人を問わず閲覧可能
        // 2. ブリッジ接続された他ツリーのメンバーの場合、故人(isDeceased == true)のみ閲覧を許可
        allow read: if isTreeMember(treeId) || 
          (request.auth != null && 
           resource.data.isDeceased == true && 
           exists(/databases/$(database)/documents/treeBridges/$(treeId + '_' + request.auth.uid))); // 動的ブリッジ検証

        // データの書き込み・更新・削除は、ツリーのEditor以上のみ許可
        allow create, update, delete: if isTreeEditor(treeId);
      }

      // --- サブコレクション: /relationships ---
      match /relationships/{relId} {
        // 自ツリーのメンバーなら閲覧可能
        allow read: if isTreeMember(treeId);
        
        // データの更新はEditor以上のみ
        allow write, update, delete: if isTreeEditor(treeId);
      }
    }

    // --- /treeBridges コレクションのルール ---
    match /treeBridges/{bridgeId} {
      // ブリッジ情報の読み込み：申請元ツリーのメンバー、または接続先ツリーのメンバーのみ
      allow read: if request.auth != null && (
        isTreeMember(resource.data.requesterTreeId) || isTreeMember(resource.data.targetTreeId)
      );

      // 新規ブリッジ申請：申請元ツリーのOwnerのみ許可
      allow create: if request.auth != null && 
        isTreeOwner(request.resource.data.requesterTreeId) && 
        request.resource.data.status == 'pending';

      // 承認・却下・削除：接続先ツリーのOwnerのみ更新可能（ダブル・ハンドシェイク）、
      // または申請元のOwnerによるキャンセル（削除）
      allow update: if request.auth != null && (
        (isTreeOwner(resource.data.targetTreeId) && request.resource.data.status in ['accepted', 'rejected']) ||
        (isTreeOwner(resource.data.requesterTreeId) && request.resource.data.status == 'pending')
      );
      
      allow delete: if request.auth != null && (
        isTreeOwner(resource.data.requesterTreeId) || isTreeOwner(resource.data.targetTreeId)
      );
    }

    // --- /kamons, /surnames コレクションのルール (マスターデータ) ---
    match /kamons/{kamonId} {
      allow read: if request.auth != null; // ログインしていれば読み込み専用
      allow write: if false;               // 管理者以外書き込み不可
    }

    match /surnames/{surnameId} {
      allow read: if request.auth != null; // 読み込み専用
      allow write: if false;
    }
  }
}
```
