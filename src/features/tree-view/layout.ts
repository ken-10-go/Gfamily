import { compareForDisplay } from '@/lib/relations';
import type { ParentChild, Person, TreeGraph, Union } from '@/types/models';

export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 64;
/** 同世代のカード間の最小間隔 */
export const H_GAP = 28;
/** 世代間の縦の間隔 */
export const V_GAP = 96;

const SLOT = NODE_WIDTH + H_GAP;
const ROW = NODE_HEIGHT + V_GAP;

export interface LayoutNode {
  person: Person;
  /** カード中心のX座標 */
  x: number;
  /** カード上端のY座標 */
  y: number;
  generation: number;
}

/** 親の組と、その組に属する子のまとまり。きょうだいはここから導出される。 */
export interface FamilyUnit {
  key: string;
  parentIds: string[];
  childIds: string[];
}

export interface CoupleLink {
  id: string;
  partner1Id: string;
  partner2Id: string;
  status: Union['status'];
}

/**
 * 並び順を決めるための、きょうだいのまとまり。
 * 線を引くための FamilyUnit とは別に持つ。
 */
export interface SiblingGroup {
  key: string;
  parentIds: string[];
  /** 表示順に並んだ子。ドラッグでの並べ替えもこの単位で行う。 */
  childIds: string[];
}

export interface TreeLayout {
  nodes: LayoutNode[];
  families: FamilyUnit[];
  /** きょうだいの並び。手動の並べ替えはこのまとまりの中で行う。 */
  siblingGroups: SiblingGroup[];
  couples: CoupleLink[];
  width: number;
  height: number;
}

/**
 * 家系図のレイアウトを計算する。
 *
 * 方針:
 *   1. 親子関係から世代（縦位置）を決め、配偶者は同じ世代に揃える
 *   2. 同じ親の組を持つ子をまとめて「家族単位」にする
 *   3. 家族単位を深さ優先で下からたどり、子を並べてから親をその中央に置く
 *
 * 同世代では「次に空いているX座標」を単調増加で消費するため、カードが重なることはない。
 */
