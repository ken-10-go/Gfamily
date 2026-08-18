import type { ReactNode } from 'react';

/**
 * たたんでおける説明。
 *
 * 説明は要るが、いつも全文が出ていると場所を食って、肝心の操作が下へ押しやられる。
 * ふだんは1行の見出しだけにして、知りたい人が開けば読める形にする。
 */
export function Hint({ label = 'これは？', children }: { label?: string; children: ReactNode }) {
  return (
    <details className="hint">
      <summary className="hint__summary">{label}</summary>
      <div className="hint__body">{children}</div>
    </details>
  );
}
