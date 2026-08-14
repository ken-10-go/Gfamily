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
  showAge: false,
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
 * 情報を足す設定（年齢・メモ・ふりがな・2行表示）の分だけ高さを増やす。
 */
export function cardMetrics(settings: ViewSettings): CardMetrics {
  const scale = SIZE_SCALE[settings.uiSize];

  const extraLines =
    (settings.showKana ? 1 : 0) + (settings.showNote ? 1 : 0) + (settings.nameLines === 2 ? 1 : 0);

  if (settings.vertical) {
    return {
      nodeWidth: Math.round(72 * scale),
      nodeHeight: Math.round((150 + extraLines * 14) * scale),
      hGap: Math.round(28 * scale),
      vGap: Math.round(96 * scale),
    };
  }

  return {
    nodeWidth: Math.round(168 * scale),
    nodeHeight: Math.round((50 + (extraLines + 1) * 16) * scale),
    hGap: Math.round(28 * scale),
    vGap: Math.round(96 * scale),
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
