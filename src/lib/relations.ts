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

/**
 * 生まれた順。分からないものは後ろに置き、同着なら登録順で安定させる。
 *
 * 続柄（長男・次男）はこの順で決める。画面上でどう並べ替えても、
 * 生まれた順が変わるわけではないので、手動の並び順は見ない。
 */
export function compareByBirth(a: Person, b: Person): number {
  if (a.birthDate && b.birthDate && a.birthDate !== b.birthDate) {
    return a.birthDate.localeCompare(b.birthDate);
  }
  if (a.birthDate && !b.birthDate) return -1;
  if (!a.birthDate && b.birthDate) return 1;

  return a.id.localeCompare(b.id);
}

/**
 * 家系図に並べるときの左右の順。
 *
 * 手動で並べ替えた順（siblingOrder）があればそれを優先し、無ければ生年順にする。
 * 手動指定のある人物は、指定の無い人物より前に置く。
 */
export function compareForDisplay(a: Person, b: Person): number {
  const left = a.siblingOrder;
  const right = b.siblingOrder;

  if (left !== null && right !== null && left !== right) return left - right;
  if (left !== null && right === null) return -1;
  if (left === null && right !== null) return 1;

  return compareByBirth(a, b);
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

// --- 既存の人物どうしをつなぐときの検査 -------------------------------------

/** その人物の先祖をすべて集める。循環したデータでも止まるよう、訪問済みを持つ。 */
export function ancestorsOf(graph: TreeGraph, personId: string): Set<string> {
  const parentChild = graph.parentChild.filter((pc) => !pc.deletedAt);
  const found = new Set<string>();
  const queue = [personId];

  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const pc of parentChild) {
      if (pc.childId !== current || found.has(pc.parentId)) continue;
      found.add(pc.parentId);
      queue.push(pc.parentId);
    }
  }

  return found;
}

/**
 * 親子関係をつないだときに循環ができてしまうか。
 *
 * 自分の先祖を自分の子にすると、世代が決まらず家系図として破綻する。
 * computeLayout は循環に耐えるようにしてあるが、そもそも作らせない。
 */
export function wouldCreateCycle(graph: TreeGraph, parentId: string, childId: string): boolean {
  if (parentId === childId) return true;
  return ancestorsOf(graph, parentId).has(childId);
}

export type ConnectionKind = 'parent' | 'child' | 'spouse';

/**
 * 既存の人物を親・子・配偶者としてつなげるか判定する。
 * つなげない場合は理由を返し、画面でそのまま伝える。
 */
export function connectionProblem(
  graph: TreeGraph,
  personId: string,
  otherId: string,
  kind: ConnectionKind,
): string | null {
  if (personId === otherId) return '自分自身とはつなげません';

  const parentChild = graph.parentChild.filter((pc) => !pc.deletedAt);
  const unions = graph.unions.filter((u) => !u.deletedAt);

  if (kind === 'spouse') {
    const already = unions.some(
      (u) =>
        (u.partner1Id === personId && u.partner2Id === otherId) ||
        (u.partner1Id === otherId && u.partner2Id === personId),
    );
    return already ? 'すでに配偶者として登録されています' : null;
  }

  const parentId = kind === 'parent' ? otherId : personId;
  const childId = kind === 'parent' ? personId : otherId;

  if (parentChild.some((pc) => pc.parentId === parentId && pc.childId === childId)) {
    return 'すでに親子として登録されています';
  }
  if (wouldCreateCycle(graph, parentId, childId)) {
    return '先祖と子孫が入れ替わってしまうため、つなげません';
  }

  return null;
}