export function computeLayout(graph: TreeGraph): TreeLayout {
  const persons = graph.persons.filter((p) => !p.deletedAt);
  const personById = new Map(persons.map((p) => [p.id, p]));

  // 削除済みの人物を指す関係は無視する
  const parentChild = graph.parentChild.filter(
    (pc) => !pc.deletedAt && personById.has(pc.parentId) && personById.has(pc.childId),
  );
  const unions = graph.unions.filter(
    (u) => !u.deletedAt && personById.has(u.partner1Id) && personById.has(u.partner2Id),
  );

  if (persons.length === 0) {
    return { nodes: [], families: [], siblingGroups: [], couples: [], width: 0, height: 0 };
  }

  const generations = computeGenerations(persons, parentChild, unions);
  const families = buildFamilyUnits(persons, parentChild, unions, personById);

  const comparePersonIds = (a: string, b: string) => {
    const left = personById.get(a);
    const right = personById.get(b);
    return left && right ? compareForDisplay(left, right) : 0;
  };
  const groups = buildSiblingGroups(families, comparePersonIds);

  const groupsWhereParent = new Map<string, SiblingGroup[]>();
  for (const group of groups) {
    for (const parentId of group.parentIds) {
      const list = groupsWhereParent.get(parentId) ?? [];
      list.push(group);
      groupsWhereParent.set(parentId, list);
    }
  }

  const centerX = new Map<string, number>();
  const placedGroups = new Set<string>();
  /** 世代ごとの「次に空いている左端X」 */
  const cursor = new Map<number, number>();

  function reserve(generation: number, count: number, desiredCenter?: number): number {
    const width = count * SLOT;
    const min = cursor.get(generation) ?? 0;
    const left =
      desiredCenter === undefined ? min : Math.max(min, desiredCenter - width / 2);
    cursor.set(generation, left + width);
    return left;
  }

  function placePerson(personId: string): void {
    if (centerX.has(personId)) return;

    // 親として属するきょうだいグループがあれば、そのグループごと配置する
    const ownGroups = groupsWhereParent.get(personId);
    const pending = ownGroups?.find((group) => !placedGroups.has(group.key));
    if (pending) {
      placeGroup(pending);
      if (centerX.has(personId)) return;
    }

    const generation = generations.get(personId) ?? 0;
    centerX.set(personId, reserve(generation, 1) + SLOT / 2);
  }

  function placeGroup(group: SiblingGroup): void {
    if (placedGroups.has(group.key)) return;
    placedGroups.add(group.key);

    // 子を先に配置し、その中央に親を置く（下から上へ組み上げる）
    const childCenters: number[] = [];
    for (const childId of group.childIds) {
      placePerson(childId);
      const x = centerX.get(childId);
      if (x !== undefined) childCenters.push(x);
    }

    const desiredCenter =
      childCenters.length > 0
        ? (Math.min(...childCenters) + Math.max(...childCenters)) / 2
        : undefined;

    const generation = generations.get(group.parentIds[0]) ?? 0;
    const unplaced = group.parentIds.filter((id) => !centerX.has(id));

    if (unplaced.length > 0) {
      // 既に配置済みの親（再婚などで別のグループから置かれた）があれば、その隣に続ける
      const placedParentX = group.parentIds
        .filter((id) => centerX.has(id))
        .map((id) => centerX.get(id) as number);

      const anchor = placedParentX.length > 0 ? Math.max(...placedParentX) + SLOT : desiredCenter;
      const left = reserve(
        generation,
        unplaced.length,
        placedParentX.length > 0 ? anchor : desiredCenter,
      );

      unplaced.forEach((id, index) => {
        centerX.set(id, left + index * SLOT + SLOT / 2);
      });
    }
  }

  const birthOf = (id: string) => personById.get(id)?.birthDate ?? '';
  const earliest = (ids: string[]) => ids.map(birthOf).filter(Boolean).sort()[0];

  /** 親の生年を優先し、無ければ子の生年で代用する。どちらも不明なグループは右端へ。 */
  const groupBirthKey = (group: SiblingGroup) =>
    earliest(group.parentIds) ?? earliest(group.childIds) ?? '9999';

  // 上の世代から順に着手し、同じ世代では年長の家族から置く。
  // 配置は先着順に左から詰めるので、この順番がそのまま左右の並びになる。
  // ここを ID 順にすると、つながりのない家系どうしが登録順で並んでしまう。
  // 親の生年が同じ場合に子の生年で決めるのは、親を共有する家族どうしを年長の子から置くため。
  const orderedGroups = [...groups].sort(
    (a, b) =>
      (generations.get(a.parentIds[0]) ?? 0) - (generations.get(b.parentIds[0]) ?? 0) ||
      groupBirthKey(a).localeCompare(groupBirthKey(b)) ||
      (earliest(a.childIds) ?? '9999').localeCompare(earliest(b.childIds) ?? '9999') ||
      a.key.localeCompare(b.key),
  );
  for (const group of orderedGroups) {
    placeGroup(group);
  }
  // どの家族単位にも属さない人物
  for (const person of sortPersons(persons)) {
    placePerson(person.id);
  }

  const minX = Math.min(...[...centerX.values()]) - NODE_WIDTH / 2;
  const nodes: LayoutNode[] = persons.map((person) => {
    const generation = generations.get(person.id) ?? 0;
    return {
      person,
      x: (centerX.get(person.id) ?? 0) - minX,
      y: generation * ROW,
      generation,
    };
  });

  const maxGeneration = Math.max(...nodes.map((n) => n.generation));
  const width = Math.max(...nodes.map((n) => n.x)) + NODE_WIDTH / 2;
  const height = maxGeneration * ROW + NODE_HEIGHT;

  return {
    nodes,
    families,
    siblingGroups: groups,
    couples: unions.map((u) => ({
      id: u.id,
      partner1Id: u.partner1Id,
      partner2Id: u.partner2Id,
      status: u.status,
    })),
    width,
    height,
  };
}

const isSubsetOf = (a: string[], b: string[]) => a.every((id) => b.includes(id));

/**
 * 家族単位から、並び順のためのきょうだいグループを作る。
 *
 * 親の組が他の単位の部分集合になっている単位は、親の登録漏れとみなして統合する。
 * 例: 長女には父母を、長男には父だけを紐づけた場合、{父} は {父,母} に吸収され、
 * 3人が1つのきょうだいとして年齢順に並ぶ。統合しないと別の集団として左右に分かれ、
 * 「1978 → 1982 → 1980」のように年齢が交ざらない並びになる。
 *
 * 再婚のように {父,母A} と {父,母B} が並ぶ場合は、互いに部分集合でないので統合しない。
 * 受け入れ先が複数あってどちらの子か決められないときも、推測せず別のままにする。
 *
 * ここで統合するのはあくまで配置の順番であって、連結線は元の家族単位のまま引く。
 * 統合して線まで引くと、紐づいていない親からも線が伸びてデータにない関係を描いてしまう。
 */
