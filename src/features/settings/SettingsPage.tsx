import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { rememberTree } from '@/features/app/lastTree';
import { useAppUpdate } from '@/features/app/useAppUpdate';
import { useInstallPrompt } from '@/features/app/useInstallPrompt';
import { useAuth } from '@/features/auth/useAuth';
import * as api from '@/lib/api';
import { nicknameProblem } from '@/lib/nickname';
import { ROLE_LABELS, type TreeRole } from '@/types/models';

/**
 * 設定。家系図まわりの管理画面への入口をここへ集める。
 *
 * これまで家系図の画面の「⋯」に隠れていたので、何があるのか分からなかった。
 * 下のタブから1タップで届く場所に、名前と説明を添えて並べる。
 */
export function SettingsPage() {
  const { treeId = '' } = useParams();
  const { user, signOut, changePassword } = useAuth();
  const install = useInstallPrompt();
  const app = useAppUpdate();
  const [treeName, setTreeName] = useState('');
  const [role, setRole] = useState<TreeRole | null>(null);
  const [loading, setLoading] = useState(true);
  /** 名前の編集中の値。開いている間だけ持つ */
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [tree, myRole] = await Promise.all([api.getTree(treeId), api.getMyRole(treeId)]);
      setTreeName(tree.name);
      setRole(myRole);
    } finally {
      setLoading(false);
    }
  }, [treeId]);

  /** 家系図の名前を変える。オーナーだけが行える。 */
  async function handleRename(event: FormEvent) {
    event.preventDefault();
    const name = editing?.trim();
    if (!name || name === treeName) {
      setEditing(null);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.updateTree(treeId, { name });
      setEditing(null);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '名前を変えられませんでした');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    rememberTree(treeId);
    void reload();
  }, [reload, treeId]);

  if (loading) return <p className="page__status">読み込み中…</p>;

  const isOwner = role === 'owner';

  return (
    <main className="home">
      <header className="home__head">
        <div>
          <p className="home__greeting">{treeName}</p>
          <h1 className="home__title">設定</h1>
        </div>
      </header>

      {error && <p className="alert alert--error">{error}</p>}

      {/* 家系図の名前。表札にあたるので、変えられるのはオーナーだけ */}
      {isOwner &&
        (editing === null ? (
          <ul className="menu-list">
            <li className="menu-list__row">
              <span className="menu-list__title">家系図の名前</span>
              <span className="menu-list__note">{treeName}</span>
              <button
                type="button"
                className="button menu-list__action"
                onClick={() => setEditing(treeName)}
              >
                変える
              </button>
            </li>
          </ul>
        ) : (
          <form className="home__create" onSubmit={handleRename}>
            <label className="field field--grow">
              <span className="field__label">家系図の名前</span>
              <input
                type="text"
                value={editing}
                maxLength={120}
                autoFocus
                onChange={(event) => setEditing(event.target.value)}
              />
            </label>
            <button type="submit" className="button button--primary" disabled={busy}>
              保存
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              やめる
            </button>
          </form>
        ))}

      {/*
        管理にあたるものは、オーナーだけに出す。
        押しても断られる行き先が並んでいると、何が自分にできるのか分からなくなる。
      */}
      <ul className="menu-list">
        <MenuLink to={`/trees/${treeId}/people`} title="家族" note="登録されている人を一覧で見る" />
        <MenuLink to={`/trees/${treeId}/members`} title="メンバー" note="この家系図を見る人たち" />
        {isOwner && (
          <>
            <MenuLink to={`/trees/${treeId}/houses`} title="家の管理" note="◯◯家のまとまりと所属" />
            <MenuLink
              to={`/trees/${treeId}/bridges`}
              title="家どうしのつながり"
              note="他の家の家系図と合わせて見る"
            />
            <MenuLink
              to={`/trees/${treeId}/import`}
              title="家系図を取り込む"
              note="すいすい家系図の書き出し（.ftz）から足す"
            />
            <MenuLink
              to={`/trees/${treeId}/audit`}
              title="変更履歴"
              note="誰がいつ何を変えたか（メンバーごとに見られる）"
            />
            <MenuLink
              to={`/trees/${treeId}/history`}
              title="ゴミ箱"
              note="消した人を戻す・完全に消す・記録の後始末"
            />
          </>
        )}
      </ul>

      {!install.installed && (
        <>
          <p className="home__label home__section">アプリとして使う</p>
          <ul className="menu-list">
            <li className="menu-list__row">
              <span className="menu-list__title">ホーム画面に追加</span>
              <span className="menu-list__note">
                {install.available
                  ? 'アドレスバーの無い画面で開けます'
                  : 'ブラウザの共有メニュー →「ホーム画面に追加」'}
              </span>
              {install.available && (
                <button
                  type="button"
                  className="button menu-list__action"
                  onClick={() => void install.install()}
                >
                  追加
                </button>
              )}
            </li>
          </ul>
        </>
      )}

      <p className="home__label home__section">呼び名</p>
      <NicknameForm />

      {/* ニックネームで使っている人は、仮のパスワードをもらったらここで決め直す */}
      {user?.providerData?.some((entry) => entry.providerId === 'password') && (
        <>
          <p className="home__label home__section">パスワード</p>
          <PasswordForm onSubmit={changePassword} />
        </>
      )}

      {/* 困りごとの持って行き先。管理ではないので、誰にでも出す */}
      <p className="home__label home__section">こまったとき</p>
      <ul className="menu-list">
        <MenuLink
          to={`/trees/${treeId}/guide`}
          title="使い方ガイド"
          note="段・配置・家など、見ただけでは分かりにくいところ"
        />
        <MenuLink
          to={`/trees/${treeId}/feedback`}
          title="ご意見・不具合"
          note="うまくいかないこと・こうしてほしいことを送る"
        />
      </ul>

      <p className="home__label home__section">アプリの更新</p>
      <ul className="menu-list">
        <li className="menu-list__row">
          <span className="menu-list__title">
            {app.available ? '新しい版があります' : 'いまが最新です'}
          </span>
          <span className="menu-list__note">この端末の版: {app.version}</span>
          <button
            type="button"
            className="button menu-list__action"
            disabled={app.checking}
            onClick={() => (app.available ? void app.update() : void app.check())}
          >
            {app.available ? '更新する' : '確認'}
          </button>
        </li>
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

/**
 * 呼び名（ニックネーム）を決める。
 *
 * メンバーの一覧に出るのはこの名前で、ログインに使うアドレスは出ない。
 * いつでも変えられる。決めていないうちは一覧に「名前未設定」と出る。
 */
function NicknameForm() {
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void api
      .getMyNickname()
      .then((found) => setNickname(found ?? ''))
      .catch(() => setNickname(''))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="note">読み込み中…</p>;

  return (
    <form
      className="home__create"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setDone(false);

        const problem = nicknameProblem(nickname);
        if (problem) {
          setError(problem);
          return;
        }

        setBusy(true);
        void api
          .setMyNickname(nickname)
          .then(() => setDone(true))
          .catch((caught: unknown) =>
            setError(caught instanceof Error ? caught.message : '変えられませんでした'),
          )
          .finally(() => setBusy(false));
      }}
    >
      <label className="field field--grow">
        <span className="field__label">
          メンバーの一覧に出る名前{done && <span className="note"> ・保存しました</span>}
        </span>
        <input
          type="text"
          value={nickname}
          maxLength={20}
          placeholder="例: たろう"
          onChange={(event) => setNickname(event.target.value)}
        />
      </label>
      <button type="submit" className="button button--primary" disabled={busy}>
        呼び名を保存
      </button>
      {error && <p className="alert alert--error">{error}</p>}
    </form>
  );
}

