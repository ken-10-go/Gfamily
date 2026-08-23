// @vitest-environment node
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
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
    await assertFails(
      updateDoc(personDoc(as(env, VIEWER)), { givenName: '改ざん', updatedBy: VIEWER }),
    );
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
      addDoc(personsCol(as(env, EDITOR)), {
        givenName: '花子',
        deletedAt: null,
        updatedBy: EDITOR,
      }),
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

describe('機微項目（端末で暗号化した本籍地・戒名など）', () => {
  const payload = { iv: 'aXY=', ciphertext: 'Y2lwaGVy', tag: 'dGFn' };

  it('暗号化された形なら保存できる', async () => {
    await assertSucceeds(
      addDoc(personsCol(as(env, EDITOR)), {
        givenName: '暗号あり',
        deletedAt: null,
        updatedBy: EDITOR,
        encryptedData: payload,
      }),
    );
  });

  it('null（機微項目なし）でも保存できる', async () => {
    await assertSucceeds(
      addDoc(personsCol(as(env, EDITOR)), {
        givenName: '暗号なし',
        deletedAt: null,
        updatedBy: EDITOR,
        encryptedData: null,
      }),
    );
  });

  it('決めた形以外は受け付けない（平文を紛れ込ませない）', async () => {
    await assertFails(
      addDoc(personsCol(as(env, EDITOR)), {
        givenName: '平文',
        deletedAt: null,
        updatedBy: EDITOR,
        encryptedData: { ...payload, honseki: '東京都千代田区永田町1-7-1' },
      }),
    );
  });

  it('大きすぎる暗号文は受け付けない', async () => {
    await assertFails(
      addDoc(personsCol(as(env, EDITOR)), {
        givenName: '巨大',
        deletedAt: null,
        updatedBy: EDITOR,
        encryptedData: { ...payload, ciphertext: 'x'.repeat(30001) },
      }),
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

  it('ツリーを直接削除できない（Functions 経由のみ）', async () => {
    // 直接消すとサブコレクションが残り、個人情報が到達不能なまま保持されてしまう
    await assertFails(deleteDoc(doc(as(env, OWNER), 'trees', TREE)));
  });

  it('createdBy を書き換えられない', async () => {
    await assertFails(updateDoc(doc(as(env, OWNER), 'trees', TREE), { createdBy: OUTSIDER }));
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

describe('家（ツリーの中の、血のつながりでまとまった一群）', () => {
  const houses = (uid: string) => collection(as(env, uid), 'trees', TREE, 'houses');

  it('メンバーは読める', async () => {
    await assertSucceeds(getDocs(houses(VIEWER)));
  });

  it('非メンバーは読めない', async () => {
    await assertFails(getDocs(houses(OUTSIDER)));
  });

  it('編集者は登録できる', async () => {
    await assertSucceeds(addDoc(houses(EDITOR), { name: '後藤家', updatedBy: EDITOR }));
  });

  it('閲覧者は登録できない', async () => {
    await assertFails(addDoc(houses(VIEWER), { name: '後藤家', updatedBy: VIEWER }));
  });

  it('実行者を詐称した登録は弾く', async () => {
    await assertFails(addDoc(houses(EDITOR), { name: '後藤家', updatedBy: OWNER }));
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

  it('オーナーは消せる（残したくない記録を消せるようにするため）', async () => {
    await assertSucceeds(deleteDoc(doc(as(env, OWNER), 'trees', TREE, 'auditLogs', 'log-1')));
  });

  it('編集者は消せない', async () => {
    await assertFails(deleteDoc(doc(as(env, EDITOR), 'trees', TREE, 'auditLogs', 'log-1')));
  });

  it('オーナーでも改ざんできない', async () => {
    await assertFails(
      updateDoc(doc(as(env, OWNER), 'trees', TREE, 'auditLogs', 'log-1'), { actorId: OUTSIDER }),
    );
  });
});

// --- 他家とのつながり（ダブル・ハンドシェイク） ------------------------------
//
// 仕様書 security-specs-v3 の「必須実装テストケース」に対応する。
// B家（tree-2）を用意し、承認の前後で見え方が変わることを確かめる。

const OTHER_TREE = 'tree-2';
const OTHER_OWNER = 'other-owner-uid';
const OTHER_DECEASED = 'other-deceased';
const OTHER_LIVING = 'other-living';

/** B家と、その中の故人・生存者を用意する。 */
async function seedOtherTree() {
  await seed(env, async (db) => {
    await setDoc(doc(db, 'trees', OTHER_TREE), {
      name: '佐藤家',
      description: null,
      createdBy: OTHER_OWNER,
      roles: { [OTHER_OWNER]: 'owner' },
      memberIds: [OTHER_OWNER],
    });
    await setDoc(doc(db, 'trees', OTHER_TREE, 'persons', OTHER_DECEASED), {
      familyName: '佐藤',
      givenName: '茂',
      isLiving: false,
      deletedAt: null,
      updatedBy: OTHER_OWNER,
    });
    await setDoc(doc(db, 'trees', OTHER_TREE, 'persons', OTHER_LIVING), {
      familyName: '佐藤',
      givenName: '花子',
      isLiving: true,
      deletedAt: null,
      updatedBy: OTHER_OWNER,
    });
    await setDoc(doc(db, 'trees', OTHER_TREE, 'unions', 'union-1'), {
      partner1Id: OTHER_DECEASED,
      partner2Id: OTHER_LIVING,
      deletedAt: null,
      updatedBy: OTHER_OWNER,
    });
  });
}

/** 承認時に Cloud Functions が配る認可の文書。 */
async function seedGrant(treeId: string, uid: string) {
  await seed(env, async (db) => {
    await setDoc(doc(db, 'treeBridges', `${treeId}_${uid}`), {
      grantForTreeId: treeId,
      grantedUid: uid,
      bridgeId: 'bridge-1',
    });
  });
}

const otherPerson = (db: ReturnType<typeof as>, personId: string) =>
  doc(db, 'trees', OTHER_TREE, 'persons', personId);

describe('他家とのつながり', () => {
  beforeEach(seedOtherTree);

  it('つながりが無ければ、他家は故人も生存者も読めない', async () => {
    const db = as(env, OWNER);
    await assertFails(getDoc(otherPerson(db, OTHER_DECEASED)));
    await assertFails(getDoc(otherPerson(db, OTHER_LIVING)));
  });

  it('申請しただけ（未承認）では、まだ読めない', async () => {
    // 承認前は認可の文書が配られないので、pending の申請があっても見えない
    await seed(env, async (db) => {
      await setDoc(doc(db, 'treeBridges', 'bridge-1'), {
        requesterTreeId: TREE,
        requesterPersonId: PERSON,
        requesterUid: OWNER,
        targetTreeId: null,
        status: 'pending',
      });
    });

    await assertFails(getDoc(otherPerson(as(env, OWNER), OTHER_DECEASED)));
  });

  it('【暫定】つながると、他家は存命の人も含めて読める', async () => {
    // 本来は故人だけ。締め直すときは OTHER_LIVING が読めないことを確かめる形に戻す
    await seedGrant(OTHER_TREE, OWNER);

    await assertSucceeds(getDoc(otherPerson(as(env, OWNER), OTHER_DECEASED)));
    await assertSucceeds(getDoc(otherPerson(as(env, OWNER), OTHER_LIVING)));
  });

  it('承認後も、他家のデータは書き換えられない', async () => {
    await seedGrant(OTHER_TREE, OWNER);

    await assertFails(
      updateDoc(otherPerson(as(env, OWNER), OTHER_DECEASED), {
        givenName: '書換',
        updatedBy: OWNER,
      }),
    );
  });

  it('関係（誰と誰がつながっているか）は読める。線が途切れると図にならないため', async () => {
    await seedGrant(OTHER_TREE, OWNER);

    await assertSucceeds(getDoc(doc(as(env, OWNER), 'trees', OTHER_TREE, 'unions', 'union-1')));
  });

  it('解除（認可の削除）で、ただちに読めなくなる', async () => {
    await seedGrant(OTHER_TREE, OWNER);
    await assertSucceeds(getDoc(otherPerson(as(env, OWNER), OTHER_DECEASED)));

    await seed(env, async (db) => {
      await deleteDoc(doc(db, 'treeBridges', `${OTHER_TREE}_${OWNER}`));
    });

    await assertFails(getDoc(otherPerson(as(env, OWNER), OTHER_DECEASED)));
  });

  /*
   * ⚠ 暫定。本来は「クライアントからは作れない」ことを確かめるテストだった。
   * 管理すべき家族の単位を決めたら、この2件を assertFails に戻し、
   * firestore.rules の treeBridges を allow write: if false に戻すこと。
   */
  it('【暫定】つながりをクライアントから作れる（自分に許可を配れてしまう）', async () => {
    await assertSucceeds(
      setDoc(doc(as(env, OWNER), 'treeBridges', `${OTHER_TREE}_${OWNER}`), {
        grantForTreeId: OTHER_TREE,
        grantedUid: OWNER,
      }),
    );
  });

  it('【暫定】自分に許可を配れば、無関係な家系図も読める', async () => {
    const db = as(env, OUTSIDER);
    await setDoc(doc(db, 'treeBridges', `${OTHER_TREE}_${OUTSIDER}`), {
      grantForTreeId: OTHER_TREE,
      grantedUid: OUTSIDER,
    });

    await assertSucceeds(getDoc(otherPerson(db, OTHER_LIVING)));
  });

  it('他人に配られた認可は読めない', async () => {
    await seedGrant(OTHER_TREE, OWNER);

    await assertFails(getDoc(doc(as(env, OUTSIDER), 'treeBridges', `${OTHER_TREE}_${OWNER}`)));
  });
});

describe('呼び名（プロフィール）', () => {
  it('本人は自分の呼び名を書ける', async () => {
    await assertSucceeds(
      setDoc(doc(as(env, VIEWER), 'profiles', VIEWER), { nickname: 'たろ', updatedAt: null }),
    );
  });

  it('他人の呼び名は書けない', async () => {
    await assertFails(
      setDoc(doc(as(env, VIEWER), 'profiles', EDITOR), { nickname: 'たろ', updatedAt: null }),
    );
  });

  it('長すぎる呼び名は保存できない', async () => {
    await assertFails(
      setDoc(doc(as(env, VIEWER), 'profiles', VIEWER), { nickname: 'あ'.repeat(21), updatedAt: null }),
    );
  });

  it('決めた項目以外は書けない', async () => {
    await assertFails(
      setDoc(doc(as(env, VIEWER), 'profiles', VIEWER), {
        nickname: 'たろ',
        updatedAt: null,
        role: 'owner',
      }),
    );
  });

  it('ログインしていれば他の人の呼び名も読める', async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, 'profiles', OWNER), { nickname: 'おや', updatedAt: null });
    });
    await assertSucceeds(getDoc(doc(as(env, VIEWER), 'profiles', OWNER)));
  });

  it('ログインしていないと読めない', async () => {
    await assertFails(getDoc(doc(asAnon(env), 'profiles', OWNER)));
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
