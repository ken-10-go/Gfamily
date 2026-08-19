import { NavLink, useLocation } from 'react-router-dom';

import { lastTreeId } from '@/features/app/lastTree';

/**
 * 画面下のタブ。
 *
 * 片手で持ったときに親指が届くのは画面の下半分なので、行き先と「追加」を
 * すべてそこへ集める（モバイルデザイン仕様 4.2 ボトムヘビー・レイアウト）。
 *
 * タブはどれも「いま開いている家系図」に対して働く。家系図を開いていないときは
 * 直前に開いたものを使い、それも無ければホームへ送る。
 */
export function TabBar() {
  const { pathname } = useLocation();
  // このタブは <Routes> の外に出しているので useParams では拾えない。URL から直接読む
  const current = /^\/trees\/([^/?#]+)/.exec(pathname)?.[1] ?? lastTreeId();

  return (
    <nav className="tabbar" aria-label="メニュー">
      <Tab to="/" label="ホーム" end>
        <path d="M3 12l9-9 9 9" />
        <path d="M5 10v10h14V10" />
      </Tab>

      <Tab to={current ? `/trees/${current}/people` : '/'} label="家族">
        <circle cx="9" cy="7" r="3" />
        <circle cx="16" cy="9" r="2.5" />
        <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
      </Tab>

      {/* 中央の丸。いちばんよく使う「人物を追加」を、いちばん押しやすい場所に置く */}
      <NavLink
        className="tabbar__add"
        to={current ? `/trees/${current}?add=person` : '/'}
        aria-label="人物を追加"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </NavLink>

      <Tab to={current ? `/trees/${current}` : '/'} label="家系図" end>
        <path d="M12 3v6M6 21v-4M18 21v-4" />
        <path d="M6 17h12v-4H6z" />
        <circle cx="12" cy="6" r="3" />
      </Tab>

      <Tab to={current ? `/trees/${current}/settings` : '/'} label="設定">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
      </Tab>
    </nav>
  );
}

function Tab({
  to,
  label,
  end,
  children,
}: {
  to: string;
  label: string;
  end?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => (isActive ? 'tabbar__tab tabbar__tab--active' : 'tabbar__tab')}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        {children}
      </svg>
      <span>{label}</span>
    </NavLink>
  );
}
