import { useState } from 'react';

import { PersonForm } from '@/features/persons/PersonForm';
import { spousesOf } from '@/lib/relations';
import {
  displayName,
  oppositeGender,
  type Person,
  type PersonInput,
  type TreeGraph,
} from '@/types/models';

export type RelativeKind = 'parent' | 'spouse' | 'child';

interface AddRelativeFormProps {
  graph: TreeGraph;
  /** 関係の起点になる人物。 */
  person: Person;
  relation: RelativeKind;
  /**
   * 追加の実行。otherParentId は子を追加するときの「もう一方の親」で、
   * 指定しない場合は null。
   */
  onSubmit: (input: PersonInput, otherParentId: string | null) => Promise<void>;
  onCancel: () => void;
}

/**
 * 親族を新規登録するフォーム。
 *
 * 関係から分かることは初期値にして、入力の手数を減らす。
 *   - 姓は起点の人物から引き継ぐ
 *   - 配偶者の性別はもう一方と逆を初期選択にする
 *   - 子の「もう一方の親」は、配偶者が1人ならそのまま、複数いるなら選んでもらう
 */
export function AddRelativeForm({
  graph,
  person,
  relation,
  onSubmit,
  onCancel,
}: AddRelativeFormProps) {
  const spouses = relation === 'child' ? spousesOf(graph, person.id) : [];
  // 配偶者が1人だけなら、その人を初期選択にする（これまでの自動登録と同じ結果になる）
  const [otherParentId, setOtherParentId] = useState(spouses.length === 1 ? spouses[0].id : '');

  const extraFields =
    relation === 'child' && spouses.length > 0 ? (
      <label className="field">
        <span className="field__label">もう一方の親</span>
        <select value={otherParentId} onChange={(event) => setOtherParentId(event.target.value)}>
          <option value="">登録しない</option>
          {spouses.map((spouse) => (
            <option key={spouse.id} value={spouse.id}>
              {displayName(spouse)}
            </option>
          ))}
        </select>
        <span className="note">
          {spouses.length > 1
            ? `${displayName(person)} には配偶者が${spouses.length}人います。どちらとの子かを選んでください。`
            : '配偶者との子でなければ「登録しない」を選んでください。'}
        </span>
      </label>
    ) : null;

  return (
    <PersonForm
      submitLabel="追加"
      // 同じ家の人を続けて登録することが多いので、姓とその読みを引き継いでおく
      defaultFamilyName={person.familyName}
      defaultFamilyNameKana={person.familyNameKana}
      defaultGender={relation === 'spouse' ? oppositeGender(person.gender) : undefined}
      extraFields={extraFields}
      onSubmit={(input) => onSubmit(input, otherParentId || null)}
      onCancel={onCancel}
    />
  );
}
