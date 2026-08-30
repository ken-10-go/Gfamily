import type { AuditLog } from '@/types/models';

/**
 * 記録の1件を、そのまま読める1文にする。
 *
 * 画面から切り離した純粋関数にしてあるので、言い回しだけを試せる。
 * 「誰が・何を・どうした」の順。名前が引けないものは、その旨をはっきり書く
 * （空欄のままだと、記録が壊れているのか消された人なのか分からないため）。
 */
const ENTITY_LABELS: Record<string, string> = {
  persons: '人物',
  parentChild: '親子のつながり',
  unions: '夫婦のつながり',
  houses: '家',
  members: 'メンバー',
  feedback: 'ご意見・不具合',
};

const ACTION_LABELS: Record<AuditLog['action'], string> = {
  insert: '追加しました',
  update: '編集しました',
  delete: '削除しました',
  restore: '元に戻しました',
};

export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity;
}

export function actionLabel(action: AuditLog['action']): string {
  return ACTION_LABELS[action] ?? '変えました';
}

/**
 * 記録を1文にする。
 *
 * @param actorName 実行した人の呼び名。分からなければ null
 * @param targetName 対象の人物名。人物以外や、消えてしまって引けないときは null
 */
export function auditSentence(
  log: AuditLog,
  actorName: string | null,
  targetName: string | null,
): string {
  const who = actorName ?? '（分からない人）';
  const what =
    log.entity === 'persons'
      ? `${targetName ?? '消された人物'} を`
      : `${entityLabel(log.entity)} を`;
  return `${who} さんが ${what}${actionLabel(log.action)}`;
}

/** 何時何分。日付は見出しでまとめるので、行には時刻だけを出す。 */
export function timeLabel(createdAt: string | null): string {
  if (!createdAt) return '';
  return new Date(createdAt).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 日付の見出し。同じ日の記録をまとめるための鍵にも使う。 */
export function dayLabel(createdAt: string | null): string {
  if (!createdAt) return '日付の分からない記録';
  return new Date(createdAt).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}
