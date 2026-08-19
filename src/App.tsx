import { Link, Route, Routes, useLocation } from 'react-router-dom';

import { VersionBadge } from '@/features/app/VersionBadge';
import { BridgesPage } from '@/features/bridges/BridgesPage';
import { HousesPage } from '@/features/houses/HousesPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useAuth } from '@/features/auth/useAuth';
import { HistoryPage } from '@/features/history/HistoryPage';
import { AcceptInvitePage } from '@/features/members/AcceptInvitePage';
import { MembersPage } from '@/features/members/MembersPage';
import { DemoPage } from '@/features/tree-view/DemoPage';
import { TabBar } from '@/features/app/TabBar';
import { HomePage } from '@/features/home/HomePage';
import { ImportPage } from '@/features/import/ImportPage';
import { PeoplePage } from '@/features/people/PeoplePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TreeDetailPage } from '@/features/trees/TreeDetailPage';

export default function App() {
  return (
    <div className="app">
      <AppHeader />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/trees/:treeId"
          element={
            <RequireAuth>
              <TreeDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/trees/:treeId/people"
          element={
            <RequireAuth>
              <PeoplePage />
            </RequireAuth>
          }
        />
        <Route
          path="/trees/:treeId/import"
          element={
            <RequireAuth>
              <ImportPage />
            </RequireAuth>
          }
        />
        <Route
          path="/trees/:treeId/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/trees/:treeId/members"
          element={
            <RequireAuth>
              <MembersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/trees/:treeId/history"
          element={
            <RequireAuth>
              <HistoryPage />
            </RequireAuth>
          }
        />
        <Route
          path="/trees/:treeId/bridges"
          element={
            <RequireAuth>
              <BridgesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/trees/:treeId/houses"
          element={
            <RequireAuth>
              <HousesPage />
            </RequireAuth>
          }
        />
        {/* 開発時のみのツリービュー確認用。本番ビルドでは到達できない。 */}
        {import.meta.env.DEV && <Route path="/demo" element={<DemoPage />} />}
        <Route path="*" element={<NotFound />} />
      </Routes>
      <TabBarSlot />
    </div>
  );
}

/**
 * 画面下のタブを出す場所。
 *
 * ログインと招待の受諾では出さない。まだどの家系図にも属していないので、
 * 行き先が無いタブが並ぶだけになる。
 */
function TabBarSlot() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const hidden = pathname === '/login' || pathname.startsWith('/invite');

  if (!user || hidden) return null;
  return <TabBar />;
}

/**
 * 画面いちばん上の細い帯。
 *
 * 行き先は下のタブに集めたので、ここには名前と、開いているビルドの目印だけを置く。
 * ログアウトは設定へ移した（毎画面で押せる必要はなく、誤って押すほうが困る）。
 */
function AppHeader() {
  return (
    <header className="app__header">
      <Link to="/" className="app__brand">
        絆ツリー
      </Link>
      <VersionBadge />
    </header>
  );
}

function NotFound() {
  return (
    <main className="page">
      <h1>ページが見つかりません</h1>
      <Link to="/">一覧へ戻る</Link>
    </main>
  );
}
