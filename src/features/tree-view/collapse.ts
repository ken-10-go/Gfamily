/**
 * 家を1枚のカードに畳む。
 *
 * 人数が増えると図が横に伸びて、家どうしのつながりが読み取れなくなる。
 * 中身を見なくてよい家を「◯◯家（3人）」の1枚にまとめてしまえば、
 * 家系全体の骨格——どの家がどの家とつながっているか——だけが残る。
 *
 * 畳むのは**描画の直前だけ**で、データには何も足さない。
 * `focusGraph` や `withSpousePlaceholders` と同じく、家系図から家系図への純粋な変換。
 * レイアウト計算より前に挟むので、畳んだカードのぶんの場所も自動で確保される。
 */

import {
  EMPTY_PERSON,
  type ParentChild,
  type Person,
  type TreeGraph,
  type Union,
} from '@/types/models';
import type { HouseAssignment } from '@/features/tree-view/houses';

/** 畳んだ家のカードの ID。家の識別子から作るので、どの家の1枚かがそのまま分かる。 */
export const collapsedHouseId = (houseId: string) => `house:${houseId}`;

/** 畳んだ家のカードなら、その家の識別子を返す。違えば null。 */
export function collapsedHouseTarget(id: string): string | null {
  const prefix = 'house:';
  return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

/**
 * 指定された家を1枚のカードに畳んだ家系図を返す。
 *
 * その家に属する人物をすべて取り除き、代わりに1枚のカードを置く。
 * 家の**外**へ伸びていた親子・婚姻の線は、その1枚につなぎ替える
 * （どの家とつながっているかは畳んでも見えていてほしいため）。
 * 家の**中**で閉じている線は、行き先が同じ1枚になるので落とす。
 *
 * 純粋関数。入力の TreeGraph は書き換えない。
 */
export function collapseHouses(
  graph: TreeGraph,
  assignment: ReadonlyMap<string, HouseAssignment>,
  collapsed: ReadonlySet<string>,
): TreeGraph {
  if (collapsed.size === 0) return graph;

  const persons = graph.persons.filter((person) => !person.deletedAt);

  /** 人物 ID → 畳んだ先のカードの ID。畳まない人はそのまま */
  const redirect = new Map<string, string>();
  const members = new Map<string, Person[]>();

  for (const person of persons) {
    const houseId = assignment.get(person.id)?.id;
    if (!houseId || !collapsed.has(houseId)) continue;

    redirect.set(person.id, collapsedHouseId(houseId));
    members.set(houseId, [...(members.get(houseId) ?? []), person]);
  }

  if (members.size === 0) return graph;

  const to = (id: string) => redirect.get(id) ?? id;

  const cards: Person[] = [...members.entries()].map(([houseId, list]) => ({
    ...EMPTY_PERSON,
    id: collapsedHouseId(houseId),
    familyName: `${assignment.get(list[0].id)?.name ?? '家'}（${list.length}人）`,
    isLiving: true,
  }));

  const parentChild: ParentChild[] = [];
  const seenEdge = new Set<string>();
  for (const pc of graph.parentChild) {
    if (pc.deletedAt) continue;
    const [parentId, childId] = [to(pc.parentId), to(pc.childId)];
    // 家の中で閉じている線。畳んだら自分自身への線になるので落とす
    if (parentId === childId) continue;

    const key = `${parentId}>${childId}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    parentChild.push({ ...pc, parentId, childId });
  }

  const unions: Union[] = [];
  const seenUnion = new Set<string>();
  for (const union of graph.unions) {
    if (union.deletedAt) continue;
    const [partner1Id, partner2Id] = [to(union.partner1Id), to(union.partner2Id)];
    if (partner1Id === partner2Id) continue;

    const key = [partner1Id, partner2Id].sort().join('&');
    if (seenUnion.has(key)) continue;
    seenUnion.add(key);
    unions.push({ ...union, partner1Id, partner2Id });
  }

  return {
    persons: [...persons.filter((person) => !redirect.has(person.id)), ...cards],
    parentChild,
    unions,
  };
}
