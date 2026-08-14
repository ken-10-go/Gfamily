import { useMemo, useState } from 'react';

import * as api from '@/lib/api';
import { ageLabel, formatWithEra } from '@/lib/japanese-date';
import { birthOrderLabel, siblingsOf } from '@/lib/relations';
import {
  displayName,
  displayNameKana,
  GENDER_LABELS,
  lifespanLabel,
  SURNAME_CHANGE_REASON_LABELS,
  UNION_STATUS_LABELS,
  type Person,
  type TreeGraph,
  type UnionStatus,
} from '@/types/models';

interface SpouseEntry {
  person: Person;
  status: UnionStatus;
  /** unions ドキュメントのID。関係だけを解消するときに使う。 */
  unionId: string;
}

interface ParentChildEntry {
  person: Person;
  /** parentChild ドキュメントのID。 */
  linkId: string;
}

interface PersonDetailProps {
  treeId: string;
  graph: TreeGraph;
  person: Person;
  canEdit: boolean;
  onSelectPerson: (personId: string) => void;
  onChanged: () => Promise<void>;
}

/** 人物の詳細と、つながっている家族。関係の解消もここから行う。 */
export function PersonDetail({
  treeId,
  graph,
  person,
  canEdit,
  onSelectPerson,
  onChanged,
}: PersonDetailProps) {
  const [error, setError] = useState<string | null>(null);
  const relations = useRelations(graph, person.id);

  /** 関係だけを解消する。人物そのものは残る。 */
  async function removeLink(kind: 'parentChild' | 'union', id: string, message: string) {
    if (!window.confirm(`${message}。よろしいですか？（人物は残ります）`)) return;

    setError(null);
    try {
      if (kind === 'parentChild') {
        await api.removeParentChild(treeId, id);
      } else {
        await api.removeUnion(treeId, id);
      }
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '関係の解消に失敗しました');
    }
  }

  /** ドラッグで付けた並び順を捨てて、生年順の自動整列に戻す。 */
  async function clearSiblingOrder() {
    const siblings = siblingsOf(graph, person.id);
    if (siblings.length === 0) return;

    setError(null);
    try {
      await api.clearSiblingOrder(
        treeId,
        siblings.map((sibling) => sibling.id),
      );
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '並び順の初期化に失敗しました');
    }
  }

  const kana = displayNameKana(person);
  const age = ageLabel(person);
  const hasManualOrder = siblingsOf(graph, person.id).some(
    (sibling) => sibling.siblingOrder !== null,
  );

  return (
    <div>
      {kana && <p className="panel__subtitle">{kana}</p>}
      {person.maidenName && <p className="panel__subtitle">旧姓: {person.maidenName}</p>}

      {error && <p className="alert alert--error">{error}</p>}

      <dl className="detail-list">
        <Detail label="続柄" value={birthOrderLabel(graph, person)} />
        <Detail label="性別" value={GENDER_LABELS[person.gender]} />
        <Detail label="生没" value={lifespanLabel(person) || '不明'} />
        <Detail label="年齢" value={age} />
        <Detail label="生年月日" value={formatWithEra(person.birthDate)} />
        {!person.isLiving && <Detail label="没年月日" value={formatWithEra(person.deathDate)} />}
        <Detail label="出生地" value={person.birthPlace} />
        <Detail label="メモ" value={person.note} />
      </dl>

      {person.surnameHistory.length > 0 && (
        <section className="panel__section">
          <h3>改姓の履歴</h3>
          <ol className="surname-timeline">
            {person.surnameHistory.map((record, index) => (
              <li key={index}>
                <span className="surname-timeline__name">{record.familyName}</span>
                <span className="surname-timeline__meta">
                  {SURNAME_CHANGE_REASON_LABELS[record.reason]}
                  {record.date && ` ／ ${formatWithEra(record.date)}`}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <RelationList
        title="親"
        entries={relations.parents.map((r) => ({
          id: r.person.id,
          label: displayName(r.person),
          onRemove: canEdit
            ? () => removeLink('parentChild', r.linkId, `${displayName(r.person)} を親から外す`)
            : undefined,
        }))}
        onSelect={onSelectPerson}
      />
      <RelationList
        title="配偶者"
        entries={relations.spouses.map((r) => ({
          id: r.person.id,
          label: `${displayName(r.person)}（${UNION_STATUS_LABELS[r.status]}）`,
          onRemove: canEdit
            ? () => removeLink('union', r.unionId, `${displayName(r.person)} との婚姻関係を外す`)
            : undefined,
        }))}
        onSelect={onSelectPerson}
      />
      <RelationList
        title="きょうだい"
        entries={relations.siblings.map((p) => ({ id: p.id, label: displayName(p) }))}
        onSelect={onSelectPerson}
        note="きょうだいは親子関係から自動で導かれます。外すには親の関係を編集してください。"
      />
      <RelationList
        title="子"
        entries={relations.children.map((r) => ({
          id: r.person.id,
          label: displayName(r.person),
          onRemove: canEdit
            ? () => removeLink('parentChild', r.linkId, `${displayName(r.person)} を子から外す`)
            : undefined,
        }))}
        onSelect={onSelectPerson}
      />

      {canEdit && hasManualOrder && (
        <div className="panel__actions">
          <button type="button" className="button" onClick={clearSiblingOrder}>
            きょうだいの並び順を自動に戻す
          </button>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function RelationList({
  title,
  entries,
  onSelect,
  note,
}: {
  title: string;
  entries: { id: string; label: string; onRemove?: () => void }[];
  onSelect: (id: string) => void;
  note?: string;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="panel__section">
      <h3>{title}</h3>
      <ul className="link-list">
        {entries.map((entry) => (
          <li key={entry.id} className="link-list__row">
            <button type="button" className="link-button" onClick={() => onSelect(entry.id)}>
              {entry.label}
            </button>
            {entry.onRemove && (
              <button
                type="button"
                className="icon-button"
                onClick={entry.onRemove}
                aria-label={`${entry.label} との関係を外す`}
                title="関係を外す"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {note && <p className="note">{note}</p>}
    </section>
  );
}

/** 選択中の人物から見た関係者を求める。きょうだいは親子関係から導出する。 */
function useRelations(graph: TreeGraph, personId: string) {
  return useMemo(() => {
    const personById = new Map(graph.persons.map((p) => [p.id, p]));
    const parentChild = graph.parentChild.filter((pc) => !pc.deletedAt);
    const unions = graph.unions.filter((u) => !u.deletedAt);

    const parentLinks = parentChild.filter((pc) => pc.childId === personId);
    const childLinks = parentChild.filter((pc) => pc.parentId === personId);
    const parentIds = parentLinks.map((pc) => pc.parentId);

    // きょうだいは親子関係からの導出なので、単体では削除できない（親側の関係を消す）
    const siblingIds = new Set(
      parentChild
        .filter((pc) => parentIds.includes(pc.parentId) && pc.childId !== personId)
        .map((pc) => pc.childId),
    );

    const toEntry = (id: string, linkId: string): ParentChildEntry | null => {
      const found = personById.get(id);
      return found ? { person: found, linkId } : null;
    };
    const notNull = <T,>(value: T | null): value is T => value !== null;

    const spouses = unions
      .filter((u) => u.partner1Id === personId || u.partner2Id === personId)
      .map((u): SpouseEntry | null => {
        const otherId = u.partner1Id === personId ? u.partner2Id : u.partner1Id;
        const other = personById.get(otherId);
        return other ? { person: other, status: u.status, unionId: u.id } : null;
      })
      .filter(notNull);

    return {
      parents: parentLinks.map((pc) => toEntry(pc.parentId, pc.id)).filter(notNull),
      children: childLinks.map((pc) => toEntry(pc.childId, pc.id)).filter(notNull),
      siblings: [...siblingIds]
        .map((id) => personById.get(id))
        .filter((p): p is Person => Boolean(p)),
      spouses,
    };
  }, [graph, personId]);
}
