import { useEffect, useMemo, useState } from 'react';

import { useTreeKey } from '@/features/e2ee/useTreeKey';
import { houseMemberships } from '@/features/tree-view/houses';
import * as api from '@/lib/api';
import type { SensitiveFields } from '@/lib/crypto';
import { ageLabel, formatWithEra } from '@/lib/japanese-date';
import { birthOrderLabel } from '@/lib/relations';
import {
  displayName,
  displayNameKana,
  GENDER_LABELS,
  lifespanLabel,
  PARENT_KIND_LABELS,
  SURNAME_CHANGE_REASON_LABELS,
  UNION_STATUS_LABELS,
  type House,
  type ParentKind,
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
  /** 実子・養子などの種別。実子以外は一覧にも添える。 */
  kind: ParentKind;
}

interface PersonDetailProps {
  treeId: string;
  graph: TreeGraph;
  person: Person;
  /** 手で登録した家。所属を出すのに使う（未登録なら血のつながりから自動判定） */
  houses?: House[];
  canEdit: boolean;
  onSelectPerson: (personId: string) => void;
  onChanged: () => Promise<void>;
}

/** 人物の詳細と、つながっている家族。関係の解消もここから行う。 */
export function PersonDetail({
  treeId,
  graph,
  person,
  houses = [],
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

  /** ドラッグで置いた位置を捨てて、自動レイアウトに戻す。 */
  async function resetPosition() {
    setError(null);
    try {
      await api.setPersonPosition(treeId, person.id, null);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '位置の初期化に失敗しました');
    }
  }

  const kana = displayNameKana(person);
  const age = ageLabel(person);

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
        <Detail
          label="生年月日"
          value={dateLabel(person.birthDate, person.birthEra, person.birthDateUncertain)}
        />
        {!person.isLiving && (
          <Detail
            label="没年月日"
            value={dateLabel(person.deathDate, person.deathEra, person.deathDateUncertain)}
          />
        )}
        <Detail label="出生地" value={person.birthPlace} />
        <Detail label="属する家" value={houseLabel(graph, person, houses)} />
        <Detail label="メモ" value={person.note} />
      </dl>

      <SensitiveSection person={person} />

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
          label: withKind(displayName(r.person), r.kind),
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
          label: withKind(displayName(r.person), r.kind),
          onRemove: canEdit
            ? () => removeLink('parentChild', r.linkId, `${displayName(r.person)} を子から外す`)
            : undefined,
        }))}
        onSelect={onSelectPerson}
      />

      {canEdit && person.position && (
        <div className="panel__actions">
          <button type="button" className="button" onClick={resetPosition}>
            配置を自動に戻す
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 暗号化して保存されている項目。鍵が開いているときだけ中身を出す。
 * 鍵が無いときは「入っていること」だけを伝え、開き方を案内する。
 */
function SensitiveSection({ person }: { person: Person }) {
  const key = useTreeKey();
  const [fields, setFields] = useState<SensitiveFields | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFields(null);
    setError(null);
    if (!key.unlocked || !person.encryptedData) return;

    void key
      .decrypt(person.encryptedData)
      .then((decrypted) => {
        if (!cancelled) setFields(decrypted);
      })
      .catch(() => {
        if (!cancelled) setError('復号キーが異なります');
      });

    return () => {
      cancelled = true;
    };
  }, [key, person]);

  if (!person.encryptedData) return null;

  if (!key.unlocked) {
    return (
      <section className="panel__section">
        <h3>🔒 機微な情報</h3>
        <p className="note">
          本籍地・戒名などが暗号化して保存されています。表示設定の「機微な情報の鍵」で
          合言葉を入れると読めます。
        </p>
      </section>
    );
  }

  return (
    <section className="panel__section">
      <h3>🔒 機微な情報</h3>
      {error && <p className="alert alert--error">{error}</p>}
      {fields && (
        <dl className="detail-list">
          <Detail label="本籍地" value={fields.honseki} />
          <Detail label="現住所" value={fields.address} />
          <Detail label="戒名・法名" value={fields.kaimyo} />
          <Detail label="お墓" value={fields.graveLocation} />
          <Detail label="思い出" value={fields.biographyNotes} />
        </dl>
      )}
    </section>
  );
}

/**
 * 日付の表示。和暦で入力されたものは、その表記を添える。
 *
 * 明治5年までは旧暦なので、西暦へ機械的に直した月日は戸籍の記載と合わない。
 * 入力された和暦をそのまま残しているので、両方を見せて判断できるようにする。
 */
function dateLabel(value: string | null, era: Person['birthEra'], uncertain: boolean): string {
  const base = formatWithEra(value);
  if (!base) return '';

  const raw = era
    ? `${era.eraName}${era.eraYear === 1 ? '元' : era.eraYear}年${era.month ? `${era.month}月` : ''}${era.day ? `${era.day}日` : ''}`
    : '';
  // 元号から機械的に導ける表記と同じなら、二重に出さない
  const withRaw = raw && !base.includes(raw) ? `${base}（記載: ${raw}）` : base;

  return uncertain ? `${withRaw} 頃` : withRaw;
}

/** 実子以外は種別を添える。実子はふつうなので、いちいち書かない。 */
function withKind(name: string, kind: ParentKind): string {
  return kind === 'biological' ? name : `${name}（${PARENT_KIND_LABELS[kind]}）`;
}

/**
 * 属する家。1人が複数の家に属してよいので、並べて出す。
 * 先頭は配置のまとまりに使う「主たる家」なので、そう分かるように印を付ける。
 * 手の指定が無ければ、血のつながりから自動で判定した家を出す。
 */
function houseLabel(graph: TreeGraph, person: Person, houses: House[]): string {
  const belongs = houseMemberships(graph, houses).get(person.id) ?? [];
  if (belongs.length === 0) return '';

  return belongs
    .map((house, index) => {
      if (!house.pinned) return `${house.name}（自動）`;
      return index === 0 && belongs.length > 1 ? `${house.name}（主）` : house.name;
    })
    .join('・');
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

    const toEntry = (id: string, linkId: string, kind: ParentKind): ParentChildEntry | null => {
      const found = personById.get(id);
      return found ? { person: found, linkId, kind } : null;
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
      parents: parentLinks.map((pc) => toEntry(pc.parentId, pc.id, pc.kind)).filter(notNull),
      children: childLinks.map((pc) => toEntry(pc.childId, pc.id, pc.kind)).filter(notNull),
      siblings: [...siblingIds]
        .map((id) => personById.get(id))
        .filter((p): p is Person => Boolean(p)),
      spouses,
    };
  }, [graph, personId]);
}
