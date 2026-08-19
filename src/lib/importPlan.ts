import type { ImportData } from '@/lib/suisui';
import { displayName, type PersonInput, type TreeGraph } from '@/types/models';

/**
 * 取り込みの下書き。何が増えて、何が既にいるのかを、書き込む前に決める。
 *
 * ほかの道具から書き出した家系図には、**すでに登録した人が混ざっている**のがふつう。
 * そのまま流し込むと同じ人が二重になり、線も二重になって図が読めなくなる。
 * そこで「突き合わせ → 見せる → 選んでもらう」を挟む。
 *
 * 突き合わせは氏名でしか行わない。生年で照合すると、片方だけ日付が入っている
 * 同一人物を別人と見なしてしまう（古い記録では日付の欠けがふつう）。
 * 同姓同名は人が見て判断できるよう、画面に並べて選ばせる。
 *
 * 純粋関数。書き込みは呼び出し側が行う。
 */

export interface PlannedPerson {
  sourceId: string;
  input: PersonInput;
  /** すでにいる人の ID。新しく作るなら null */
  existingId: string | null;
}

export interface PlannedUnion {
  partner1SourceId: string;
  partner2SourceId: string;
  /** すでに同じ夫婦が登録されているか */
  exists: boolean;
}

export interface PlannedLink {
  parentSourceId: string;
  childSourceId: string;
  exists: boolean;
}

export interface ImportPlan {
  persons: PlannedPerson[];
  unions: PlannedUnion[];
  links: PlannedLink[];
}

/** 突き合わせの鍵。空白の入れ方だけが違う書き方を、同じものとして扱う */
const nameKey = (input: { familyName: string | null; givenName: string | null }) =>
  `${input.familyName ?? ''}${input.givenName ?? ''}`.replace(/[\s\u3000]/g, '');

export function buildImportPlan(graph: TreeGraph, data: ImportData): ImportPlan {
  const living = graph.persons.filter((person) => !person.deletedAt);

  const byName = new Map<string, string>();
  for (const person of living) {
    const key = nameKey(person);
    // 同姓同名が複数いるときは、先に登録されているほうに寄せる
    if (key && !byName.has(key)) byName.set(key, person.id);
  }

  const persons: PlannedPerson[] = data.persons.map((person) => ({
    sourceId: person.sourceId,
    input: person.input,
    // 名前の無い人は突き合わせようがないので、必ず新しく作る
    existingId: (nameKey(person.input) && byName.get(nameKey(person.input))) || null,
  }));

  const idOf = new Map(persons.map((person) => [person.sourceId, person.existingId]));

  /** すでにある夫婦。向きは問わない */
  const unionKeys = new Set(
    graph.unions
      .filter((union) => !union.deletedAt)
      .map((union) => [union.partner1Id, union.partner2Id].sort().join('&')),
  );
  /** すでにある親子 */
  const linkKeys = new Set(
    graph.parentChild.filter((pc) => !pc.deletedAt).map((pc) => `${pc.parentId}>${pc.childId}`),
  );

  const unions: PlannedUnion[] = [];
  const links: PlannedLink[] = [];

  for (const union of data.unions) {
    const a = idOf.get(union.partner1SourceId) ?? null;
    const b = idOf.get(union.partner2SourceId) ?? null;

    unions.push({
      partner1SourceId: union.partner1SourceId,
      partner2SourceId: union.partner2SourceId,
      // どちらかが新しい人なら、その線もまだ無い
      exists: Boolean(a && b && unionKeys.has([a, b].sort().join('&'))),
    });

    for (const childSourceId of union.childSourceIds) {
      const child = idOf.get(childSourceId) ?? null;

      for (const parentSourceId of [union.partner1SourceId, union.partner2SourceId]) {
        const parent = idOf.get(parentSourceId) ?? null;
        links.push({
          parentSourceId,
          childSourceId,
          exists: Boolean(parent && child && linkKeys.has(`${parent}>${child}`)),
        });
      }
    }
  }

  return { persons, unions, links };
}

/** 画面に出す要約。何人増えて、何本の線が増えるか。 */
export function summarize(plan: ImportPlan, skipped: ReadonlySet<string> = new Set()) {
  const added = plan.persons.filter(
    (person) => !person.existingId && !skipped.has(person.sourceId),
  );
  const matched = plan.persons.filter((person) => person.existingId);

  /** その人を取り込まないなら、その人につながる線も引けない */
  const usable = (sourceId: string) => {
    const person = plan.persons.find((entry) => entry.sourceId === sourceId);
    return Boolean(person && (person.existingId || !skipped.has(sourceId)));
  };

  return {
    added,
    matched,
    unions: plan.unions.filter(
      (union) => !union.exists && usable(union.partner1SourceId) && usable(union.partner2SourceId),
    ),
    links: plan.links.filter(
      (link) => !link.exists && usable(link.parentSourceId) && usable(link.childSourceId),
    ),
  };
}

/** 突き合わせで見つかった相手の名前。画面に「すでにいる」と示すために使う。 */
export function matchedName(graph: TreeGraph, existingId: string): string {
  const person = graph.persons.find((entry) => entry.id === existingId);
  return person ? displayName(person) : '(不明)';
}
