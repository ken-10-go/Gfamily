import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AddRelativeForm, type RelativeKind } from '@/features/persons/AddRelativeForm';
import { ParentsForm, type ParentsDraft } from '@/features/persons/ParentsForm';
import { PersonDetail } from '@/features/persons/PersonDetail';
import { PersonDialog } from '@/features/persons/PersonDialog';
import { PersonForm } from '@/features/persons/PersonForm';
import { PersonMenu, type PersonAction } from '@/features/persons/PersonMenu';
import { PersonPicker } from '@/features/persons/PersonPicker';
import { DEFAULT_FOCUS_OPTIONS, focusGraph } from '@/features/tree-view/focus';
import { placeholderTarget } from '@/features/tree-view/placeholders';
import { FocusBar, type FocusState } from '@/features/tree-view/FocusBar';
import { TreeCanvas, type CardAnchor } from '@/features/tree-view/TreeCanvas';
import { cardMetrics, useViewSettings } from '@/features/tree-view/useViewSettings';
import { ViewSettingsPanel } from '@/features/tree-view/ViewSettingsPanel';
import * as api from '@/lib/api';
import { deriveBirthOrder, type ConnectionKind } from '@/lib/relations';
import {
  displayName,
  displayNameKana,
  lifespanLabel,
  ROLE_LABELS,
  type CardPosition,
  type PersonInput,
  type Tree,
  type TreeGraph,
  type TreeRole,
} from '@/types/models';

const EMPTY_GRAPH: TreeGraph = { persons: [], parentChild: [], unions: [] };

/** ダイアログで出している内容。 */
type DialogMode =
  | { kind: 'detail'; personId: string }
  | { kind: 'edit'; personId: string }
  | { kind: 'add-relative'; personId: string; relation: RelativeKind }
  | { kind: 'add-parents'; personId: string }
  | { kind: 'connect'; personId: string; relation: ConnectionKind }
  | { kind: 'add-person' }
  | { kind: 'settings' };

const RELATIVE_LABELS: Record<RelativeKind, string> = {
  parent: '親',
  spouse: '配偶者',
  child: '子',
};
const CONNECT_LABELS: Record<ConnectionKind, string> = {
  parent: '親',
  spouse: '配偶者',
  child: '子',
};

