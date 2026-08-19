import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { rememberTree } from '@/features/app/lastTree';
import { useAuth } from '@/features/auth/useAuth';
import * as api from '@/lib/api';
import { ROLE_LABELS, type TreeRole } from '@/types/models';

/**
 * 設定。家系図まわりの管理画面への入口をここへ集める。
 *
 * これまで家系図の画面の「⋯」に隠れていたので、何があるのか分からなかった。
 * 下のタブから1タップで届く場所に、名前と説明を添えて並べる。
 */
export function SettingsPage() {
  const { treeId = '' } = useParams();
  const { user, signOut } = useAuth();
  const [treeName, setTreeName] = useState('');
  const [role, setRole] = useState<TreeRole | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [tree, myRole] = await Promise.all([api.getTree(treeId), api.getMyRole(treeId)]);
      setTreeName(tree.name);
      setRole(myRole);
    } finally {
      setLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    rememberTree(treeId);
    void reload();
  }, [reload, treeId]);

  if (loading) return <p className="page__status">読み込み中…</p>;

  return (
    <main className="home">
      <header className="home__head">
        <div>
          <p className="home__greeting">{treeName}</p>
          <h1 className="home__title">設定</h1>
        </div>
      </header>

      <ul className="menu-list">
        <MenuLink to={`/trees/${treeId}/people`} title="家族" note="登録されている人を一覧で見る" />
        <MenuLink to={`/trees/${treeId}/houses`} title="家の管理" note="◯◯家のまとまりと所属" />
        <MenuLink to={`/trees/${treeId}/members`} title="メンバー" note="招待と権限" />
        <MenuLink
          to={`/trees/${treeId}/bridges`}
          title="家どうしのつながり"
          note="他の家の家系図と合わせて見る"
        />
        <MenuLink
          to={`/trees/${treeId}/history`}
          title="変更履歴"
          note="誰が何を変えたか・ゴミ箱"
        />
      </ul>

      <p className="home__label home__section">アカウント</p>
      <ul className="menu-list">
        <li className="menu-list__row">
          <span className="menu-list__title">{user?.email}</span>
          <span className="menu-list__note">
            この家系図での権限: {role ? ROLE_LABELS[role] : '—'}
          </span>
        </li>
      </ul>

      <button type="button" className="button home__signout" onClick={() => void signOut()}>
        ログアウト
      </button>
    </main>
  );
}

function MenuLink({ to, title, note }: { to: string; title: string; note: string }) {
  return (
    <li>
      <Link className="menu-list__row" to={to}>
        <span className="menu-list__title">{title}</span>
        <span className="menu-list__note">{note}</span>
        <span className="menu-list__arrow" aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  );
}
