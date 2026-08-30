import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { auditSentence, dayLabel, timeLabel } from '@/features/history/auditLabels';
import * as api from '@/lib/api';
import { displayName, type AuditLog, type Person, type TreeRole } from '@/types/models';

/** 一度に読む件数。家族の規模ならこれで足りる（絞り込みは画面側で行う） */
const MAX_LOGS = 300;

/**
 * 変更履歴。誰がいつ何を変えたのかを、メンバーごとに追える。
 *
 * オーナーだけに出す。誰が何をしたかは、家族のあいだでは重い情報で、
 * 全員に見せると「見張られている」ようにも受け取られるため。
 */
export function AuditPage() {
  const { treeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const member = params.get('member') ?? '';

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [persons, setPersons] = useState<Map<string, Person>>(new Map());
  const [members, setMembers] = useState<string[]>([]);
  const [role, setRole] = useState<TreeRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const myRole = await api.getMyRole(treeId);
      setRole(myRole);
      if (myRole !== 'owner') return;

      // 消された人物も名前を引けるようにしておく（記録に残るのは消す前の人が多い）
      const [list, graph, deleted, memberList] = await Promise.all([
        api.listAuditLogs(treeId, MAX_LOGS),
        api.loadTreeGraph(treeId),
        api.listDeletedPersons(treeId),
        api.listMembers(treeId),
      ]);
      setLogs(list);
      setPersons(new Map([...graph.persons, ...deleted].map((person) => [person.id, person])));
      setMembers(memberList.map((entry) => entry.userId));
      setNames(await api.listNicknames(memberList.map((entry) => entry.userId)));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) return <p className="page__status">読み込み中…</p>;

  if (role !== 'owner') {
    return (
      <main className="page">
        <p>
          <Link to={`/trees/${treeId}/settings`}>← 設定へ戻る</Link>
        </p>
        <h1>変更履歴</h1>
        <p className="note">この画面はオーナーだけが見られます。</p>
      </main>
    );
  }

  const nameOf = (uid: string | null) => (uid ? (names.get(uid) ?? null) : null);

  /** 記録の対象になった人物の名前。消えていて引けなければ null */
  const personName = (personId: string | null) => {
    const person = personId ? persons.get(personId) : undefined;
    return person ? displayName(person) : null;
  };
  const shown = member ? logs.filter((log) => log.actorId === member) : logs;

  // 同じ日はひとまとめにする。1行ずつ日付が並ぶと、かえって読みにくい
  const days: { day: string; entries: AuditLog[] }[] = [];
  for (const log of shown) {
    const day = dayLabel(log.createdAt);
    const last = days.at(-1);
    if (last && last.day === day) last.entries.push(log);
    else days.push({ day, entries: [log] });
  }

  return (
    <main className="page">
      <p>
        <Link to={`/trees/${treeId}/settings`}>← 設定へ戻る</Link>
      </p>
      <h1>変更履歴</h1>

      {error && <p className="alert alert--error">{error}</p>}

      <label className="field">
        <span className="field__label">メンバーで絞り込む</span>
        <select
          value={member}
          onChange={(event) => {
            const next = event.target.value;
            setParams(next ? { member: next } : {});
          }}
        >
          <option value="">全員</option>
          {members.map((uid) => (
            <option key={uid} value={uid}>
              {nameOf(uid) ?? '（名前未設定）'}
            </option>
          ))}
        </select>
      </label>

      {logs.length === 0 ? (
        <p className="note">まだ記録はありません。</p>
      ) : shown.length === 0 ? (
        <p className="note">この方の記録はありません。</p>
      ) : (
        days.map((group) => (
          <section key={group.day} className="audit__day">
            <h2>{group.day}</h2>
            <ul className="audit">
              {group.entries.map((log) => (
                <li key={log.id} className="audit__item">
                  <span className="audit__time">{timeLabel(log.createdAt)}</span>
                  <span>{auditSentence(log, nameOf(log.actorId), personName(log.entityId))}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <p className="note">
        新しいものから最大{MAX_LOGS}件を出しています。 完全に削除したときだけは、消した人ではなく
        <strong>最後にその人を編集した人</strong>
        が残ります（記録のしくみ上の限りです）。
      </p>
    </main>
  );
}