export function TreeDetailPage() {
  const { treeId = '' } = useParams();
  const [tree, setTree] = useState<Tree | null>(null);
  const [role, setRole] = useState<TreeRole | null>(null);
  const [graph, setGraph] = useState<TreeGraph>(EMPTY_GRAPH);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ personId: string; anchor: CardAnchor } | null>(null);
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focus, setFocus] = useState<FocusState>({ centerId: '', ...DEFAULT_FOCUS_OPTIONS });

  const { settings, update: updateSetting } = useViewSettings(treeId);
  const metrics = useMemo(() => cardMetrics(settings), [settings]);

  const reload = useCallback(async () => {
    try {
      const [nextTree, nextRole, nextGraph] = await Promise.all([
        api.getTree(treeId),
        api.getMyRole(treeId),
        api.loadTreeGraph(treeId),
      ]);
      setTree(nextTree);
      setRole(nextRole);
      setGraph(nextGraph);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  // 「⋯」の外側を触ったら閉じる
  useEffect(() => {
    if (!moreOpen) return;

    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.more')) setMoreOpen(false);
    };
    const timer = window.setTimeout(() => window.addEventListener('pointerdown', close), 0);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', close);
    };
  }, [moreOpen]);

  // 権限があっても、ロック中は編集させない（閲覧中の誤操作を防ぐ）
  const canEdit = (role === 'owner' || role === 'editor') && !settings.locked;
  const personOf = (id: string) => graph.persons.find((p) => p.id === id) ?? null;

  // 描画に渡す家系図。フォーカス中は中心人物のまわりだけに絞る。
  // 検索やメニューの人物探しは絞り込み前の graph を見るので、範囲外の人にもたどり着ける。
  const visibleGraph = useMemo(
    () => (focus.centerId ? focusGraph(graph, focus.centerId, focus) : graph),
    [graph, focus],
  );

  /** 中心人物を決めてフォーカスを始める。 */
  function startFocus(personId: string) {
    setFocus((current) => ({ ...current, centerId: personId }));
    setFocusOpen(true);
  }

  function toggleFocusBar() {
    if (focusOpen) {
      setFocusOpen(false);
      return;
    }
    // 開くときに中心が未指定なら、選んでいる人物を初期値にする
    if (!focus.centerId && selectedId) setFocus((current) => ({ ...current, centerId: selectedId }));
    setFocusOpen(true);
  }

  function openMenu(personId: string, anchor: CardAnchor) {
    // 「＋ 配偶者」の空カードは実在しないので、そのまま配偶者の追加を開く
    const placeholderFor = placeholderTarget(personId);
    if (placeholderFor) {
      setSelectedId(placeholderFor);
      if (canEdit) setDialog({ kind: 'add-relative', personId: placeholderFor, relation: 'spouse' });
      return;
    }

    setSelectedId(personId);
    setMenu({ personId, anchor });
  }

  function handleAction(action: PersonAction) {
    const personId = menu?.personId;
    setMenu(null);
    if (!personId) return;

    switch (action) {
      case 'detail':
        setDialog({ kind: 'detail', personId });
        break;
      case 'edit':
        setDialog({ kind: 'edit', personId });
        break;
      case 'add-parent':
      case 'add-spouse':
      case 'add-child':
        setDialog({
          kind: 'add-relative',
          personId,
          relation: action.replace('add-', '') as RelativeKind,
        });
        break;
      case 'add-parents':
        setDialog({ kind: 'add-parents', personId });
        break;
      case 'focus':
        startFocus(personId);
        break;
      case 'reset-position':
        void handleResetPosition(personId);
        break;
      case 'connect-parent':
      case 'connect-spouse':
      case 'connect-child':
        setDialog({
          kind: 'connect',
          personId,
          relation: action.replace('connect-', '') as ConnectionKind,
        });
        break;
      case 'delete':
        void handleDelete(personId);
        break;
    }
  }

  async function handleDelete(personId: string) {
    const person = personOf(personId);
    if (!person) return;
    if (!window.confirm(`${displayName(person)} を削除しますか？（ゴミ箱から復元できます）`)) return;

    try {
      await api.softDeletePerson(treeId, personId);
      setSelectedId(null);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '削除に失敗しました');
    }
  }

  async function handleCreatePerson(input: PersonInput) {
    const created = await api.createPerson(treeId, input);
    await reload();
    setSelectedId(created.id);
    setDialog(null);
  }

  /**
   * 親族を新規作成し、同時に関係も張る。
   * 子の場合の otherParentId は「もう一方の親」で、フォーム側で選ばれた値が入る。
   */
  async function handleAddRelative(
    personId: string,
    relation: RelativeKind,
    input: PersonInput,
    otherParentId: string | null,
  ) {
    const created = await api.createPerson(treeId, input);

    if (relation === 'parent') {
      await api.addParentChild(treeId, created.id, personId);
    } else if (relation === 'spouse') {
      await api.addUnion(treeId, personId, created.id);
    } else {
      await api.addParentChild(treeId, personId, created.id);
      if (otherParentId) {
        await api.addParentChild(treeId, otherParentId, created.id);
      }
    }

    await reload();
    setSelectedId(created.id);
    setDialog(null);
  }

  /**
   * 父と母をまとめて登録する。
   * 2人とも入力されていれば夫婦としてもつなぎ、あとから結び直す手間を省く。
   */
  async function handleAddParents(personId: string, draft: ParentsDraft) {
    const createdIds: string[] = [];

    for (const input of [draft.father, draft.mother]) {
      if (!input) continue;
      const created = await api.createPerson(treeId, input);
      await api.addParentChild(treeId, created.id, personId);
      createdIds.push(created.id);
    }

    if (draft.marry && createdIds.length === 2) {
      await api.addUnion(treeId, createdIds[0], createdIds[1]);
    }

    await reload();
    setSelectedId(createdIds[0] ?? personId);
    setDialog(null);
  }

  /** すでに登録されている人物とつなぐ。 */
  async function handleConnect(personId: string, relation: ConnectionKind, otherId: string) {
    if (relation === 'spouse') {
      await api.addUnion(treeId, personId, otherId);
    } else if (relation === 'parent') {
      await api.addParentChild(treeId, otherId, personId);
    } else {
      await api.addParentChild(treeId, personId, otherId);
    }

    await reload();
    setDialog(null);
  }

  /** 手で置いた位置を捨てて、自動配置に戻す。 */
  async function handleResetPosition(personId: string) {
    try {
      await api.setPersonPosition(treeId, personId, null);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '位置の初期化に失敗しました');
    }
  }

  /** ドラッグで置いたカードの位置を保存する。 */
  async function handleMovePerson(personId: string, position: CardPosition) {
    try {
      await api.setPersonPosition(treeId, personId, position);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '位置の保存に失敗しました');
    }
  }

  // 読みでも引けるようにする。旧姓を覚えている人を探す場面もあるので姓の履歴も対象にする。
  const keyword = search.trim().toLowerCase();
  const matches = keyword
    ? graph.persons.filter((person) =>
        [
          displayName(person),
          displayNameKana(person),
          person.maidenName ?? '',
          ...person.surnameHistory.map((record) => record.familyName),
        ]
          .join(' ')
          .toLowerCase()
          .includes(keyword),
      )
    : [];

  if (loading) {
    return <p className="page__status">読み込み中…</p>;
  }

  if (error && !tree) {
    return (
      <main className="page">
        <p className="alert alert--error">{error}</p>
        <Link to="/">一覧に戻る</Link>
      </main>
    );
  }

  const menuPerson = menu ? personOf(menu.personId) : null;

  return (
    <div className="tree-page">
      {/*
        狭い画面では画面の高さが貴重なので、ヘッダーは1行に収める。
        検索はアイコンから開き、頻度の低い操作は「⋯」にまとめる。
      */}
      <header className="tree-page__header">
        <Link to="/" className="tree-page__back" aria-label="家系図の一覧へ">
          ←
        </Link>
        <h1 className="tree-page__title">{tree?.name}</h1>
        {role && <span className="badge badge--wide">{ROLE_LABELS[role]}</span>}
        {settings.locked && <span className="badge">ロック中</span>}
        {focus.centerId && <span className="badge">絞り込み中</span>}

        <div className="tree-page__actions">
          <button
            type="button"
            className="icon-button icon-button--tap"
            onClick={() => setSearchOpen((open) => !open)}
            aria-label="人物を検索"
            aria-expanded={searchOpen}
          >
            🔍
          </button>

          <button
            type="button"
            className="icon-button icon-button--tap"
            onClick={toggleFocusBar}
            aria-label="表示する範囲を絞り込む"
            aria-expanded={focusOpen}
          >
            🎯
          </button>

          {canEdit && (
            <button
              type="button"
              className="button button--primary"
              onClick={() => setDialog({ kind: 'add-person' })}
            >
              ＋<span className="hide-narrow">人物を追加</span>
            </button>
          )}

          <div className="more">
            <button
              type="button"
              className="icon-button icon-button--tap"
              onClick={() => setMoreOpen((open) => !open)}
              aria-label="そのほかの操作"
              aria-expanded={moreOpen}
            >
              ⋯
            </button>
            {moreOpen && (
              <div className="more__menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="person-menu__item"
                  onClick={() => {
                    setMoreOpen(false);
                    setDialog({ kind: 'settings' });
                  }}
                >
                  表示設定
                </button>
                <Link
                  to={`/trees/${treeId}/members`}
                  role="menuitem"
                  className="person-menu__item"
                  onClick={() => setMoreOpen(false)}
                >
                  メンバー
                </Link>
                <Link
                  to={`/trees/${treeId}/history`}
                  role="menuitem"
                  className="person-menu__item"
                  onClick={() => setMoreOpen(false)}
                >
                  変更履歴
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="tree-page__search">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="名前・ふりがな・旧姓で検索"
            aria-label="人物を検索"
            autoFocus
          />
          {matches.length > 0 && (
            <ul className="search__results">
              {matches.slice(0, 8).map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setSelectedId(person.id);
                      setDialog({ kind: 'detail', personId: person.id });
                      setSearch('');
                      setSearchOpen(false);
                    }}
                  >
                    {displayName(person)}
                    <span className="search__meta">{lifespanLabel(person)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {focusOpen && (
        <FocusBar
          persons={graph.persons}
          value={focus}
          onChange={setFocus}
          onClear={() => setFocus((current) => ({ ...current, centerId: '' }))}
        />
      )}

      {error && tree && <p className="alert alert--error tree-page__error">{error}</p>}

      <div className="tree-page__body">
        <TreeCanvas
          graph={visibleGraph}
          metrics={metrics}
          settings={settings}
          selectedPersonId={selectedId}
          onSelectPerson={openMenu}
          canReorder={canEdit}
          onMovePerson={handleMovePerson}
          // 絞り込み中は自動配置で描く。手で置いた座標は家系図の全体を前提にした値で、
          // 一部だけを取り出すとカードが遠くに取り残されるため。
          ignoreManualPositions={Boolean(focus.centerId)}
        />
      </div>

      {menu && menuPerson && (
        <PersonMenu
          person={menuPerson}
          anchor={menu.anchor}
          canEdit={canEdit}
          onAction={handleAction}
          onClose={() => setMenu(null)}
        />
      )}

      {dialog && (
        <DialogContent
          dialog={dialog}
          treeId={treeId}
          graph={graph}
          canEdit={canEdit}
          settings={{ settings, updateSetting }}
          onClose={() => setDialog(null)}
          onSelectPerson={(personId) => setDialog({ kind: 'detail', personId })}
          onChanged={reload}
          onCreatePerson={handleCreatePerson}
          onAddRelative={handleAddRelative}
          onAddParents={handleAddParents}
          onConnect={handleConnect}
        />
      )}
    </div>
  );
}

/** ダイアログの中身。モードごとの出し分けをここにまとめる。 */
function DialogContent({
  dialog,
  treeId,
  graph,
  canEdit,
  settings,
  onClose,
  onSelectPerson,
  onChanged,
  onCreatePerson,
  onAddRelative,
  onAddParents,
  onConnect,
}: {
  dialog: DialogMode;
  treeId: string;
  graph: TreeGraph;
  canEdit: boolean;
  settings: {
    settings: ReturnType<typeof useViewSettings>['settings'];
    updateSetting: ReturnType<typeof useViewSettings>['update'];
  };
  onClose: () => void;
  onSelectPerson: (personId: string) => void;
  onChanged: () => Promise<void>;
  onCreatePerson: (input: PersonInput) => Promise<void>;
  onAddRelative: (
    personId: string,
    relation: RelativeKind,
    input: PersonInput,
    otherParentId: string | null,
  ) => Promise<void>;
  onAddParents: (personId: string, draft: ParentsDraft) => Promise<void>;
  onConnect: (personId: string, relation: ConnectionKind, otherId: string) => Promise<void>;
}) {
  const person =
    'personId' in dialog ? (graph.persons.find((p) => p.id === dialog.personId) ?? null) : null;

  if (dialog.kind === 'settings') {
    return (
      <PersonDialog title="表示設定" onClose={onClose}>
        <ViewSettingsPanel settings={settings.settings} onChange={settings.updateSetting} />
      </PersonDialog>
    );
  }

  if (dialog.kind === 'add-person') {
    return (
      <PersonDialog title="人物を追加" onClose={onClose}>
        <PersonForm submitLabel="追加" onSubmit={onCreatePerson} onCancel={onClose} />
      </PersonDialog>
    );
  }

  if (!person) return null;

  if (dialog.kind === 'detail') {
    return (
      <PersonDialog title={displayName(person)} onClose={onClose}>
        <PersonDetail
          treeId={treeId}
          graph={graph}
          person={person}
          canEdit={canEdit}
          onSelectPerson={onSelectPerson}
          onChanged={onChanged}
        />
      </PersonDialog>
    );
  }

  if (dialog.kind === 'edit') {
    return (
      <PersonDialog title={`${displayName(person)} を編集`} onClose={onClose}>
        <PersonForm
          initial={person}
          submitLabel="保存"
          derivedBirthOrder={deriveBirthOrder(graph, person.id)}
          onSubmit={async (input) => {
            await api.updatePerson(treeId, person.id, input);
            await onChanged();
            onClose();
          }}
          onCancel={onClose}
        />
      </PersonDialog>
    );
  }

  if (dialog.kind === 'add-relative') {
    return (
      <PersonDialog
        title={`${displayName(person)} の${RELATIVE_LABELS[dialog.relation]}を追加`}
        onClose={onClose}
      >
        <AddRelativeForm
          graph={graph}
          person={person}
          relation={dialog.relation}
          onSubmit={(input, otherParentId) =>
            onAddRelative(person.id, dialog.relation, input, otherParentId)
          }
          onCancel={onClose}
        />
      </PersonDialog>
    );
  }

  if (dialog.kind === 'add-parents') {
    return (
      <PersonDialog title={`${displayName(person)} の両親を追加`} onClose={onClose}>
        <ParentsForm
          defaultFamilyName={person.familyName}
          defaultFamilyNameKana={person.familyNameKana}
          onSubmit={(draft) => onAddParents(person.id, draft)}
          onCancel={onClose}
        />
      </PersonDialog>
    );
  }

  return (
    <PersonDialog
      title={`${displayName(person)} の${CONNECT_LABELS[dialog.relation]}につなぐ`}
      onClose={onClose}
    >
      <PersonPicker
        graph={graph}
        personId={person.id}
        kind={dialog.relation}
        onPick={(otherId) => onConnect(person.id, dialog.relation, otherId)}
        onCancel={onClose}
      />
    </PersonDialog>
  );
}
