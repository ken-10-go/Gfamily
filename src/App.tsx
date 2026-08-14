import { Link, Route, Routes } from 'react-router-dom';

import { LoginPage } from '@/features/auth/LoginPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useAuth } from '@/features/auth/useAuth';
import { HistoryPage } from '@/features/history/HistoryPage';
import { AcceptInvitePage } from '@/features/members/AcceptInvitePage';
import { MembersPage } from '@/features/members/MembersPage';
import { DemoPage } from '@/features/tree-view/DemoPage';
import { TreeDetailPage } from '@/features/trees/TreeDetailPage';
import { TreeListPage } from '@/features/trees/TreeListPage';

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
              <TreeListPage />
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
        {/* 開発時のみのツリービュー確認用。本番ビルドでは到達できない。 */}
        {import.meta.env.DEV && <Route path="/demo" element={<DemoPage />} />}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

function AppHeader() {
  const { user, signOut } = useAuth();

  return (
    <header className="app__header">
      <Link to="/" className="app__brand">
        家系図
      </Link>
      {user && (
        <div className="app__account">
          {/* 狭い画面ではメールアドレスを畳む。横幅を取るわりに常時は要らない */}
          <span className="app__email hide-narrow">{user.email}</span>
          <button type="button" className="button" onClick={() => void signOut()}>
            ログアウト
          </button>
        </div>
      )}
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
