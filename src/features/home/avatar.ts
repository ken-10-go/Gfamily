import { type Person } from '@/types/models';

/**
 * 丸アバターの見た目。一覧でも家系図のカードでも同じものを使う。
 *
 * 写真はまだ扱えないので、姓（無ければ名）の1文字を出す。
 * 色は人物IDから決める。同じ人はどの画面でも同じ色になり、
 * 一覧で見た人を図の中から見つけやすい。
 * 性別で塗り分けないのは、分からない人だけが浮いてしまうため。
 *
 * 純粋関数。描画から切り離してテストできる。
 */
export const AVATAR_COLORS = [
  '#c97b4a',
  '#a3b98a',
  '#d9a273',
  '#8fa9c9',
  '#c48fa0',
  '#b98a7a',
] as const;

export function avatarColor(personId: string): string {
  const sum = [...personId].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export function avatarInitial(person: Pick<Person, 'familyName' | 'givenName'>): string {
  return (person.familyName ?? person.givenName ?? '？').trim().slice(0, 1) || '？';
}
