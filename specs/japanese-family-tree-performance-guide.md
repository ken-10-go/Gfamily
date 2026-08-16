# 家系図アプリ開発仕様書：ノードのドラッグ操作と高性能再描画制御案 (Performance & Rendering Guide v1)

本ドキュメントは、スマートフォンの限られたリソース環境において、数百人規模の複雑な家系図ノード（人物カード）をスムーズにドラッグ操作し、カクつき（フレームドロップ）のない60fps/120fpsの滑らかな再描画（レンダリング）を実現するためのフロントエンド技術仕様書です。

Claude Code等のAIエージェントにそのままインプットとして与えることで、Flutter (CustomPainter / InteractiveViewer) でのパフォーマンス最適化コードを自律的に生成・実装させることができます。

---

## 1. パフォーマンス上の3大課題と解決アプローチ

家系図をドラッグ操作・並び替え（スワップ）する際、単純な状態更新（`setState` など）を行うと、以下の原因で極端なパフォーマンス低下が発生します：

1. **ツリー全体のリビルド（O(N)）**: 1つのノードを動かすたびに、関係のない数世代分のノードやエッジ（線）まで再レンダリングされる。
2. **関係線（エッジ）の再計算コスト**: 複雑に絡み合う実親子、夫婦（二重線）、養親子（破線）のパス（Path）再計算およびCanvasへの再描画が毎フレーム走る。
3. **Firestore同期のオーバーヘッド**: ドラッグ中の位置情報をリアルタイムにクラウドに書き込むと、無料枠を瞬時に消費し、ネットワーク遅延で操作がフリーズする。

### 💡 解決のためのアプローチ（コア戦略）

```
[ ドラッグ中 (毎フレーム 60〜120Hz) ]
 ├── 1. UIの分離: ドラッグ対象ノードを独立した Overlay/RepaintBoundary に分離 (GPUスレッドで移動)
 ├── 2. ローカル計算: 位置情報はローカルの ValueNotifier で閉鎖（Firestoreへの送信は完全ブロック）
 └── 3. エッジの簡易描画: 移動中のノードに接続する線のみ、軽量な直線（Bezier曲線を一時無効化）で瞬時更新

[ ドラッグ終了時 (On Drag End) ]
 ├── 1. 衝突判定 (Collision Detection): 兄弟姉妹の境界ボックス（X座標）を判定し、並び順 (sortOrder) をローカルスワップ
 ├── 2. バックグラウンドレイアウト: Isolate (別スレッド) で系図全体の座標を再計算
 └── 3. トランザクション保存: 変更された `sortOrder` や `x/y座標` のみ、Firestoreにバッチ(WriteBatch)で一括同期
```

---

## 2. Flutter (Dart) 実装における最適化アーキテクチャ

### ① `RepaintBoundary` によるペイントの分離
ドラッグ中のカードや接続線以外の「静止している背景や他の親族ノード」を別々の `RepaintBoundary` で囲むことで、Canvasのビットマップキャッシュを有効化し、再描画の範囲をドラッグ中の最小エリアのみに限定します。

```dart
// 描画バウンダリを分けるFlutter実装イメージ
Widget build(BuildContext context) {
  return InteractiveViewer(
    child: Stack(
      children: [
        // 1. 静的な背景や動かないノード・エッジのキャッシュレイヤー
        RepaintBoundary(
          child: StaticFamilyTreeCanvas(),
        ),
        // 2. ドラッグ中のノードのみ、独立したバウンダリで描画（ここだけ毎フレーム更新される）
        Positioned(
          left: draggingNodeX,
          top: draggingNodeY,
          child: RepaintBoundary(
            child: DraggingPersonCard(),
          ),
        ),
      ],
    ),
  );
}
```

### ② ビビューポートカリング（Viewport Culling）の導入
スマートフォンの画面（ビューポート）に表示されている領域のバウンディングボックスを計算し、画面外に隠れている親族カードやエッジをレンダリングツリーから除外、または `CustomPainter` の `paint` メソッド内で描画をスキップ（Cull）します。
これにより、何百人登録されていても、常に画面に見えている20〜30人分だけの最小計算量に固定されます。

---

## 3. 兄弟姉妹の直感的なドラッグ並び替え（スワップ）アルゴリズム

日本の伝統的な系図（縦書き・横書きを問わず）では、兄弟姉妹は「長男、次男、長女...」と誕生順（または慣習）に右から左、あるいは左から右へ厳密に並びます。すいすい家系図や他アプリの優れた操作性を踏襲し、長押しドラッグでこの兄弟の表示順を動的に入れ替えるアルゴリズムを定義します。

### 💻 衝突判定と `sortOrder` スワップ処理のDartコード

