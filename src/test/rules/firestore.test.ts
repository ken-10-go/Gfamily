// @vitest-environment node
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { as, asAnon, createTestEnv, seed } from './harness';

const OWNER = 'owner-uid';
const EDITOR = 'editor-uid';
const VIEWER = 'viewer-uid';
const OUTSIDER = 'outsider-uid';
const TREE = 'tree-1';
const PERSON = 'person-1';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
}, 60_000);

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(env, async (db) => {
    await setDoc(doc(db, 'trees', TREE), {
      name: '山田家',
      description: null,
      createdBy: OWNER,
      roles: { [OWNER]: 'owner', [EDITOR]: 'editor', [VIEWER]: 'viewer' },
      memberIds: [OWNER, EDITOR, VIEWER],
    });
    await setDoc(doc(db, 'trees', TREE, 'persons', PERSON), {
      familyName: '山田',
      givenName: '太郎',
      isLiving: true,
      deletedAt: null,
      updatedBy: OWNER,
    });
    await setDoc(doc(db, 'trees', TREE, 'invitations', 'inv-1'), {
      tokenHash: 'a'.repeat(64),
      role: 'viewer',
      email: null,
    });
    await setDoc(doc(db, 'trees', TREE, 'auditLogs', 'log-1'), {
      actorId: OWNER,
      entity: 'persons',
      action: 'insert',
    });
  });
});

const personDoc = (db: ReturnType<typeof as>) => doc(db, 'trees', TREE, 'persons', PERSON);
const personsCol = (db: ReturnType<typeof as>) => collection(db, 'trees', TREE, 'persons');

describe('非メンバーの遮断', () => {
  it('ツリーを読めない', async () => {
    await assertFails(getDoc(doc(as(env, OUTSIDER), 'trees', TREE)));
  });

  it('人物を読めない', async () => {
    await assertFails(getDoc(personDoc(as(env, OUTSIDER))));
  });

  it('人物を書き込めない', async () => {
    await assertFails(
      addDoc(personsCol(as(env, OUTSIDER)), { givenName: '侵入者', updatedBy: OUTSIDER }),
    );
  });

  it('自分をメンバーに追加できない', async () => {
    await assertFails(
      updateDoc(doc(as(env, OUTSIDER), 'trees', TREE), {
        [`roles.${OUTSIDER}`]: 'owner',
        memberIds: [OWNER, EDITOR, VIEWER, OUTSIDER],
      }),
    );
  });

  it('未ログインでは何も読めない', async () => {
    await assertFails(getDoc(doc(asAnon(env), 'trees', TREE)));
    await assertFails(getDoc(personDoc(asAnon(env))));
  });

  it('他人のツリーを含む一覧クエリは拒否される', async () => {
    const db = as(env, OUTSIDER);
    await assertFails(getDocs(collection(db, 'trees')));
  });
});

describe('閲覧者の権限', () => {
  it('ツリー自体を読める', async () => {
    await assertSucceeds(getDoc(doc(as(env, VIEWER), 'trees', TREE)));
  });

  it('人物を読める', async () => {
    await assertSucceeds(getDoc(personDoc(as(env, VIEWER))));
  });

  it('自分が参加しているツリーの一覧を引ける', async () => {
    const db = as(env, VIEWER);
    await assertSucceeds(
      getDocs(query(collection(db, 'trees'), where('memberIds', 'array-contains', VIEWER))),
    );
  });

  it('人物を追加できない', async () => {
    await assertFails(
      addDoc(personsCol(as(env, VIEWER)), { givenName: '花子', updatedBy: VIEWER }),
    );
  });

  it('人物を編集できない', async () => {
    await assertFails(updateDoc(personDoc(as(env, VIEWER)), { givenName: '改ざん', updatedBy: VIEWER }));
  });

  it('招待を読めない', async () => {
    await assertFails(getDocs(collection(as(env, VIEWER), 'trees', TREE, 'invitations')));
  });

  it('権限を自分で昇格できない', async () => {
    await assertFails(
      updateDoc(doc(as(env, VIEWER), 'trees', TREE), { [`roles.${VIEWER}`]: 'owner' }),
    );
  });
});

describe('編集者の権限', () => {
  it('人物を追加できる', async () => {
    await assertSucceeds(
      addDoc(personsCol(as(env, EDITOR)), { givenName: '花子', deletedAt: null, updatedBy: EDITOR }),
    );
  });

  it('ソフト削除と復元ができる', async () => {
    const db = as(env, EDITOR);
    await assertSucceeds(updateDoc(personDoc(db), { deletedAt: new Date(), updatedBy: EDITOR }));
    await assertSucceeds(updateDoc(personDoc(db), { deletedAt: null, updatedBy: EDITOR }));
  });

  it('物理削除はできない', async () => {
    await assertFails(deleteDoc(personDoc(as(env, EDITOR))));
  });

  it('招待を作れない', async () => {
    await assertFails(
      addDoc(collection(as(env, EDITOR), 'trees', TREE, 'invitations'), { role: 'editor' }),
    );
  });

  it('メンバーの権限を変えられない', async () => {
    await assertFails(
      updateDoc(doc(as(env, EDITOR), 'trees', TREE), { [`roles.${EDITOR}`]: 'owner' }),
    );
  });
});

