import { useMemo, useState } from 'react';

import { PersonForm } from '@/features/persons/PersonForm';
import * as api from '@/lib/api';
import {
  displayName,
  GENDER_LABELS,
  lifespanLabel,
  UNION_STATUS_LABELS,
  type Person,
  type PersonInput,
  type TreeGraph,
  type UnionStatus,
} from '@/types/models';

/** 追加する親族の種別。 */
type RelativeKind = 'parent' | 'spouse' | 'child';

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

const RELATIVE_LABELS: Record<RelativeKind, string> = {
  parent: '親',
  spouse: '配偶者',
  child: '子',
};

interface PersonPanelProps {
  treeId: string;
  graph: TreeGraph;
  person: Person;
  canEdit: boolean;
  onSelectPerson: (personId: string) => void;
  onChanged: () => Promise<void>;
}

export function PersonPanel({
  treeId,
  graph,
  person,
  canEdit,
  onSelectPerson,
  onChanged,
}: PersonPanelProps) {
  const [mode, setMode] = useState<'view' | 'edit' | RelativeKind>('view');
  const [error, setError] = useState<string | null>(null);

  const relations = useRelations(graph, person.id);

  async function handleUpdate(input: PersonInput) {
    await api.updatePerson(treeId, person.id, input);
    await onChanged();
    setMode('view');
  }

  /** 親族を新規作成し、同時に関係も張る。 */
  async function handleAddRelative(kind: RelativeKind, input: PersonInput) {
    const created = await api.createPerson(treeId, input);

    if (kind === 'parent') {
      await api.addParentChild(treeId, created.id, person.id);
    } else if (kind === 'spouse') {
      await api.addUnion(treeId, person.id, created.id);
    } else {
      await api.addParentChild(treeId, person.id, created.id);
      // 配偶者が1人だけ分かっている場合は、その人も親として登録する
      if (relations.spouses.length === 1) {
        await api.addParentChild(treeId, relations.spouses[0].person.id, created.id);
      }
    }

    await onChanged();
    setMode('view');
    onSelectPerson(created.id);
  }

  /** 関係だけを解消する。人物そのものは残る。 */
  async function handleRemoveLink(
    kind: 'parentChild' | 'union',
    id: string,
    confirmMessage: string,
  ) {
    if (!window.confirm(`${confirmMessage}。よろしいですか？（人物は残ります）`)) return;

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

  async function handleDelete() {
    if (!window.confirm(`${displayName(person)} を削除しますか？（ゴミ箱から復元できます）`)) {
      return;
    }

    try {
      await api.softDeletePerson(treeId, person.id);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '削除に失敗しました');
    }
  }

  if (mode === 'edit') {
    return (
      <aside className="panel">
        <h2>人物を編集</h2>
        <PersonForm
          initial={person}
          submitLabel="保存"
          onSubmit={handleUpdate}
          onCancel={() => setMode('view')}
        />
      </aside>
    );
  }

  if (mode !== 'view') {
    return (
      <aside className="panel">
        <h2>
          {displayName(person)} の{RELATIVE_LABELS[mode]}を追加
        </h2>
        <PersonForm
          submitLabel="追加"
          onSubmit={(input) => handleAddRelative(mode, input)}
          onCancel={() => setMode('view')}
        />
      </aside>
    );
  }

  return (
    <aside className="panel">
      <h2>{displayName(person)}</h2>
      {person.maidenName && <p className="panel__subtitle">旧姓: {person.maidenName}</p>}

      {error && <p className="alert alert--error">{error}</p>}

      <dl className="detail-list">
        <Detail label="性別" value={GENDER_LABELS[person.gender]} />
        <Detail label="生没" value={lifespanLabel(person) || '不明'} />
        <Detail label="生年月日" value={person.birthDate} />
        {!person.isLiving && <Detail label="没年月日" value={person.deathDate} />}
        <Detail label="出生地" value={person.birthPlace} />
        <Detail label="メモ" value={person.note} />
      </dl>

      <RelationList
        title="親"
        entries={relations.parents.map((r) => ({
          id: r.person.id,
          label: displayName(r.person),
          onRemove: canEdit
            ? () => handleRemoveLink('parentChild', r.linkId, `${displayName(r.person)} を親から外す`)
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
            ? () => handleRemoveLink('union', r.unionId, `${displayName(r.person)} との婚姻関係を外す`)
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
            ? () => handleRemoveLink('parentChild', r.linkId, `${displayName(r.person)} を子から外す`)
            : undefined,
        }))}
        onSelect={onSelectPerson}
      />

      {canEdit && (
        <div className="panel__actions">
          <button type="button" className="button" onClick={() => setMode('edit')}>
            編集
          </button>
          <button type="button" className="button" onClick={() => setMode('parent')}>
            親を追加
          </button>
          <button type="button" className="button" onClick={() => setMode('spouse')}>
            配偶者を追加
          </button>
          <button type="button" className="button" onClick={() => setMode('child')}>
            子を追加
          </button>
          <button type="button" className="button button--danger" onClick={handleDelete}>
            削除
          </button>
        </div>
      )}
    </aside>
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
      const person = personById.get(id);
      return person ? { person, linkId } : null;
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
