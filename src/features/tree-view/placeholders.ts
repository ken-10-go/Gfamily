import { spousesOf } from '@/lib/relations';
import {
  EMPTY_PERSON,
  oppositeGender,
  type Person,
  type TreeGraph,
  type Union,
} from '@/types/models';

/** 空の配偶者カードの ID。人物の ID から作るので、誰の枠かがそのまま分かる。 */
export const spousePlaceholderId = (personId: string) => `placeholder:spouse:${personId}`;

/** 空の配偶者カードなら、その相手の人物 ID を返す。違えば null。 */
export function placeholderTarget(id: string): string | null {
  const prefix = 'placeholder:spouse:';
  return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

/**
 * 配偶者が未登録の人に、空の配偶者カードを足した家系図を返す。
 *
 * 「配偶者を追加」への入口をツリー上に置くための描画専用の細工で、データは足さない。
 * レイアウト計算より前に挟むことで、枠のぶんの場所が自動で確保され、
 * 実在のカードと重ならない。
 *
 * 対象は「子がいるか、誰かの子である人」に絞る。家系図に載っている全員に枠を出すと、
 * 枠だけが並んで図が読みにくくなるため。
 *
 * 純粋関数。入力の TreeGraph は書き換えない。
 */
export function withSpousePlaceholders(graph: TreeGraph): TreeGraph {
  const persons = graph.persons.filter((p) => !p.deletedAt);
  const parentChild = graph.parentChild.filter((pc) => !pc.deletedAt);

  const connected = new Set<string>();
  for (const pc of parentChild) {
    connected.add(pc.parentId);
    connected.add(pc.childId);
  }

  const placeholders: Person[] = [];
  const unions: Union[] = [];

  for (const person of persons) {
    if (!connected.has(person.id)) continue;
    if (spousesOf(graph, person.id).length > 0) continue;

    const id = spousePlaceholderId(person.id);
    placeholders.push({
      ...PLACEHOLDER,
      id,
      // 相手が分かっていれば逆の性別で置く。左右の並びが実在のカードと同じになる
      gender: oppositeGender(person.gender),
    });
    unions.push({
      id: `${id}:union`,
      partner1Id: person.id,
      partner2Id: id,
      status: 'married',
      startDate: null,
      endDate: null,
      deletedAt: null,
    });
  }

  if (placeholders.length === 0) return graph;

  return {
    persons: [...graph.persons, ...placeholders],
    parentChild: graph.parentChild,
    unions: [...graph.unions, ...unions],
  };
}

/** 空の配偶者カードの中身。名前の代わりに用途を出す。 */
const PLACEHOLDER: Person = { ...EMPTY_PERSON, givenName: '＋ 配偶者' };
