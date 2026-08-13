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

export interface TreeLayout {
  nodes: LayoutNode[];
  families: FamilyUnit[];
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
  const persons = graph.persons.filter((p) => !p.deleted_at);
  const personById = new Map(persons.map((p) => [p.id, p]));

  // 削除済みの人物を指す関係は無視する
  const parentChild = graph.parentChild.filter(
    (pc) => !pc.deleted_at && personById.has(pc.parent_id) && personById.has(pc.child_id),
  );
  const unions = graph.unions.filter(
    (u) => !u.deleted_at && personById.has(u.partner1_id) && personById.has(u.partner2_id),
  );

  if (persons.length === 0) {
    return { nodes: [], families: [], couples: [], width: 0, height: 0 };
  }

  const generations = computeGenerations(persons, parentChild, unions);
  const families = buildFamilyUnits(persons, parentChild, unions, personById);

  const unitsWhereParent = new Map<string, FamilyUnit[]>();
  for (const unit of families) {
    for (const parentId of unit.parentIds) {
      const list = unitsWhereParent.get(parentId) ?? [];
      list.push(unit);
      unitsWhereParent.set(parentId, list);
    }
  }

  const centerX = new Map<string, number>();
  const placedUnits = new Set<string>();
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

    // 親として属する家族単位があれば、その単位ごと配置する
    const ownUnits = unitsWhereParent.get(personId);
    const pending = ownUnits?.find((unit) => !placedUnits.has(unit.key));
    if (pending) {
      placeUnit(pending);
      if (centerX.has(personId)) return;
    }

    const generation = generations.get(personId) ?? 0;
    centerX.set(personId, reserve(generation, 1) + SLOT / 2);
  }

  function placeUnit(unit: FamilyUnit): void {
    if (placedUnits.has(unit.key)) return;
    placedUnits.add(unit.key);

    // 子を先に配置し、その中央に親を置く（下から上へ組み上げる）
    const childCenters: number[] = [];
    for (const childId of unit.childIds) {
      placePerson(childId);
      const x = centerX.get(childId);
      if (x !== undefined) childCenters.push(x);
    }

    const desiredCenter =
      childCenters.length > 0
        ? (Math.min(...childCenters) + Math.max(...childCenters)) / 2
        : undefined;

    const generation = generations.get(unit.parentIds[0]) ?? 0;
    const unplaced = unit.parentIds.filter((id) => !centerX.has(id));

    if (unplaced.length > 0) {
      // 既に配置済みの親（再婚などで別の単位から置かれた）があれば、その隣に続ける
      const placedParentX = unit.parentIds
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

  // 上の世代の家族単位から順に着手すると、全体の左右の並びが自然になる
  const orderedUnits = [...families].sort(
    (a, b) =>
      (generations.get(a.parentIds[0]) ?? 0) - (generations.get(b.parentIds[0]) ?? 0) ||
      a.key.localeCompare(b.key),
  );
  for (const unit of orderedUnits) {
    placeUnit(unit);
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
    couples: unions.map((u) => ({
      id: u.id,
      partner1Id: u.partner1_id,
      partner2Id: u.partner2_id,
      status: u.status,
    })),
    width,
    height,
  };
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
      const want = (generations.get(pc.parent_id) ?? 0) + 1;
      if (want > (generations.get(pc.child_id) ?? 0)) {
        generations.set(pc.child_id, want);
        changed = true;
      }
    }

    for (const union of unions) {
      const level = Math.max(
        generations.get(union.partner1_id) ?? 0,
        generations.get(union.partner2_id) ?? 0,
      );
      for (const id of [union.partner1_id, union.partner2_id]) {
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
    const list = parentsByChild.get(pc.child_id) ?? [];
    list.push(pc.parent_id);
    parentsByChild.set(pc.child_id, list);
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
    const key = [union.partner1_id, union.partner2_id].sort().join('|');
    if (!units.has(key)) {
      units.set(key, { key, parentIds: key.split('|'), childIds: [] });
    }
  }

  // 親が1人の単位でも、その親に配偶者がいれば同じ行に並べたいので単位はそのままにする
  return [...units.values()].filter((unit) => unit.parentIds.every((id) => personById.has(id)));
}

/** 生年順（不明は後ろ）→ 氏名順。きょうだいの並びを安定させる。 */
function sortPersons(persons: Person[]): Person[] {
  return [...persons].sort((a, b) => {
    if (a.birth_date && b.birth_date) return a.birth_date.localeCompare(b.birth_date);
    if (a.birth_date) return -1;
    if (b.birth_date) return 1;
    return a.id.localeCompare(b.id);
  });
}
