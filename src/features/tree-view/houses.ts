/**
 * 「家」——血のつながりでまとまった一群。
 *
 * 家系図が大きくなると、姻族（佐々木家・井川家…）が世代の空いている場所へ
 * 押し出されて、血縁のまとまりが散らばってしまう。
 * 配置・表示・将来の権限を、この「家」という同じ単位でそろえるための土台。
 *
 * 家の決め方は **婚姻の線を外して親子だけでたどった連結成分**。
 * 婚姻は家と家を「つなぐ」ものなので、たどる対象から外すと家の輪郭が出る。
 * 名前は、その一群でいちばん多い姓から「◯◯家」とする。
 * 改姓や婿養子で実感と食い違うときは、人物ごとに `houseId` で上書きできる。
 *
 * 純粋関数だけを置く。
 */

import type { House, Person, TreeGraph } from '@/types/models';

/** 自動で見つけた家。まだ保存されていないので id を持たない。 */
export interface DetectedHouse {
  /** 自動判定の識別子。並びが変わっても同じ一群なら同じ値になる */
  key: string;
  name: string;
  memberIds: string[];
}

/**
 * 婚姻を無視して、親子だけでたどった一群に分ける。
 *
 * 誰ともつながっていない人は、その人ひとりの家になる。
 * 削除済みの人物と、その人物を指す関係は数えない。
 */
export function bloodGroups(graph: TreeGraph): string[][] {
  const persons = graph.persons.filter((person) => !person.deletedAt);
  const alive = new Set(persons.map((person) => person.id));

  // 連結成分を union-find で求める。親子の向きは見ない（同じ家に属するかだけ）
  const parent = new Map(persons.map((person) => [person.id, person.id]));

  const find = (id: string): string => {
    let root = id;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) ?? root;
    // 経路圧縮。深い家系でも遅くならない
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor) ?? cursor;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  for (const pc of graph.parentChild) {
    if (pc.deletedAt || !alive.has(pc.parentId) || !alive.has(pc.childId)) continue;

    const [a, b] = [find(pc.parentId), find(pc.childId)];
    if (a !== b) parent.set(a, b);
  }

  const groups = new Map<string, string[]>();
  for (const person of persons) {
    const root = find(person.id);
    groups.set(root, [...(groups.get(root) ?? []), person.id]);
  }

  return [...groups.values()];
}

/**
 * その一群の呼び名。いちばん多い姓から「◯◯家」とする。
 * 同数なら、いちばん上の世代に近い人（登録順の先頭）の姓を採る。
 * 姓が1つも無ければ「名前のない家」。
 */
export function houseNameOf(members: Person[]): string {
  const counts = new Map<string, number>();
  for (const member of members) {
    const name = member.familyName?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  if (counts.size === 0) return '名前のない家';

  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1] || 0);
  return `${best[0]}家`;
}

/**
 * 自動で見つけた家の一覧。人数の多い順に返す。
 *
 * `key` は一群の人物IDのうち辞書順で最小のもの。並び順や登録順が変わっても、
 * 同じ顔ぶれなら同じ値になるので、保存した家と結びつけるのに使える。
 */
export function detectHouses(graph: TreeGraph): DetectedHouse[] {
  const personById = new Map(graph.persons.map((person) => [person.id, person]));

  return bloodGroups(graph)
    .map((memberIds) => {
      const sorted = [...memberIds].sort();
      const members = sorted
        .map((id) => personById.get(id))
        .filter((person): person is Person => Boolean(person));

      return { key: sorted[0], name: houseNameOf(members), memberIds: sorted };
    })
    .sort((a, b) => b.memberIds.length - a.memberIds.length || a.key.localeCompare(b.key));
}

/** 人物がどの家に属するか。表示にも配置にも、これを使う。 */
export interface HouseAssignment {
  /** 家の識別子。保存された家なら `House.id`、自動判定なら `DetectedHouse.key` */
  id: string;
  name: string;
  /** 手で指定された家か。自動判定なら false */
  pinned: boolean;
}

/**
 * 人物 → 属する家 の対応を作る。
 *
 * `Person.houseId` が保存された家を指していれば、それを優先する。
 * 指定が無い人は、血のつながりで自動判定した家に入る。
 * 指定が消えた家を指している場合は、指定が無いものとして扱う（データが壊れない）。
 */
export function resolveHouses(
  graph: TreeGraph,
  houses: House[] = [],
): Map<string, HouseAssignment> {
  const byId = new Map(houses.map((house) => [house.id, house]));
  const assignment = new Map<string, HouseAssignment>();

  for (const detected of detectHouses(graph)) {
    for (const id of detected.memberIds) {
      assignment.set(id, { id: detected.key, name: detected.name, pinned: false });
    }
  }

  for (const person of graph.persons) {
    const pinned = person.houseId ? byId.get(person.houseId) : undefined;
    if (pinned) {
      assignment.set(person.id, { id: pinned.id, name: pinned.name, pinned: true });
    }
  }

  return assignment;
}

/** 家ごとの人数。管理画面の一覧に出す。 */
export function houseSizes(assignment: Map<string, HouseAssignment>): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const house of assignment.values()) {
    sizes.set(house.id, (sizes.get(house.id) ?? 0) + 1);
  }
  return sizes;
}
