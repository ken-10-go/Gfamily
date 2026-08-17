import { useState } from 'react';

import { TreeCanvas } from '@/features/tree-view/TreeCanvas';
import { cardMetrics, useViewSettings } from '@/features/tree-view/useViewSettings';
import { ViewSettingsPanel } from '@/features/tree-view/ViewSettingsPanel';
import { formatWithEra } from '@/lib/japanese-date';
import { birthOrderLabel } from '@/lib/relations';
import {
  displayName,
  EMPTY_PERSON,
  type CardPosition,
  type ParentChild,
  type Person,
  type TreeGraph,
  type Union,
} from '@/types/models';

/**
 * 開発用のツリービュー確認画面（本番ビルドには含まれない）。
 *
 * Firebase を設定しなくても描画とパン・ズームを確認できるようにするためのもの。
 * ここに出てくる人物はすべて架空で、実在の家族データとは無関係。
 */
export function DemoPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 配置の確認ができるよう、デモでは画面内だけで position を保持する
  const [graph, setGraph] = useState<TreeGraph>(DEMO_GRAPH);
  const { settings, update } = useViewSettings('demo');
  const selected = graph.persons.find((p) => p.id === selectedId);

  function movePerson(personId: string, position: CardPosition) {
    setGraph((current) => ({
      ...current,
      persons: current.persons.map((person) =>
        person.id === personId ? { ...person, position } : person,
      ),
    }));
  }

  return (
    <div className="tree-page">
      <header className="tree-page__header">
        <div>
          <h1>ツリービューのデモ（架空データ）</h1>
        </div>
        <p className="note">
          何も無いところをドラッグで移動、ホイールで拡大縮小、カードをクリックで選択。
          カードはドラッグして好きな場所に置けます（格子に合います）。
        </p>
      </header>
      <div className="tree-page__body">
        <TreeCanvas
          graph={graph}
          metrics={cardMetrics(settings)}
          settings={settings}
          selectedPersonId={selectedId}
          onSelectPerson={(personId) => setSelectedId(personId)}
          canReorder
          onMovePerson={movePerson}
        />
        <aside className="panel">
          <h2>{selected ? displayName(selected) : '人物を選択'}</h2>
          {selected && (
            <dl className="detail-list">
              <dt>続柄</dt>
              <dd>{birthOrderLabel(graph, selected) ?? '—'}</dd>
              <dt>生年月日</dt>
              <dd>{formatWithEra(selected.birthDate) || '不明'}</dd>
              <dt>没年月日</dt>
              <dd>{formatWithEra(selected.deathDate) || '—'}</dd>
              <dt>出生地</dt>
              <dd>{selected.birthPlace ?? '不明'}</dd>
            </dl>
          )}

          <h3>表示設定</h3>
          <ViewSettingsPanel settings={settings} onChange={update} />
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
  overrides: Partial<Person> = {},
): Person {
  return {
    ...EMPTY_PERSON,
    id,
    familyName,
    givenName,
    gender,
    birthDate: birth,
    deathDate: death ?? null,
    isLiving: !death,
    ...overrides,
  };
}

function pc(
  parentId: string,
  childId: string,
  kind: ParentChild['kind'] = 'biological',
): ParentChild {
  return {
    id: `${parentId}-${childId}`,
    parentId: parentId,
    childId: childId,
    kind,
    deletedAt: null,
  };
}

function marriage(a: string, b: string, status: Union['status'] = 'married'): Union {
  return {
    id: `${a}-${b}`,
    partner1Id: a,
    partner2Id: b,
    status,
    startDate: null,
    endDate: null,
    deletedAt: null,
  };
}

const DEMO_GRAPH: TreeGraph = {
  persons: [
    // 明治生まれ・年しか分からない、という古い戸籍でよくある例
    person('ggf', '見本', '源蔵', 'male', '1899', '1962', {
      familyNameKana: 'みほん',
      givenNameKana: 'げんぞう',
    }),
    person('gf', '見本', '一郎', 'male', '1930-04-02', '2005-11-18', {
      familyNameKana: 'みほん',
      givenNameKana: 'いちろう',
    }),
    // 婚姻で姓が変わった例
    person('gm', '見本', 'はな', 'female', '1933-08-15', '2012-01-09', {
      familyNameKana: 'みほん',
      givenNameKana: 'はな',
      maidenName: '仮名',
      surnameHistory: [
        { familyName: '仮名', date: '1933-08-15', reason: 'birth', note: null },
        { familyName: '見本', date: '1955-05-05', reason: 'marriage', note: null },
      ],
    }),
    person('f', '見本', '次郎', 'male', '1958-02-20', undefined, {
      familyNameKana: 'みほん',
      givenNameKana: 'じろう',
    }),
    person('m', '見本', '幸子', 'female', '1961-06-30', undefined, {
      maidenName: '例',
      surnameHistory: [
        { familyName: '例', date: '1961-06-30', reason: 'birth', note: null },
        { familyName: '見本', date: '1986-10-10', reason: 'marriage', note: null },
      ],
    }),
    person('u', '見本', '三郎', 'male', '1962-09-05'),
    person('ua', '例', '明美', 'female', '1965-03-12'),
    person('c1', '見本', '太郎', 'male', '1988-03-14', undefined, {
      familyNameKana: 'みほん',
      givenNameKana: 'たろう',
    }),
    person('c2', '見本', '桜', 'female', '1991-12-01'),
    person('c3', '見本', '健', 'male', '1994-07-22'),
    person('cousin', '見本', '涼', 'other', '1996-05-08'),
    person('gc', '見本', '陽', 'female', '2018-09-30'),
  ],
  parentChild: [
    pc('ggf', 'gf'),
    pc('gf', 'f'),
    pc('gm', 'f'),
    pc('gf', 'u'),
    pc('gm', 'u'),
    pc('f', 'c1'),
    pc('m', 'c1'),
    pc('f', 'c2'),
    pc('m', 'c2'),
    // 線の描き分け（実線と破線）を確かめられるよう、1人は養子にしておく
    pc('f', 'c3', 'adoptive'),
    pc('m', 'c3', 'adoptive'),
    pc('u', 'cousin'),
    pc('ua', 'cousin'),
    pc('c1', 'gc'),
  ],
  unions: [marriage('gf', 'gm', 'widowed'), marriage('f', 'm'), marriage('u', 'ua', 'divorced')],
};