describe('実行者の詐称防止', () => {
  it('updatedBy に他人を書けない', async () => {
    // これを許すと監査ログの「誰が」が信用できなくなる
    await assertFails(
      addDoc(personsCol(as(env, EDITOR)), { givenName: 'なりすまし', updatedBy: OWNER }),
    );
  });

  it('updatedBy を省略できない', async () => {
    await assertFails(addDoc(personsCol(as(env, EDITOR)), { givenName: '記録なし' }));
  });
});

describe('オーナーの権限', () => {
  it('人物を物理削除できる', async () => {
    await assertSucceeds(deleteDoc(personDoc(as(env, OWNER))));
  });

  it('招待を読める', async () => {
    await assertSucceeds(getDocs(collection(as(env, OWNER), 'trees', TREE, 'invitations')));
  });

  it('招待をクライアントから書き換えられない', async () => {
    // 発行・受諾は Cloud Functions 経由に限る
    await assertFails(
      updateDoc(doc(as(env, OWNER), 'trees', TREE, 'invitations', 'inv-1'), { role: 'owner' }),
    );
  });

  it('メンバーの権限を変更できる', async () => {
    await assertSucceeds(
      updateDoc(doc(as(env, OWNER), 'trees', TREE), {
        roles: { [OWNER]: 'owner', [EDITOR]: 'viewer', [VIEWER]: 'viewer' },
        memberIds: [OWNER, EDITOR, VIEWER],
      }),
    );
  });

  it('最後のオーナーを降格できない', async () => {
    await assertFails(
      updateDoc(doc(as(env, OWNER), 'trees', TREE), {
        roles: { [OWNER]: 'viewer', [EDITOR]: 'editor', [VIEWER]: 'viewer' },
        memberIds: [OWNER, EDITOR, VIEWER],
      }),
    );
  });

  it('roles と memberIds が食い違う更新は拒否される', async () => {
    // ずれると一覧クエリと権限判定が食い違い、見えないツリーや消せないメンバーが生まれる
    await assertFails(
      updateDoc(doc(as(env, OWNER), 'trees', TREE), {
        roles: { [OWNER]: 'owner' },
        memberIds: [OWNER, EDITOR, VIEWER],
      }),
    );
  });

  it('createdBy を書き換えられない', async () => {
    await assertFails(
      updateDoc(doc(as(env, OWNER), 'trees', TREE), { createdBy: OUTSIDER }),
    );
  });
});

describe('ツリーの作成', () => {
  it('自分だけがオーナーのツリーを作れる', async () => {
    const db = as(env, OUTSIDER);
    await assertSucceeds(
      setDoc(doc(db, 'trees', 'new-tree'), {
        name: '新しい家',
        createdBy: OUTSIDER,
        roles: { [OUTSIDER]: 'owner' },
        memberIds: [OUTSIDER],
      }),
    );
  });

  it('作成と同時に他人を巻き込めない', async () => {
    const db = as(env, OUTSIDER);
    await assertFails(
      setDoc(doc(db, 'trees', 'new-tree-2'), {
        name: '勝手に招待',
        createdBy: OUTSIDER,
        roles: { [OUTSIDER]: 'owner', [OWNER]: 'viewer' },
        memberIds: [OUTSIDER, OWNER],
      }),
    );
  });

  it('他人名義では作れない', async () => {
    const db = as(env, OUTSIDER);
    await assertFails(
      setDoc(doc(db, 'trees', 'new-tree-3'), {
        name: '乗っ取り',
        createdBy: OWNER,
        roles: { [OWNER]: 'owner' },
        memberIds: [OWNER],
      }),
    );
  });

  it('自分を編集者にしたツリーは作れない（必ずオーナーで始まる）', async () => {
    const db = as(env, OUTSIDER);
    await assertFails(
      setDoc(doc(db, 'trees', 'new-tree-4'), {
        name: '権限ずらし',
        createdBy: OUTSIDER,
        roles: { [OUTSIDER]: 'editor' },
        memberIds: [OUTSIDER],
      }),
    );
  });
});

describe('監査ログ', () => {
  it('メンバーは読める', async () => {
    await assertSucceeds(getDocs(collection(as(env, VIEWER), 'trees', TREE, 'auditLogs')));
  });

  it('非メンバーは読めない', async () => {
    await assertFails(getDocs(collection(as(env, OUTSIDER), 'trees', TREE, 'auditLogs')));
  });

  it('オーナーでも書き込めない', async () => {
    await assertFails(
      addDoc(collection(as(env, OWNER), 'trees', TREE, 'auditLogs'), { action: 'insert' }),
    );
  });

  it('オーナーでも削除できない', async () => {
    await assertFails(deleteDoc(doc(as(env, OWNER), 'trees', TREE, 'auditLogs', 'log-1')));
  });

  it('オーナーでも改ざんできない', async () => {
    await assertFails(
      updateDoc(doc(as(env, OWNER), 'trees', TREE, 'auditLogs', 'log-1'), { actorId: OUTSIDER }),
    );
  });
});

describe('未定義のパス', () => {
  it('ルールに無いコレクションは読み書きできない', async () => {
    const db = as(env, OWNER);
    await assertFails(getDoc(doc(db, 'secrets', 'anything')));
    await assertFails(setDoc(doc(db, 'secrets', 'anything'), { value: 1 }));
  });
});

describe('テスト環境の健全性', () => {
  it('ルールを無効化した仕込みは成功している', async () => {
    // 仕込みが失敗していると「拒否された」のか「データが無い」のか区別できなくなる
    const snapshot = await getDoc(personDoc(as(env, OWNER)));
    expect(snapshot.exists()).toBe(true);
  });
});
