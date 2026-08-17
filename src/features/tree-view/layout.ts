import { compareForDisplay } from '@/lib/relations';
import type { ParentChild, ParentKind, Person, TreeGraph, Union } from '@/types/models';

export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 64;
/** 同世代のカード間の最小間隔 */
export const H_GAP = 28;
/** 世代間の縦の間隔 */
export const V_GAP = 96;

/**
 * 手で動かしたカードを合わせる格子。
 *
 * 縦は世代の行そのものに合わせる。自動配置のカードと同じ高さに乗るので、
 * 夫婦の線やきょうだいの横棒が水平につながる。
 * 横は列の半分刻みにして、きょうだいの間に差し込めるようにする。
 */
export function gridFor(metrics: LayoutMetrics): { x: number; y: number } {
  return {
    x: (metrics.nodeWidth + metrics.hGap) / 2,
    y: metrics.nodeHeight + metrics.vGap,
  };
}

/** 座標を格子に合わせる。 */
export const snapTo = (value: number, step: number) => Math.round(value / step) * step;

/** カードの寸法。表示設定（縦書き・UIサイズ）で変わるため引数で受け取る。 */
export interface LayoutMetrics {
  nodeWidth: number;
  nodeHeight: number;
  hGap: number;
  vGap: number;
}

export const DEFAULT_METRICS: LayoutMetrics = {
  nodeWidth: NODE_WIDTH,
  nodeHeight: NODE_HEIGHT,
  hGap: H_GAP,
  vGap: V_GAP,
};

export interface LayoutNode {
  person: Person;
  /** カード中心のX座標 */
  x: number;
  /** カード上端のY座標 */
  y: number;
  generation: number;
  /** 手で置かれた位置か。自動レイアウトに戻せるかの判断に使う。 */
  placedByHand: boolean;
}

