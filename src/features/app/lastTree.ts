/**
 * 直前に開いた家系図。
 *
 * 画面下のタブはどれも「いま開いている家系図」に対して働くが、ホームや設定から
 * 戻ってきたときは URL に家系図が入っていない。そのときの行き先に使う。
 * 表示の都合だけの値なので、端末の localStorage に置く。
 */
const KEY = 'familytree:lastTree';

export function rememberTree(treeId: string) {
  try {
    window.localStorage.setItem(KEY, treeId);
  } catch {
    // 保存できなくても、開いている間は動く
  }
}

export function lastTreeId(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
