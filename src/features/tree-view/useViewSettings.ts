import { useCallback, useEffect, useState } from 'react';

/**
 * 家系図の見た目の設定。
 *
 * 表示上の好みであってデータではないので Firestore には保存せず、
 * 端末の localStorage にツリーごとに持つ。書き込み権限もルールの変更も要らない。
 */
/**
 * カードの氏名行より下に出す項目。設定した順に上から並ぶ。
 * 氏名は必ず出すので、この一覧には含めない。
 */
export type CardField =
  'kana' | 'meta' | 'birthOrder' | 'lifespan' | 'birthDate' | 'deathDate' | 'birthPlace' | 'note';

export const CARD_FIELD_LABELS: Record<CardField, string> = {
  kana: 'ふりがな',
  meta: '続柄・生没年',
  birthOrder: '続柄',
  lifespan: '生没年',
  birthDate: '生年月日（和暦併記）',
  deathDate: '没年月日（和暦併記）',
  birthPlace: '出生地',
  note: 'メモの1行目',
};

/** 画面の設定に出す順番。カード上もこの順で並ぶ。 */
export const CARD_FIELD_ORDER: CardField[] = [
  'kana',
  'meta',
  'birthOrder',
  'lifespan',
  'birthDate',
  'deathDate',
  'birthPlace',
  'note',
];

/**
 * カードに出せる行数の上限。
 * これ以上増やすとカードが縦に伸びて、画面に入る世代が減ってしまう。
 */
export const MAX_CARD_FIELDS = 6;

/**
 * 配色のテーマ。auto は今までどおり OS の設定（ダークモード）に従う。
 * 既定は和風モダン。
 */
export type ThemeName = 'washi' | 'monotone' | 'pastel' | 'auto';

export const THEME_LABELS: Record<ThemeName, string> = {
  washi: '和風モダン',
  monotone: 'モノトーン',
  pastel: 'パステル',
  auto: '端末の設定に従う',
};

export interface ViewSettings {
  /** 配色のテーマ */
  theme: ThemeName;
  /** 年齢（存命なら満年齢、没後は享年）を氏名の横に出す */
  showAge: boolean;
  /** 氏名の下に出す項目。上から順に並ぶ */
  cardFields: CardField[];
  /** 姓と名の並び。given-first は「太郎 山田」 */
  nameOrder: 'family-first' | 'given-first';
  /** 氏名を姓と名で改行する */
  nameLines: 1 | 2;
  /** カードの大きさ */
  uiSize: 'small' | 'medium' | 'large';
  /** 縦書きにする */
  vertical: boolean;
  /** 選んだ人物とその直系尊属を強調する */
  highlightLineage: boolean;
  /** 配偶者が未登録の人に「＋ 配偶者」の空カードを出す */
  showSpousePlaceholder: boolean;
  /** 編集操作を止める。閲覧中の誤操作を防ぐ */
  locked: boolean;
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  theme: 'washi',
  showAge: true,
  // ふりがな・氏名・生没年（年齢つき）の3行。続柄は必要な人だけが足せばよい
  cardFields: ['kana', 'lifespan'],
  nameOrder: 'family-first',
  nameLines: 1,
  uiSize: 'medium',
  vertical: false,
  highlightLineage: true,
  showSpousePlaceholder: false,
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

  // 氏名の行に、下に出す項目の数を足す
  const lines = (settings.nameLines === 2 ? 2 : 1) + settings.cardFields.length;

  if (settings.vertical) {
    return {
      nodeWidth: Math.round((20 + lines * 16) * scale),
      nodeHeight: Math.round(150 * scale),
      hGap: Math.round(24 * scale),
      vGap: Math.round(84 * scale),
    };
  }

  return {
    nodeWidth: Math.round(176 * scale),
    // 上下の余白 6 と、行の高さ 18
    nodeHeight: Math.round((6 + lines * 18) * scale),
    hGap: Math.round(24 * scale),
    vGap: Math.round(84 * scale),
  };
}

const storageKey = (treeId: string) => `familytree:view:${treeId}`;

/** 以前の設定の形。cardFields に置き換わった項目を読み替えるために持つ。 */
interface LegacySettings {
  showKana?: boolean;
  showNote?: boolean;
}

/** 前の版の既定。これと同じ設定は「既定のまま」とみなして今の既定へ寄せる。 */
const PREVIOUS_DEFAULT_CARD_FIELDS: CardField[] = ['kana', 'meta'];

const isExactly = (a: readonly CardField[], b: readonly CardField[]) =>
  a.length === b.length && a.every((field, index) => field === b[index]);

/**
 * 保存済みの設定を今の形に直す。
 *
 * ふりがな・メモの表示は個別の真偽値だったものを cardFields に統合した。
 * 端末に残っている設定をそのまま捨てると見た目が変わってしまうので、読み替える。
 */
export function migrateSettings(stored: Partial<ViewSettings> & LegacySettings): ViewSettings {
  const merged = { ...DEFAULT_VIEW_SETTINGS, ...stored };

  if (!Array.isArray(stored.cardFields)) {
    const fields: CardField[] = [];
    if (stored.showKana ?? DEFAULT_VIEW_SETTINGS.cardFields.includes('kana')) fields.push('kana');
    fields.push('lifespan');
    if (stored.showNote) fields.push('note');
    merged.cardFields = fields;
  } else if (isExactly(stored.cardFields, PREVIOUS_DEFAULT_CARD_FIELDS)) {
    // 前の既定のまま保存されているなら、選び直したのではなく既定を使っているということ。
    // 既定を変えたときに置いていかれないよう、新しい既定へ寄せる。
    merged.cardFields = [...DEFAULT_VIEW_SETTINGS.cardFields];
  }

  // 知らない項目や上限超えは捨てる（別の版で保存された設定が混ざっても壊れないように）
  merged.cardFields = merged.cardFields
    .filter((field) => CARD_FIELD_ORDER.includes(field))
    .slice(0, MAX_CARD_FIELDS);

  return merged;
}

function read(treeId: string): ViewSettings {
  try {
    const stored = window.localStorage.getItem(storageKey(treeId));
    if (!stored) return DEFAULT_VIEW_SETTINGS;
    return migrateSettings(JSON.parse(stored) as Partial<ViewSettings> & LegacySettings);
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

  // テーマは CSS 変数の束なので、根の要素に印を付けて切り替える。
  // 家系図の画面を離れたら元に戻し、一覧などには持ち込まない。
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'auto') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = settings.theme;
    }

    return () => {
      delete root.dataset.theme;
    };
  }, [settings.theme]);

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