/** 親の組と、その組に属する子のまとまり。きょうだいはここから導出される。 */
export interface FamilyUnit {
  key: string;
  parentIds: string[];
  childIds: string[];
  /**
   * 子ごとの親子の種別。関係線を実線と破線で描き分けるために持つ。
   *
   * 1人の子が父とは実子・母とは養子、ということがある（連れ子など）。
   * その場合は実子でないほうを採り、「ここには縁組がある」と分かるようにする。
   */
  childKinds: Record<string, ParentKind>;
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

export interface LayoutOptions {
  /**
   * 手で置いた位置（`person.position`）を無視して、すべて自動配置にする。
   *
   * 絞り込み表示のように、家系図の一部だけを描くときに使う。
   * 手動の座標は家系図の全体を前提に決めた値なので、一部だけを取り出すと
   * 遠くに取り残されたカードになってしまう。データは変えず、描画だけを自動に戻す。
   */
  ignoreManualPositions?: boolean;
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
export function computeLayout(
  graph: TreeGraph,
  metrics: LayoutMetrics = DEFAULT_METRICS,
  options: LayoutOptions = {},
): TreeLayout {
  const SLOT = metrics.nodeWidth + metrics.hGap;
  const ROW = metrics.nodeHeight + metrics.vGap;

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
    const left = desiredCenter === undefined ? min : Math.max(min, desiredCenter - width / 2);
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

  /** 親が全員すでに置かれているなら、その中央。1人でも未配置なら undefined。 */
  function desiredCenterOfPlacedParents(parentIds: string[]): number | undefined {
    const xs = parentIds.map((id) => centerX.get(id)).filter((x): x is number => x !== undefined);
    if (xs.length === 0 || xs.length !== parentIds.length) return undefined;
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  }

  /**
   * 親の真下を希望位置にして、子のぶんの場所をまとめて確保する。
   *
   * 対象は「まだ置かれておらず、自分自身は親でもない子」だけ。
   * 自分の子を持つ人は、その家族ごと配置する経路（placeGroup）に任せる。
   * 世代がそろっている子だけをまとめるのは、reserve が世代ごとに場所を管理するため。
   */
  function reserveChildrenUnder(group: SiblingGroup, center: number): void {
    const simple = group.childIds.filter(
      (id) =>
        !centerX.has(id) && !groupsWhereParent.get(id)?.some((own) => !placedGroups.has(own.key)),
    );
    if (simple.length === 0) return;

    const generation = generations.get(simple[0]) ?? 0;
    const sameRow = simple.filter((id) => (generations.get(id) ?? 0) === generation);

    const left = reserve(generation, sameRow.length, center);
    sameRow.forEach((id, index) => {
      centerX.set(id, left + index * SLOT + SLOT / 2);
    });
  }

  function placeGroup(group: SiblingGroup): void {
    if (placedGroups.has(group.key)) return;
    placedGroups.add(group.key);

    // 子を先に配置し、その中央に親を置く（下から上へ組み上げる）。
    //
    // ただし親がすでに置かれている場合は、この「あとから親を中央へ」が効かない。
    // 何もしないと子はその世代の空いている左端に並ぶだけなので、
    // 新しい世代の最初の子を追加したときに図の左端へ飛んでしまう。
    // 親が決まっているなら、その真下を希望位置にして子を並べる。
    // 実際にどこへ置くかは reserve が決めるので、先客がいれば右へずれ、重なりはしない。
    const underParents = desiredCenterOfPlacedParents(group.parentIds);
    if (underParents !== undefined) {
      reserveChildrenUnder(group, underParents);
    }

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
    // 夫婦は男性を左、女性を右に並べる
    const unplaced = group.parentIds
      .filter((id) => !centerX.has(id))
      .sort((a, b) => compareSpouses(personById.get(a), personById.get(b)));

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

    alignChildrenUnderParents(group);
  }

  /**
   * 親の真下に子が来ていなければ、子（とその下の家系）を右へ寄せてそろえる。
   *
   * 親を子の中央に置こうとしても、その世代の左側がすでに埋まっていれば
   * reserve が親を右へ押し出すため、親子が縦にそろわない。
   * 押し出されたぶんだけ子を追いかけさせる。
   *
   * 動かすのは右だけ。左は先に置いたカードがいるかもしれず、重ねてしまうため。
   * 右も、すでに置かれているカードにぶつかる手前で止める。そろえるのは見栄えの話だが、
   * 重なりは読めなくなる不具合なので、そろわないほうを取る。
   */
  function alignChildrenUnderParents(group: SiblingGroup): void {
    const parentXs = group.parentIds
      .map((id) => centerX.get(id))
      .filter((x): x is number => x !== undefined);
    const childXs = group.childIds
      .map((id) => centerX.get(id))
      .filter((x): x is number => x !== undefined);
    if (parentXs.length === 0 || childXs.length === 0) return;

    const want =
      (Math.min(...parentXs) + Math.max(...parentXs)) / 2 -
      (Math.min(...childXs) + Math.max(...childXs)) / 2;
    if (want <= 0) return;

    // 子だけを動かすと孫が置いていかれるので、下の家系ごと動かす
    const shifted = collectDescendantsAndSpouses(group.childIds);
    const dx = Math.min(want, maxSafeShift(shifted));
    if (dx <= 0) return;

    for (const id of shifted) {
      const x = centerX.get(id);
      if (x === undefined) continue;

      const moved = x + dx;
      centerX.set(id, moved);
      // 動かした先を「使用済み」として記録する。次に同じ世代へ置く人が重ならない。
      const generation = generations.get(id) ?? 0;
      cursor.set(generation, Math.max(cursor.get(generation) ?? 0, moved + SLOT / 2));
    }
  }

  /** 一緒に動かす人たち。下の世代へ連鎖し、連れ合いも巻き込む。 */
  function collectDescendantsAndSpouses(startIds: string[]): Set<string> {
    const queue = [...startIds];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const id = queue.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);

      for (const own of groupsWhereParent.get(id) ?? []) {
        // 子だけでなく連れ合いも一緒に動かす。片方だけ動かすと夫婦が離れ、
        // 隣のカードに重なってしまう。
        queue.push(...own.childIds, ...own.parentIds);
      }
    }

    return seen;
  }

