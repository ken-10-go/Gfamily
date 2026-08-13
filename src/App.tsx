import { Route, Routes } from 'react-router-dom';

function Home() {
  return (
    <main className="page">
      <h1>家系図共有アプリ</h1>
      <p>
        プロジェクトの雛形です。認証・人物/関係のCRUD・ツリービューはこれから実装します。
      </p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="page">
      <h1>ページが見つかりません</h1>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
