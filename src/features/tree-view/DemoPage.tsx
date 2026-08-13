import { useState } from 'react';

import { TreeCanvas } from '@/features/tree-view/TreeCanvas';
import { displayName, type ParentChild, type Person, type TreeGraph, type Union } from '@/types/models';

/**
 * 開発用のツリービュー確認画面（本番ビルドには含まれない）。
 *
 * Supabase を設定しなくても描画とパン・ズームを確認できるようにするためのもの。
 * ここに出てくる人物はすべて架空で、実在の家族データとは無関係。
 */
export function DemoPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = DEMO_GRAPH.persons.find((p) => p.id === selectedId);

  return (
    <div className="tree-page">
      <header className="tree-page__header">
        <div>
          <h1>ツリービューのデモ（架空データ）</h1>
        </div>
        <p className="note">ドラッグで移動、ホイールで拡大縮小、カードをクリックで選択。</p>
      </header>
      <div className="tree-page__body">
        <TreeCanvas
          graph={DEMO_GRAPH}
          selectedPersonId={selectedId}
          onSelectPerson={setSelectedId}
        />
        <aside className="panel">
          <h2>{selected ? displayName(selected) : '人物を選択'}</h2>
          {selected && (
            <dl className="detail-list">
              <dt>生年月日</dt>
              <dd>{selected.birth_date ?? '不明'}</dd>
              <dt>出生地</dt>
              <dd>{selected.birth_place ?? '不明'}</dd>
            </dl>
          )}
        </aside>
      </div>
    </div>
  );
}

function person(
  id: string,
  familyName: string,
  givenName: string,
  gender: Person['gender'],
  birth: string,
  death?: string,
): Person {
  return {
    id,
    tree_id: 'demo',
    family_name: familyName,
    given_name: givenName,
    maiden_name: null,
    gender,
    birth_date: birth,
    death_date: death ?? null,
    birth_place: '架空県 見本市',
    note: null,
    is_living: !death,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function pc(parentId: string, childId: string): ParentChild {
  return {
    id: `${parentId}-${childId}`,
    tree_id: 'demo',
    parent_id: parentId,
    child_id: childId,
    kind: 'biological',
    deleted_at: null,
  };
}

function marriage(a: string, b: string, status: Union['status'] = 'married'): Union {
  return {
    id: `${a}-${b}`,
    tree_id: 'demo',
    partner1_id: a,
    partner2_id: b,
    status,
    start_date: null,
    end_date: null,
    deleted_at: null,
  };
}

const DEMO_GRAPH: TreeGraph = {
  persons: [
    person('gf', '見本', '一郎', 'male', '1930-04-02', '2005-11-18'),
    person('gm', '見本', 'はな', 'female', '1933-08-15', '2012-01-09'),
    person('f', '見本', '次郎', 'male', '1958-02-20'),
    person('m', '見本', '幸子', 'female', '1961-06-30'),
    person('u', '見本', '三郎', 'male', '1962-09-05'),
    person('ua', '例', '明美', 'female', '1965-03-12'),
    person('c1', '見本', '太郎', 'male', '1988-03-14'),
    person('c2', '見本', '桜', 'female', '1991-12-01'),
    person('c3', '見本', '健', 'male', '1994-07-22'),
    person('cousin', '見本', '涼', 'other', '1996-05-08'),
    person('gc', '見本', '陽', 'female', '2018-09-30'),
  ],
  parentChild: [
    pc('gf', 'f'),
    pc('gm', 'f'),
    pc('gf', 'u'),
    pc('gm', 'u'),
    pc('f', 'c1'),
    pc('m', 'c1'),
    pc('f', 'c2'),
    pc('m', 'c2'),
    pc('f', 'c3'),
    pc('m', 'c3'),
    pc('u', 'cousin'),
    pc('ua', 'cousin'),
    pc('c1', 'gc'),
  ],
  unions: [
    marriage('gf', 'gm', 'widowed'),
    marriage('f', 'm'),
    marriage('u', 'ua', 'divorced'),
  ],
};