/**
 * 自分のパスワードを変える。仮のパスワードを受け取った人が最初に通る場所。
 *
 * いまのパスワードは訊かない（仮のものを打ち直させても手間が増えるだけ）。
 * 打ち間違いだけは避けたいので、新しいパスワードを2回入れてもらう。
 */
function PasswordForm({ onSubmit }: { onSubmit: (nextPassword: string) => Promise<void> }) {
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setDone(false);

        if (next.length < 8) {
          setError('新しいパスワードは8文字以上にしてください');
          return;
        }
        if (next !== again) {
          setError('2つのパスワードが違います');
          return;
        }

        setBusy(true);
        void onSubmit(next)
          .then(() => {
            setDone(true);
            setNext('');
            setAgain('');
          })
          .catch((caught: unknown) =>
            setError(caught instanceof Error ? caught.message : '変えられませんでした'),
          )
          .finally(() => setBusy(false));
      }}
    >
      {error && <p className="alert alert--error">{error}</p>}
      {done && <p className="note">パスワードを変えました。</p>}

      <label className="field form__wide">
        <span className="field__label">新しいパスワード（8文字以上）</span>
        <input
          type="password"
          value={next}
          autoComplete="new-password"
          required
          onChange={(event) => setNext(event.target.value)}
        />
      </label>

      <label className="field form__wide">
        <span className="field__label">確認のため、もう一度</span>
        <input
          type="password"
          value={again}
          autoComplete="new-password"
          required
          onChange={(event) => setAgain(event.target.value)}
        />
      </label>

      <div className="form__actions">
        <button type="submit" className="button button--primary" disabled={busy}>
          パスワードを変える
        </button>
      </div>
    </form>
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
