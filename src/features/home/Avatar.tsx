import { displayName, type Person } from '@/types/models';

/**
 * 丸いアバター。写真は未実装なので、姓か名の1文字を出す。
 *
 * 色は人物IDから決める。同じ人はいつも同じ色になり、一覧の中で見分けが付く
 * （性別で塗り分けると、不明の人だけが浮いてしまう）。
 */
const COLORS = ['#c97b4a', '#a3b98a', '#e6c9b3', '#dfe6cc', '#e8d9b5', '#b98a7a'];

export function Avatar({ person, size = 38 }: { person: Person; size?: number }) {
  const initial = (person.familyName ?? person.givenName ?? '？').trim().slice(0, 1);
  const index = [...person.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % COLORS.length;

  return (
    <span
      className="avatar"
      aria-hidden="true"
      title={displayName(person)}
      style={{
        width: size,
        height: size,
        background: COLORS[index],
        fontSize: Math.round(size * 0.36),
      }}
    >
      {initial}
    </span>
  );
}
