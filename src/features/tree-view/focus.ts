import type { TreeGraph } from '@/types/models';

/**
 * フォーカスモードの絞り込み条件。
 *
 * 世代数は中心人物から数える。0 を指定するとその向きには広げない。
 */
export interface FocusOptions {
  /** 何世代上まで含めるか */
  ancestors: number;
  /** 何世代下まで含めるか */
  descendants: number;
  /** 含まれた人物の配偶者も表示するか */
  includeSpouses: boolean;
}

export const DEFAULT_FOCUS_OPTIONS: FocusOptions = {
  ancestors: 2,
  descendants: 2,
  includeSpouses: true,
};

/** 選べる世代数。これ以上広げるなら絞り込まないのと変わらない。 */
export const FOCUS_GENERATION_CHOICES = [0, 1, 2, 3, 4, 5];

/**
 * 中心人物のまわりだけを取り出した家系図を返す。
 *
 * 中心を 0 として、親をたどるたびに −1、子をたどるたびに +1 と数え、
 * `[-ancestors, +descendants]` の範囲に収まる人物だけを残す。
 * 直系だけでなく、きょうだい・おじおば・いとこもこの範囲で自然に入る
 * （親まで上がってから子へ下りる経路が範囲内に収まるため）。
 *
 * 配偶者はそこから先をたどらない。姻族の家系まで芋づるで入ってこないようにするため、
 * 「含まれた人物の配偶者」までで打ち切る。
 * なお `includeSpouses` を false にしても、含まれた人物の「もう一方の親」は残る。
 * 親子の線が片親からしか伸びない図になってしまうため。
 *
 * 純粋関数。入力の TreeGraph は書き換えず、要素は同じ参照のまま新しい配列に詰めて返す。
 * 中心人物が見つからないとき（削除済みを含む）は空の家系図を返す。
 */
export function focusGraph(
  graph: TreeGraph,
  centerId: string,
  options: FocusOptions = DEFAULT_FOCUS_OPTIONS,
): TreeGraph {
  const scope = focusScope(graph, centerId, options);
  if (!scope) return { persons: [], parentChild: [], unions: [] };

  const { persons, parentChild, unions, included } = scope;

  return {
    persons: persons.filter((person) => included.has(person.id)),
    parentChild: parentChild.filter((pc) => included.has(pc.parentId) && included.has(pc.childId)),
    unions: unions.filter((u) => included.has(u.partner1Id) && included.has(u.partner2Id)),
  };
}

/**
 * 絞り込みの端にいる人物を返す。
 *
 * 「ここで切れているが、その先にもまだ家系が続いている」と分かるように薄く描く。
 * 端とみなすのは、指定した世代数ちょうどまで離れている人と、
 * 血縁ではなく配偶者として足された人（そこから先はたどっていない）。
 *
 * 中心人物が見つからないときは空集合。純粋関数。
 */
export function focusBoundary(
  graph: TreeGraph,
  centerId: string,
  options: FocusOptions = DEFAULT_FOCUS_OPTIONS,
): Set<string> {
  const scope = focusScope(graph, centerId, options);
  if (!scope) return new Set();

  const up = Math.max(0, options.ancestors);
  const down = Math.max(0, options.descendants);
  const boundary = new Set<string>();

  for (const [id, offset] of scope.offsets) {
    if (id === centerId) continue;
    if (offset === -up || offset === down) boundary.add(id);
  }

  // 配偶者としてだけ入った人は、そこから先をたどっていないので端として扱う
  for (const id of scope.included) {
    if (!scope.offsets.has(id)) boundary.add(id);
  }

  return boundary;
}

/**
 * 絞り込みの探索を1か所にまとめる。
 * `offsets` は血縁でたどった距離（親が -1、子が +1）。配偶者として足した人は持たない。
 */
function focusScope(
  graph: TreeGraph,
  centerId: string,
  options: FocusOptions,
): {
  persons: TreeGraph['persons'];
  parentChild: TreeGraph['parentChild'];
  unions: TreeGraph['unions'];
  included: Set<string>;
  offsets: Map<string, number>;
} | null {
  const persons = graph.persons.filter((p) => !p.deletedAt);
  const personIds = new Set(persons.map((p) => p.id));

  if (!personIds.has(centerId)) return null;

  const parentChild = graph.parentChild.filter(
    (pc) => !pc.deletedAt && personIds.has(pc.parentId) && personIds.has(pc.childId),
  );
  const unions = graph.unions.filter(
    (u) => !u.deletedAt && personIds.has(u.partner1Id) && personIds.has(u.partner2Id),
  );

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const pc of parentChild) {
    parentsOf.set(pc.childId, [...(parentsOf.get(pc.childId) ?? []), pc.parentId]);
    childrenOf.set(pc.parentId, [...(childrenOf.get(pc.parentId) ?? []), pc.childId]);
  }

  const up = Math.max(0, options.ancestors);
  const down = Math.max(0, options.descendants);

  // 幅優先で広げる。訪問済みを持つので、循環したデータでも止まる。
  const offsets = new Map<string, number>([[centerId, 0]]);
  const queue: { id: string; offset: number }[] = [{ id: centerId, offset: 0 }];

  while (queue.length > 0) {
    const { id, offset } = queue.shift() as { id: string; offset: number };

    if (offset - 1 >= -up) {
      for (const parentId of parentsOf.get(id) ?? []) {
        if (offsets.has(parentId)) continue;
        offsets.set(parentId, offset - 1);
        queue.push({ id: parentId, offset: offset - 1 });
      }
    }

    if (offset + 1 <= down) {
      for (const childId of childrenOf.get(id) ?? []) {
        if (offsets.has(childId)) continue;
        offsets.set(childId, offset + 1);
        queue.push({ id: childId, offset: offset + 1 });
      }
    }
  }

  const included = new Set(offsets.keys());

  if (options.includeSpouses) {
    // 血縁でたどった人物の配偶者を足す。足した配偶者からは広げない。
    const blood = new Set(included);
    for (const union of unions) {
      if (blood.has(union.partner1Id)) included.add(union.partner2Id);
      if (blood.has(union.partner2Id)) included.add(union.partner1Id);
    }
  }

  return { persons, parentChild, unions, included, offsets };
}