  /**
   * 動かしてよい最大の幅。
   *
   * 動かす人それぞれについて、同じ世代で右にいる「動かさない人」までの余裕を測り、
   * その最小値を取る。右に誰もいなければ制限はない。
   */
  function maxSafeShift(shifted: Set<string>): number {
    const stayingByGeneration = new Map<number, number[]>();
    for (const [id, x] of centerX) {
      if (shifted.has(id)) continue;
      const generation = generations.get(id) ?? 0;
      const list = stayingByGeneration.get(generation) ?? [];
      list.push(x);
      stayingByGeneration.set(generation, list);
    }

    let limit = Number.POSITIVE_INFINITY;
    for (const id of shifted) {
      const x = centerX.get(id);
      if (x === undefined) continue;

      const generation = generations.get(id) ?? 0;
      const rightNeighbours = (stayingByGeneration.get(generation) ?? []).filter(
        (other) => other > x,
      );
      if (rightNeighbours.length === 0) continue;

      limit = Math.min(limit, Math.min(...rightNeighbours) - x - SLOT);
    }

    return limit;
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

  const minX = Math.min(...[...centerX.values()]) - metrics.nodeWidth / 2;
  const manual = (person: Person) => (options.ignoreManualPositions ? null : person.position);

  const nodes: LayoutNode[] = persons.map((person) => {
    const generation = generations.get(person.id) ?? 0;
    const placed = manual(person);

    /*
     * 手で置けるのは横だけ。縦は必ず世代の行に置く。
     *
     * 縦まで自由にすると、カードの大きさを変えたり表示項目を増やしたりして
     * 行の高さが変わったときに、保存済みの座標が古い行の高さのまま取り残され、
     * 世代がそろわなくなる。世代をまたいで置けてしまうと関係線も破綻する。
     * 「どの世代か」はデータ（親子関係）が決めることで、置き場所の話ではない。
     */
    return {
      person,
      x: placed?.x ?? (centerX.get(person.id) ?? 0) - minX,
      y: generation * ROW,
      generation,
      placedByHand: placed !== null,
    };
  });

  attachChildrenToParents(nodes, families);

  const width = Math.max(...nodes.map((n) => n.x)) + metrics.nodeWidth / 2;
  const height = Math.max(...nodes.map((n) => n.y)) + metrics.nodeHeight;

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

/**
 * 手で置いた親の下へ、自動配置の子を寄せ直す。並び（左右の順と間隔）は保つ。
 *
 * 自動配置の座標は「全員を自動で並べたら」の位置なので、親を手で動かすと
 * 子だけが元の場所に取り残される。
 *
 * 上の世代から順に処理するので、寄せた位置は孫より下にも伝わる。
 * 親を動かすと、その下の家系がまとまってついてくる。
 * 手で置いた子は動かさない。置いた本人の意図を上書きしないため。
 *
 * 自動配置どうしの親子は、ここではなく placeGroup の側でそろえる。
 * こちらで一律に寄せると、再婚のように同じ親から複数のきょうだいが下がる場合に
 * 別の家族の子と重なってしまう（重ならない保証は reserve が持っている）。
 */
function attachChildrenToParents(nodes: LayoutNode[], families: FamilyUnit[]): void {
  const byId = new Map(nodes.map((node) => [node.person.id, node]));
  const present = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((node): node is LayoutNode => Boolean(node));

  const generationOf = (family: FamilyUnit) => {
    const levels = present(family.parentIds).map((parent) => parent.generation);
    return levels.length > 0 ? Math.min(...levels) : 0;
  };

  // 寄せ直した子は、孫を寄せるときの基準になる（手で置いた人と同じ扱い）
  const moved = new Set<string>();

  for (const family of [...families].sort((a, b) => generationOf(a) - generationOf(b))) {
    const parents = present(family.parentIds);
    if (!parents.some((parent) => parent.placedByHand || moved.has(parent.person.id))) continue;

    const children = present(family.childIds).filter((child) => !child.placedByHand);
    if (children.length === 0) continue;

    const parentXs = parents.map((parent) => parent.x);
    const childXs = children.map((child) => child.x);
    const dx =
      (Math.min(...parentXs) + Math.max(...parentXs)) / 2 -
      (Math.min(...childXs) + Math.max(...childXs)) / 2;

    for (const child of children) {
      child.x += dx;
      moved.add(child.person.id);
    }
  }
}

/** 夫婦を並べる順。男性を左、女性を右に置き、それ以外は間に挟む。 */
const SPOUSE_RANK: Record<Person['gender'], number> = {
  male: 0,
  other: 1,
  unknown: 1,
  female: 2,
};

function compareSpouses(a: Person | undefined, b: Person | undefined): number {
  if (!a || !b) return 0;
  const rank = SPOUSE_RANK[a.gender] - SPOUSE_RANK[b.gender];
  return rank !== 0 ? rank : compareForDisplay(a, b);
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
    const unit = units.get(key) ?? { key, parentIds: sorted, childIds: [], childKinds: {} };
    unit.childIds.push(person.id);
    unit.childKinds[person.id] = kindOf(parentChild, sorted, person.id);
    units.set(key, unit);
  }

  // 子のいない夫婦
  for (const union of unions) {
    const key = [union.partner1Id, union.partner2Id].sort().join('|');
    if (!units.has(key)) {
      units.set(key, { key, parentIds: key.split('|'), childIds: [], childKinds: {} });
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

/**
 * その家族単位から見た、子との関係の種別。
 * 実子でない関係が1つでもあれば、そちらを採る（縁組を線で示すため）。
 */
function kindOf(parentChild: ParentChild[], parentIds: string[], childId: string): ParentKind {
  const kinds = parentChild
    .filter((pc) => pc.childId === childId && parentIds.includes(pc.parentId))
    .map((pc) => pc.kind);

  return kinds.find((kind) => kind !== 'biological') ?? 'biological';
}

/** 生年順（不明は後ろ）。並びの基準は relations.ts と共有する。 */
function sortPersons(persons: Person[]): Person[] {
  return [...persons].sort(compareForDisplay);
}