```dart
import 'package:flutter/material.dart';

class SiblingGroup {
  final String parentRelationshipId;
  List<SiblingNode> siblings; // 兄弟姉妹のリスト（現在の一時並び順）

  SiblingGroup({required this.parentRelationshipId, required this.siblings});

  /// ドラッグ中のノード位置をもとに、兄弟姉妹内の順序をリアルタイムで並び替える
  /// [draggedIndex] ドラッグ中ノードの現在のインデックス
  /// [currentLocalX] ドラッグ中ノードの現在のX座標（横書きの場合。縦書きの場合はY座標）
  /// [cardWidth] 各人物カードの横幅
  bool updateOrder(int draggedIndex, double currentLocalX, double cardWidth) {
    int targetIndex = draggedIndex;

    // 隣り合う兄弟カードの境界を越えたか判定
    if (draggedIndex > 0) {
      // 左側のカードの右端（中心点）を越えたか
      double leftBoundary = siblings[draggedIndex - 1].originalX + (cardWidth / 2);
      if (currentLocalX < leftBoundary) {
        targetIndex = draggedIndex - 1;
      }
    }
    if (draggedIndex < siblings.length - 1) {
      // 右側のカードの左端（中心点）を越えたか
      double rightBoundary = siblings[draggedIndex + 1].originalX - (cardWidth / 2);
      if (currentLocalX > rightBoundary) {
        targetIndex = draggedIndex + 1;
      }
    }

    if (targetIndex != draggedIndex) {
      // ローカル配列のインデックスをスワップして並び順を更新
      final temp = siblings.removeAt(draggedIndex);
      siblings.insert(targetIndex, temp);
      return true; // 並び順が変更されたので、ローカル再描画を要求
    }
    return false; // 順序変更なし
  }
}

class SiblingNode {
  final String personId;
  double originalX; // 整列時の初期X座標
  int sortOrder;    // データベース上の並び順重み

  SiblingNode({required this.personId, required this.originalX, required this.sortOrder});
}
```

---

## 4. クラウド同期（Firestore）の超低コスト化・バッチ制御

ドラッグ中のリアルタイムな再描画はローカルの `ValueNotifier` や `State` で極めて高速（ミリ秒以下）に行い、クラウドデータベースへの書き込みは「完全に静定した段階」で**1回のみ**に制限します。

### 💻 Firestoreへのバッチ保存と楽観的UI更新（Optimistic UI）
ドラッグが終了した瞬間（`onDragEnd`）、変更された兄弟姉妹グループの `sortOrder` だけを抽出し、Firestoreの `WriteBatch` を使って一括更新します。

```dart
import 'package:cloud_firestore/cloud_firestore.dart';

class SiblingOrderService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// ドラッグ操作が終了した段階で、変更された兄弟全員のsortOrderをバッチ更新する
  Future<void> saveNewSiblingOrder({
    required String treeId,
    required String parentRelationshipId,
    required List<SiblingNode> reorderedSiblings,
  }) async {
    final batch = _firestore.batch();

    // 1. ローカル上ではすでに並び替えが完了しているため、UIは即座に確定表示（楽観的更新）
    for (int i = 0; i < reorderedSiblings.length; i++) {
      final sibling = reorderedSiblings[i];
      final newSortOrder = i * 10; // 余裕を持たせたインデックス付け（間への挿入を考慮）

      if (sibling.sortOrder != newSortOrder) {
        // 実際に値が変わったドキュメントのみをバッチに格納（書き込み回数の節約）
        final personDocRef = _firestore
            .collection('trees')
            .doc(treeId)
            .collection('persons')
            .doc(sibling.personId);

        batch.update(personDocRef, {
          'sortOrder': newSortOrder,
          'updatedAt': FieldValue.serverTimestamp(),
        });
        
        // ローカルインスタンスの重みも更新
        sibling.sortOrder = newSortOrder;
      }
    }

    // 2. ネットワーク経由でバックグラウンド送信（UIスレッドを1ミリ秒もブロッキングしない）
    await batch.commit();
  }
}
```

---

## 5. Claude Code等のAIに本設計を指示・実装させるためのステップ

Claude Codeをプロジェクトディレクトリで起動し、以下の手順に沿って実装を自律実行させてください。

### AIへの詳細プロンプト指示（コピペ用）
> 「`japanese-family-tree-performance-guide.md` を読み込んでください。
> 本書第2項の『RepaintBoundaryを用いた描画分離』、第3項の『兄弟姉妹のスワップアルゴリズム』、および第4項の『Firestoreへのバッチ保存制御』を忠実に再現した Flutter の家系図ドラッグコンポーネントを `/lib/widgets/draggable_family_tree.dart` として実装してください。
> 
> 特に以下のパフォーマンス基準をクリアすること：
> 1. ドラッグイベントハンドラ (`onDragUpdate`) 内では一切の `setState` や外部書き込みを排除し、ドラッグ対象カードの位置のみを `ValueNotifier<Offset>` で監視・更新して描画を最小化すること。
> 2. `CustomPainter` 内でエッジ（接続線）を描画する際、ドラッグ中のノードに関連しない関係線のペイント（Bezier曲線計算等）をスキップするViewport境界クリッピングを適用すること。
> 3. ドラッグ終了後に、変更のあったノードの `sortOrder` をFirestoreに `writeBatch` を用いて一括同期するリポジトリメソッドを構築すること。」
