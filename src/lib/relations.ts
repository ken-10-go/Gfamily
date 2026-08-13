import type { Person, TreeGraph } from '@/types/models';

/**
 * 親子関係から導かれる情報。
 *
 * 続柄（長男・次女など）は戸籍に書かれている値そのものではなく、
 * 「同じ親を持つきょうだいを生年順に並べたときの位置」から導いている。
 * 実際の戸籍と食い違う場合は人物ごとに手動で上書きできる。
 */

const ORDINALS = ['長', '次', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 「長男」「次女」などの並び順の呼び名。10 を超えたら第N子で表す。 */
function ordinalLabel(index: number, gender: Person['gender']): string {
  const suffix = gender === 'male' ? '男' : gender === 'female' ? '女' : null;

  if (suffix === null || index >= ORDINALS.length) {
    return `第${index + 1}子`;
  }

  return `${ORDINALS[index]}${suffix}`;
}

/** 生年が古い順。分からないものは後ろに置き、同じなら登録順を保つ。 */
export function compareByBirth(a: Person, b: Person): number {
  if (a.birthDate && b.birthDate) return a.birthDate.localeCompare(b.birthDate);
  if (a.birthDate) return -1;
  if (b.birthDate) return 1;
  return a.id.localeCompare(b.id);
}

/**
 * 同じ親の組を持つきょうだいを、年長者順に返す（本人を含む）。
 * 親が登録されていない人物は、きょうだいを特定できないので空配列。
 */
export function siblingsOf(graph: TreeGraph, personId: string): Person[] {
  const parentChild = graph.parentChild.filter((pc) => !pc.deletedAt);
  const personById = new Map(graph.persons.filter((p) => !p.deletedAt).map((p) => [p.id, p]));

  const parentIds = parentChild
    .filter((pc) => pc.childId === personId)
    .map((pc) => pc.parentId)
    .sort();
  if (parentIds.length === 0) return [];

  const key = parentIds.join('|');
  const siblingIds = new Set<string>();

  for (const person of personById.values()) {
    const ownParents = parentChild
      .filter((pc) => pc.childId === person.id)
      .map((pc) => pc.parentId)
      .sort();
    if (ownParents.length > 0 && ownParents.join('|') === key) {
      siblingIds.add(person.id);
    }
  }

  return [...siblingIds]
    .map((id) => personById.get(id))
    .filter((p): p is Person => Boolean(p))
    .sort(compareByBirth);
}

/**
 * 続柄を導く。親が分からない場合や、性別が不明で順位も定まらない場合は null。
 *
 * 男女は別々に数える。長男・長女が同じ家に並び立つのは戸籍の数え方どおり。
 */
export function deriveBirthOrder(graph: TreeGraph, personId: string): string | null {
  const siblings = siblingsOf(graph, personId);
  if (siblings.length === 0) return null;

  const person = siblings.find((p) => p.id === personId);
  if (!person) return null;

  const sameKind = siblings.filter((sibling) =>
    person.gender === 'male' || person.gender === 'female'
      ? sibling.gender === person.gender
      : // 性別が不明な子は、男女を問わない通し番号で数える
        sibling.gender !== 'male' && sibling.gender !== 'female',
  );

  const index = sameKind.findIndex((sibling) => sibling.id === personId);
  if (index < 0) return null;

  return ordinalLabel(index, person.gender);
}

/** 手動指定があればそれを、無ければ自動で導いた続柄を返す。 */
export function birthOrderLabel(graph: TreeGraph, person: Person): string | null {
  return person.birthOrder?.trim() || deriveBirthOrder(graph, person.id);
}