function buildSiblingGroups(
  units: FamilyUnit[],
  comparePersonIds: (a: string, b: string) => number,
): SiblingGroup[] {
  // 親の多い単位から見ていくと、部分集合の受け入れ先が先に出来上がる
  const byParentCount = [...units].sort((a, b) => b.parentIds.length - a.parentIds.length);
  const groups: SiblingGroup[] = [];

  for (const unit of byParentCount) {
    const hosts = groups.filter((group) => isSubsetOf(unit.parentIds, group.parentIds));

    if (hosts.length === 1) {
      hosts[0].childIds.push(...unit.childIds);
      continue;
    }

    groups.push({
      key: unit.key,
      parentIds: [...unit.parentIds],
      childIds: [...unit.childIds],
    });
  }

  for (const group of groups) {
    group.childIds = [...new Set(group.childIds)].sort(comparePersonIds);
  }

  return groups;
}

/**
 * 世代を決める。親より必ず1つ下、配偶者とは同じ世代になるまで緩和を繰り返す。
 * データに循環があっても止まるよう、反復回数に上限を設ける。
 */
function computeGenerations(
  persons: Person[],
  parentChild: ParentChild[],
  unions: Union[],
): Map<string, number> {
  const generations = new Map(persons.map((p) => [p.id, 0]));
  const maxIterations = persons.length + 2;

  for (let i = 0; i < maxIterations; i++) {
    let changed = false;

    for (const pc of parentChild) {
      const want = (generations.get(pc.parentId) ?? 0) + 1;
      if (want > (generations.get(pc.childId) ?? 0)) {
        generations.set(pc.childId, want);
        changed = true;
      }
    }

    for (const union of unions) {
      const level = Math.max(
        generations.get(union.partner1Id) ?? 0,
        generations.get(union.partner2Id) ?? 0,
      );
      for (const id of [union.partner1Id, union.partner2Id]) {
        if ((generations.get(id) ?? 0) < level) {
          generations.set(id, level);
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  return generations;
}

/**
 * 家族単位を作る。同じ親の組を持つ子は1つの単位にまとまり、これがきょうだい関係になる。
 * 子のいない夫婦も、連結線を引くために単位として持つ。
 */
function buildFamilyUnits(
  persons: Person[],
  parentChild: ParentChild[],
  unions: Union[],
  personById: Map<string, Person>,
): FamilyUnit[] {
  const parentsByChild = new Map<string, string[]>();
  for (const pc of parentChild) {
    const list = parentsByChild.get(pc.childId) ?? [];
    list.push(pc.parentId);
    parentsByChild.set(pc.childId, list);
  }

  const units = new Map<string, FamilyUnit>();

  for (const person of sortPersons(persons)) {
    const parentIds = parentsByChild.get(person.id);
    if (!parentIds || parentIds.length === 0) continue;

    const sorted = [...new Set(parentIds)].sort();
    const key = sorted.join('|');
    const unit = units.get(key) ?? { key, parentIds: sorted, childIds: [] };
    unit.childIds.push(person.id);
    units.set(key, unit);
  }

  // 子のいない夫婦
  for (const union of unions) {
    const key = [union.partner1Id, union.partner2Id].sort().join('|');
    if (!units.has(key)) {
      units.set(key, { key, parentIds: key.split('|'), childIds: [] });
    }
  }

  // きょうだいは左から年長者順に並べる。生年が分からない子は後ろに回す。
  for (const unit of units.values()) {
    unit.childIds.sort((a, b) => {
      const left = personById.get(a);
      const right = personById.get(b);
      if (!left || !right) return 0;
      return compareForDisplay(left, right);
    });
  }

  // 親が1人の単位でも、その親に配偶者がいれば同じ行に並べたいので単位はそのままにする
  return [...units.values()].filter((unit) => unit.parentIds.every((id) => personById.has(id)));
}

/** 生年順（不明は後ろ）。並びの基準は relations.ts と共有する。 */
function sortPersons(persons: Person[]): Person[] {
  return [...persons].sort(compareForDisplay);
}
