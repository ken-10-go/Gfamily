import { useMemo, useState } from 'react';

import { ParentKindSelect } from '@/features/persons/ParentKindSelect';
import { connectionProblem, type ConnectionKind } from '@/lib/relations';
import {
  displayName,
  displayNameKana,
  lifespanLabel,
  type ParentKind,
  type TreeGraph,
} from '@/types/models';

interface PersonPickerProps {
  graph: TreeGraph;
  /** つなぐ相手を探す起点になる人物。 */
  personId: string;
  kind: ConnectionKind;
  onPick: (otherId: string, parentKind: ParentKind) => Promise<void>;
  onCancel: () => void;
}

const KIND_LABELS: Record<ConnectionKind, string> = {
  parent: '親',
  child: '子',
  spouse: '配偶者',
};

/**
 * すでに登録されている人物を選んで関係をつなぐ。
 *
 * いとこ同士の婚姻、再婚相手がすでに家系図にいる場合、養子縁組など、
 * 新しく人物を作るのではなく既存の人物を結びたい場面のためのもの。
 * つなげない相手は理由を添えて選べないようにする。
 */
export function PersonPicker({ graph, personId, kind, onPick, onCancel }: PersonPickerProps) {
  const [keyword, setKeyword] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parentKind, setParentKind] = useState<ParentKind>('biological');

  const candidates = useMemo(() => {
    const needle = keyword.trim().toLowerCase();

    return graph.persons
      .filter((person) => !person.deletedAt && person.id !== personId)
      .filter((person) =>
        needle
          ? [displayName(person), displayNameKana(person), person.maidenName ?? '']
              .join(' ')
              .toLowerCase()
              .includes(needle)
          : true,
      )
      .map((person) => ({ person, problem: connectionProblem(graph, personId, person.id, kind) }))
      .sort((a, b) => {
        // つなげる相手を先に出す
        if (Boolean(a.problem) !== Boolean(b.problem)) return a.problem ? 1 : -1;
        return displayName(a.person).localeCompare(displayName(b.person), 'ja');
      });
  }, [graph, personId, kind, keyword]);

  async function handlePick(otherId: string) {
    setError(null);
    setBusyId(otherId);
    try {
      await onPick(otherId, parentKind);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '接続に失敗しました');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="picker">
      <label className="field">
        <span className="field__label">{KIND_LABELS[kind]}にする人物を選ぶ</span>
        <input
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="名前・ふりがなで絞り込む"
          autoFocus
        />
      </label>

      {/* 親子としてつなぐときだけ、実子か縁組かを選ぶ */}
      {kind !== 'spouse' && <ParentKindSelect value={parentKind} onChange={setParentKind} />}

      {error && <p className="alert alert--error">{error}</p>}

      {candidates.length === 0 ? (
        <p className="note">該当する人物がいません。</p>
      ) : (
        <ul className="picker__list">
          {candidates.map(({ person, problem }) => (
            <li key={person.id}>
              <button
                type="button"
                className="picker__item"
                disabled={Boolean(problem) || busyId !== null}
                onClick={() => handlePick(person.id)}
                title={problem ?? undefined}
              >
                <span className="picker__name">{displayName(person)}</span>
                <span className="picker__meta">
                  {problem ??
                    [displayNameKana(person), lifespanLabel(person)].filter(Boolean).join('　')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="button" onClick={onCancel}>
        キャンセル
      </button>
    </div>
  );
}
