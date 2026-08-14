import { useCallback, useEffect, useState } from 'react';

/**
 * 家系図の見た目の設定。
 *
 * 表示上の好みであってデータではないので Firestore には保存せず、
 * 端末の localStorage にツリーごとに持つ。書き込み権限もルールの変更も要らない。
 */
export interface ViewSettings {
  /** 年齢（存命なら満年齢、没後は享年）をカードに出す */
  showAge: boolean;
  /** メモの1行目をカードに出す */
  showNote: boolean;
  /** ふりがなをカードに出す */
  showKana: boolean;
  /** 姓と名の並び。given-first は「太郎 山田」 */
  nameOrder: 'family-first' | 'given-first';
  /** 氏名を姓と名で改行する */
  nameLines: 1 | 2;
  /** カードの大きさ */
  uiSize: 'small' | 'medium' | 'large';
  /** 縦書きにする */
  vertical: boolean;
  /** 編集操作を止める。閲覧中の誤操作を防ぐ */
  locked: boolean;
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  showAge: true,
  showNote: false,
  showKana: true,
  nameOrder: 'family-first',
  nameLines: 1,
  uiSize: 'medium',
  vertical: false,
  locked: false,
};

/** カードの寸法。縦書きと UI サイズで縦横比が変わる。 */
export interface CardMetrics {
  nodeWidth: number;
  nodeHeight: number;
  hGap: number;
  vGap: number;
}

const SIZE_SCALE: Record<ViewSettings['uiSize'], number> = {
  small: 0.8,
  medium: 1,
  large: 1.25,
};

/**
 * 設定からカードの寸法を決める。
 * 縦書きでは行が縦に伸びるため、幅を狭くして高さを大きく取る。
 * 情報を足す設定（メモ・ふりがな・2行表示）の分だけ高さを増やす。
 *
 * 高さは行数から詰めて決める。余白を切り詰めたぶん、文字を大きくしても
 * カードが膨らまず、同じ画面により多くの世代が入る。
 */
export function cardMetrics(settings: ViewSettings): CardMetrics {
  const scale = SIZE_SCALE[settings.uiSize];

  // 氏名の行 + 続柄や生没年の行が基本。ふりがなとメモは設定で増える。
  const lines =
    (settings.nameLines === 2 ? 2 : 1) + 1 + (settings.showKana ? 1 : 0) + (settings.showNote ? 1 : 0);

  if (settings.vertical) {
    return {
      nodeWidth: Math.round((26 + lines * 17) * scale),
      nodeHeight: Math.round(150 * scale),
      hGap: Math.round(24 * scale),
      vGap: Math.round(84 * scale),
    };
  }

  return {
    nodeWidth: Math.round(176 * scale),
    // 上下の余白 12 と、行の高さ 19
    nodeHeight: Math.round((12 + lines * 19) * scale),
    hGap: Math.round(24 * scale),
    vGap: Math.round(84 * scale),
  };
}

const storageKey = (treeId: string) => `familytree:view:${treeId}`;

function read(treeId: string): ViewSettings {
  try {
    const stored = window.localStorage.getItem(storageKey(treeId));
    if (!stored) return DEFAULT_VIEW_SETTINGS;
    // 設定項目が増えても壊れないよう、既定値に上書きする形で読む
    return { ...DEFAULT_VIEW_SETTINGS, ...(JSON.parse(stored) as Partial<ViewSettings>) };
  } catch {
    return DEFAULT_VIEW_SETTINGS;
  }
}

export function useViewSettings(treeId: string) {
  const [settings, setSettings] = useState<ViewSettings>(() => read(treeId));

  // 別のツリーを開いたら、そのツリーの設定に切り替える
  useEffect(() => {
    setSettings(read(treeId));
  }, [treeId]);

  const update = useCallback(
    <K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) => {
      setSettings((current) => {
        const next = { ...current, [key]: value };
        try {
          window.localStorage.setItem(storageKey(treeId), JSON.stringify(next));
        } catch {
          // 保存できなくても表示は続けられるので、失敗は無視する
        }
        return next;
      });
    },
    [treeId],
  );

  return { settings, update };
}
