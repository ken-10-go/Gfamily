import { Link, useParams } from 'react-router-dom';

import { GUIDE_SECTIONS } from '@/features/guide/guideContent';

/**
 * 使い方ガイド。
 *
 * 見ただけでは分からないところ（段・配置・家）だけを書く。
 * 本文は guideContent.tsx にあり、この画面は目次と表示だけを持つ。
 */
export function GuidePage() {
  const { treeId = '' } = useParams();

  return (
    <main className="page">
      <p>
        <Link to={`/trees/${treeId}/settings`}>← 設定へ戻る</Link>
      </p>
      <h1>使い方ガイド</h1>
      <p className="note">
        押しただけでは分かりにくいところをまとめました。気になる見出しから読んでください。
      </p>

      <ul className="guide__toc">
        {GUIDE_SECTIONS.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.title}</a>
          </li>
        ))}
      </ul>

      {GUIDE_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="guide__section">
          <h2>{section.title}</h2>
          {section.body}
        </section>
      ))}

      <p className="note">
        ここに無いことや、書いてあるとおりにならないことがあれば、
        <Link to={`/trees/${treeId}/feedback`}>ご意見・不具合</Link> から知らせてください。
      </p>
    </main>
  );
}
