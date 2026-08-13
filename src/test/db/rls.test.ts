// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asUser, createTestDb, createTree, createUser, expectRejected, type Db } from './harness';

describe('RLS ポリシー', () => {
  let db: Db;
  let owner: string;
  let editor: string;
  let viewer: string;
  let outsider: string;
  let treeId: string;
  let personId: string;

  beforeAll(async () => {
    db = await createTestDb();

    owner = await createUser(db, 'owner@example.test');
    editor = await createUser(db, 'editor@example.test');
    viewer = await createUser(db, 'viewer@example.test');
    outsider = await createUser(db, 'outsider@example.test');

    treeId = await createTree(db, owner, '山田家');

    await asUser(db, owner, async () => {
      await db.query('insert into public.tree_members (tree_id, user_id, role) values ($1, $2, $3)', [
        treeId,
        editor,
        'editor',
      ]);
      await db.query('insert into public.tree_members (tree_id, user_id, role) values ($1, $2, $3)', [
        treeId,
        viewer,
        'viewer',
      ]);

      const result = await db.query<{ id: string }>(
        'insert into public.persons (tree_id, family_name, given_name) values ($1, $2, $3) returning id',
        [treeId, '山田', '太郎'],
      );
      personId = result.rows[0].id;
    });
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  describe('ツリー作成', () => {
    it('作成者が自動的にオーナーとして登録される', async () => {
      const role = await asUser(db, owner, async () => {
        const result = await db.query<{ role: string }>(
          'select role from public.tree_members where tree_id = $1 and user_id = $2',
          [treeId, owner],
        );
        return result.rows[0]?.role;
      });

      expect(role).toBe('owner');
    });

    it('trees への直接INSERTは禁じられている（RPC経由のみ）', async () => {
      const message = await expectRejected(() =>
        asUser(db, outsider, () =>
          db.query('insert into public.trees (name, created_by) values ($1, $2)', [
            '乗っ取り',
            owner,
          ]),
        ),
      );

      expect(message).toMatch(/permission denied/i);
    });

    it('RPCで作ったツリーは作成者名義になる', async () => {
      const createdBy = await asUser(db, outsider, async () => {
        const created = await db.query<{ create_tree: string }>('select public.create_tree($1)', [
          '部外者の家',
        ]);
        const result = await db.query<{ created_by: string }>(
          'select created_by from public.trees where id = $1',
          [created.rows[0].create_tree],
        );
        return result.rows[0].created_by;
      });

      expect(createdBy).toBe(outsider);
    });
  });

  describe('非メンバーからの遮断', () => {
    it('所属していないツリーは見えない', async () => {
      const rows = await asUser(db, outsider, async () => {
        const result = await db.query('select id from public.trees where id = $1', [treeId]);
        return result.rows;
      });

      expect(rows).toHaveLength(0);
    });

    it('人物データが一切見えない', async () => {
      const rows = await asUser(db, outsider, async () => {
        const result = await db.query('select id from public.persons');
        return result.rows;
      });

      expect(rows).toHaveLength(0);
    });

    it('他ツリーへ人物を書き込めない', async () => {
      const message = await expectRejected(() =>
        asUser(db, outsider, () =>
          db.query('insert into public.persons (tree_id, given_name) values ($1, $2)', [
            treeId,
            '侵入者',
          ]),
        ),
      );

      expect(message).toMatch(/row-level security/i);
    });

    it('未ログイン(anon)では人物テーブルにアクセスできない', async () => {
      const message = await expectRejected(() =>
        asUser(db, null, () => db.query('select id from public.persons'), 'anon'),
      );

      expect(message).toMatch(/permission denied/i);
    });
  });

  describe('閲覧者の権限', () => {
    it('人物を読める', async () => {
      const rows = await asUser(db, viewer, async () => {
        const result = await db.query('select id from public.persons');
        return result.rows;
      });

      expect(rows).toHaveLength(1);
    });

    it('人物を追加できない', async () => {
      const message = await expectRejected(() =>
        asUser(db, viewer, () =>
          db.query('insert into public.persons (tree_id, given_name) values ($1, $2)', [
            treeId,
            '花子',
          ]),
        ),
      );

      expect(message).toMatch(/row-level security/i);
    });

    it('人物を編集できない', async () => {
      await asUser(db, viewer, async () => {
        const result = await db.query('update public.persons set given_name = $1 where id = $2', [
          '改ざん',
          personId,
        ]);
        // UPDATE は USING 句に阻まれ、対象0行として静かに終わる
        expect(result.affectedRows).toBe(0);
      });
    });

    it('招待レコードを読めない', async () => {
      await asUser(db, owner, () =>
        db.query('select public.create_invitation($1, $2, $3, $4)', [treeId, 'viewer', null, 7]),
      );

      const rows = await asUser(db, viewer, async () => {
        const result = await db.query('select id from public.invitations');
        return result.rows;
      });

      expect(rows).toHaveLength(0);
    });
  });

  describe('編集者の権限', () => {
    it('人物を追加できる', async () => {
      const rows = await asUser(db, editor, async () => {
        const result = await db.query(
          'insert into public.persons (tree_id, family_name, given_name) values ($1, $2, $3) returning id',
          [treeId, '山田', '花子'],
        );
        return result.rows;
      });

      expect(rows).toHaveLength(1);
    });

    it('物理削除はできない（ソフト削除を使う）', async () => {
      await asUser(db, editor, async () => {
        const result = await db.query('delete from public.persons where id = $1', [personId]);
        expect(result.affectedRows).toBe(0);
      });
    });

    it('ソフト削除と復元ができる', async () => {
      await asUser(db, editor, async () => {
        const deleted = await db.query('update public.persons set deleted_at = now() where id = $1', [
          personId,
        ]);
        expect(deleted.affectedRows).toBe(1);

        const restored = await db.query(
          'update public.persons set deleted_at = null where id = $1',
          [personId],
        );
        expect(restored.affectedRows).toBe(1);
      });
    });

    it('招待を発行できない', async () => {
      const message = await expectRejected(() =>
        asUser(db, editor, () =>
          db.query('select public.create_invitation($1, $2, $3, $4)', [treeId, 'viewer', null, 7]),
        ),
      );

      expect(message).toContain('招待を作成する権限がありません');
    });
  });

  describe('監査ログ', () => {
    it('人物の変更が記録される', async () => {
      const rows = await asUser(db, owner, async () => {
        const result = await db.query<{ action: string; actor_id: string }>(
          "select action, actor_id from public.audit_logs where entity = 'persons' and entity_id = $1 order by id",
          [personId],
        );
        return result.rows;
      });

      expect(rows[0]).toMatchObject({ action: 'insert', actor_id: owner });
      expect(rows.map((r) => r.action)).toContain('delete');
      expect(rows.map((r) => r.action)).toContain('restore');
    });

    it('クライアントからは書き換えられない', async () => {
      const insertMessage = await expectRejected(() =>
        asUser(db, owner, () =>
          db.query(
            "insert into public.audit_logs (tree_id, entity, action) values ($1, 'persons', 'insert')",
            [treeId],
          ),
        ),
      );
      expect(insertMessage).toMatch(/permission denied/i);

      const deleteMessage = await expectRejected(() =>
        asUser(db, owner, () => db.query('delete from public.audit_logs where tree_id = $1', [treeId])),
      );
      expect(deleteMessage).toMatch(/permission denied/i);
    });
  });

  describe('オーナーの保護', () => {
    it('最後のオーナーは降格できない', async () => {
      const message = await expectRejected(() =>
        asUser(db, owner, () =>
          db.query(
            "update public.tree_members set role = 'viewer' where tree_id = $1 and user_id = $2",
            [treeId, owner],
          ),
        ),
      );

      expect(message).toContain('最低1人のオーナーが必要です');
    });

    it('最後のオーナーは脱退できない', async () => {
      const message = await expectRejected(() =>
        asUser(db, owner, () =>
          db.query('delete from public.tree_members where tree_id = $1 and user_id = $2', [
            treeId,
            owner,
          ]),
        ),
      );

      expect(message).toContain('最低1人のオーナーが必要です');
    });
  });
});

describe('招待フロー', () => {
  let db: Db;
  let owner: string;
  let guest: string;
  let treeId: string;

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, 'owner2@example.test');
    guest = await createUser(db, 'guest@example.test');
    treeId = await createTree(db, owner, '佐藤家');
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  async function issueInvitation(
    role = 'viewer',
    email: string | null = null,
    days = 7,
  ): Promise<string> {
    return asUser(db, owner, async () => {
      const result = await db.query<{ create_invitation: string }>(
        'select public.create_invitation($1, $2, $3, $4)',
        [treeId, role, email, days],
      );
      return result.rows[0].create_invitation;
    });
  }

  it('平文トークンはDBに保存されない', async () => {
    const token = await issueInvitation();

    const rows = await asUser(db, owner, async () => {
      const result = await db.query<{ token_hash: string }>(
        'select token_hash from public.invitations',
      );
      return result.rows;
    });

    expect(rows.every((r) => r.token_hash !== token)).toBe(true);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('有効な招待を受諾するとメンバーになる', async () => {
    const token = await issueInvitation('editor');

    const acceptedTreeId = await asUser(db, guest, async () => {
      const result = await db.query<{ accept_invitation: string }>(
        'select public.accept_invitation($1)',
        [token],
      );
      return result.rows[0].accept_invitation;
    });

    expect(acceptedTreeId).toBe(treeId);

    const role = await asUser(db, guest, async () => {
      const result = await db.query<{ role: string }>(
        'select role from public.tree_members where tree_id = $1 and user_id = $2',
        [treeId, guest],
      );
      return result.rows[0]?.role;
    });

    expect(role).toBe('editor');
  });

  it('同じ招待は再利用できない', async () => {
    const token = await issueInvitation();
    await asUser(db, guest, () => db.query('select public.accept_invitation($1)', [token]));

    const message = await expectRejected(() =>
      asUser(db, guest, () => db.query('select public.accept_invitation($1)', [token])),
    );

    expect(message).toContain('無効か、有効期限が切れています');
  });

  it('存在しないトークンは拒否される', async () => {
    const message = await expectRejected(() =>
      asUser(db, guest, () => db.query('select public.accept_invitation($1)', ['deadbeef'])),
    );

    expect(message).toContain('無効か、有効期限が切れています');
  });

  it('期限切れの招待は拒否される', async () => {
    const token = await issueInvitation();
    await db.query(
      "update public.invitations set expires_at = now() - interval '1 day' where accepted_at is null and token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')",
      [token],
    );

    const message = await expectRejected(() =>
      asUser(db, guest, () => db.query('select public.accept_invitation($1)', [token])),
    );

    expect(message).toContain('無効か、有効期限が切れています');
  });

  it('取り消した招待は拒否される', async () => {
    const token = await issueInvitation();
    await asUser(db, owner, () =>
      db.query(
        "update public.invitations set revoked_at = now() where token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')",
        [token],
      ),
    );

    const message = await expectRejected(() =>
      asUser(db, guest, () => db.query('select public.accept_invitation($1)', [token])),
    );

    expect(message).toContain('無効か、有効期限が切れています');
  });

  it('メール指定の招待は宛先本人しか受諾できない', async () => {
    const token = await issueInvitation('viewer', 'someone-else@example.test');

    const message = await expectRejected(() =>
      asUser(db, guest, () => db.query('select public.accept_invitation($1)', [token])),
    );

    expect(message).toContain('別のメールアドレス宛です');
  });

  it('オーナー権限の招待は発行できない', async () => {
    const message = await expectRejected(() => issueInvitation('owner'));

    expect(message).toMatch(/オーナー権限の招待は作成できません|invitations_role_not_owner/);
  });

  it('プレビューはツリー名と権限だけを返す', async () => {
    const token = await issueInvitation('viewer');

    const rows = await asUser(db, guest, async () => {
      const result = await db.query('select * from public.invitation_preview($1)', [token]);
      return result.rows;
    });

    expect(rows).toEqual([{ tree_name: '佐藤家', role: 'viewer', requires_email: null }]);
  });
});
