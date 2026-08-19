import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Hint } from '@/features/app/Hint';
import { Avatar } from '@/features/home/Avatar';
import * as api from '@/lib/api';
import { buildImportPlan, matchedName, summarize, type ImportPlan } from '@/lib/importPlan';
import { parseSuisui, readFtz, type ImportData } from '@/lib/suisui';
import { EMPTY_PERSON, displayName, lifespanLabel, type TreeGraph } from '@/types/models';

/**
 * ほかの道具で作った家系図を取り込む（いまは「すいすい家系図」の .ftz / .ftt）。
 *
 * そのまま流し込むと、すでに登録した人が二重になる。
 * **読み込む → 突き合わせて見せる → 選んで確定** の三段にして、
 * 何が増えるのかを見てから書き込めるようにする。
 */
export function ImportPage() {
  const { treeId = '' } = useParams();
  const navigate = useNavigate();
  const [graph, setGraph] = useState<TreeGraph>({ persons: [], parentChild: [], unions: [] });
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ImportData | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  /** 取り込まないと決めた人。既定は全部取り込む */
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [loaded, role] = await Promise.all([api.loadTreeGraph(treeId), api.getMyRole(treeId)]);
      setGraph(loaded);
      setCanEdit(role === 'owner' || role === 'editor');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleFile(file: File) {
    setError(null);
    setDone(null);
    try {
      const text = file.name.endsWith('.ftz')
        ? await readFtz(await file.arrayBuffer())
        : await file.text();

      const parsed = parseSuisui(text);
      if (parsed.persons.length === 0) throw new Error('人物が見つかりませんでした');

      setData(parsed);
      setPlan(buildImportPlan(graph, parsed));
      setSkipped(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ファイルを読めませんでした');
    }
  }

  /** 選んだぶんだけ書き込む。人物 → 夫婦 → 親子 の順に作る。 */
  async function handleImport() {
    if (!plan) return;

    setBusy(true);
    setError(null);
    try {
      const { added, unions, links } = summarize(plan, skipped);

      /** 書き出しの ID → このツリーでの人物 ID */
      const idOf = new Map<string, string>();
      for (const person of plan.persons) {
        if (person.existingId) idOf.set(person.sourceId, person.existingId);
      }
      for (const person of added) {
        const created = await api.createPerson(treeId, person.input);
        idOf.set(person.sourceId, created.id);
      }

      for (const union of unions) {
        const a = idOf.get(union.partner1SourceId);
        const b = idOf.get(union.partner2SourceId);
        if (a && b) await api.addUnion(treeId, a, b);
      }

      for (const link of links) {
        const parent = idOf.get(link.parentSourceId);
        const child = idOf.get(link.childSourceId);
        if (parent && child) await api.addParentChild(treeId, parent, child);
      }

      setDone(
        `${added.length}人と、${unions.length}組の夫婦・${links.length}本の親子を取り込みました。`,
      );
      setData(null);
      setPlan(null);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '取り込みに失敗しました');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="page__status">読み込み中…</p>;

  const totals = plan ? summarize(plan, skipped) : null;

  return (
    <main className="page">
      <p>
        <Link to={`/trees/${treeId}/settings`}>← 設定へ戻る</Link>
      </p>
      <h1>家系図を取り込む</h1>

      <Hint>
        「すいすい家系図」で書き出したファイル（.ftz）を読み込みます。
        すでに登録されている人は名前で突き合わせて、二重に増やしません。
        取り込む前に、何が増えるのかを一覧で確かめられます。
      </Hint>

      {error && <p className="alert alert--error">{error}</p>}
      {done && <p className="note">{done}</p>}
      {!canEdit && <p className="note">取り込みは編集者以上が行えます。</p>}

      {canEdit && (
        <label className="field">
          <span className="field__label">ファイルを選ぶ（.ftz / .ftt）</span>
          <input
            type="file"
            accept=".ftz,.ftt"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
      )}

      {data && data.unknownEras.length > 0 && (
        <p className="alert alert--error">
          読み取れない元号がありました（コード {data.unknownEras.join('・')}）。
          その人の生没年は空のまま取り込まれます。
        </p>
      )}

      {plan && totals && (
        <>
          <h2>取り込む人（{totals.added.length}人）</h2>
          <p className="note">
            チェックを外した人は取り込みません。その人につながる線も引きません。
          </p>

          <ul className="person-list">
            {plan.persons
              .filter((person) => !person.existingId)
              .map((person) => (
                <li key={person.sourceId} className="person-row">
                  <Avatar
                    person={{ ...EMPTY_PERSON, ...person.input, id: person.sourceId }}
                    size={34}
                  />
                  <span className="person-row__body">
                    <span className="person-row__name">{displayName(person.input)}</span>
                    <span className="person-row__meta">
                      {lifespanLabel({ ...person.input })}
                      {person.input.note ? ` · ${person.input.note}` : ''}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    aria-label={`${displayName(person.input)} を取り込む`}
                    checked={!skipped.has(person.sourceId)}
                    onChange={(event) =>
                      setSkipped((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.delete(person.sourceId);
                        else next.add(person.sourceId);
                        return next;
                      })
                    }
                  />
                </li>
              ))}
          </ul>

          <h2>すでにいる人（{totals.matched.length}人）</h2>
          <p className="note">
            名前が一致したので、増やさずにそのまま使います。足りない線だけを足します。
          </p>
          <ul className="person-list">
            {plan.persons
              .filter((person) => person.existingId)
              .map((person) => (
                <li key={person.sourceId} className="person-row">
                  <span className="person-row__body">
                    <span className="person-row__name">{displayName(person.input)}</span>
                    <span className="person-row__meta">
                      → {matchedName(graph, person.existingId as string)}
                    </span>
                  </span>
                </li>
              ))}
          </ul>

          <h2>増える線</h2>
          <p className="note">
            夫婦 {totals.unions.length} 組・親子 {totals.links.length} 本。
            すでにある線は数えていません。
          </p>

          <div className="form__actions">
            <button
              type="button"
              className="button button--primary"
              disabled={busy || !canEdit}
              onClick={() => void handleImport()}
            >
              {busy ? '取り込み中…' : 'この内容で取り込む'}
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => {
                setPlan(null);
                setData(null);
              }}
            >
              やめる
            </button>
          </div>
        </>
      )}

      {done && (
        <p>
          <button type="button" className="button" onClick={() => navigate(`/trees/${treeId}`)}>
            家系図を見る
          </button>
        </p>
      )}
    </main>
  );
}
