import type { EncryptedPayload } from '@/lib/crypto';

export type TreeRole = 'owner' | 'editor' | 'viewer';
export type Gender = 'male' | 'female' | 'other' | 'unknown';
export type UnionStatus = 'married' | 'divorced' | 'widowed' | 'partner';

/**
 * 親子関係の種別。
 * 戸籍上の区別を残せるよう、実子・普通養子・特別養子・婿養子・連れ子を分けている。
 */
export type ParentKind =
  'biological' | 'adoptive' | 'special_adoptive' | 'son_in_law_adoptive' | 'step' | 'foster';

/** 改姓の理由。戸籍をたどるときに「なぜ変わったか」が重要になる。 */
export type SurnameChangeReason =
  'birth' | 'marriage' | 'divorce' | 'adoption' | 'branch' | 'other';

/**
 * 入力された和暦そのもの。
 *
 * 明治5年までは旧暦（太陰太陽暦）で、和暦の月日はグレゴリオ暦の月日と一致しない。
 * 西暦の文字列（birthDate / deathDate）は並び替えと年齢計算のために持ち、
 * 「戸籍に何と書いてあったか」はこちらをそのまま残す。
 */
export interface EraDate {
  eraName: string;
  /** 元号内の年。1 は元年 */
  eraYear: number;
  month: number | null;
  day: number | null;
}

/** カードの表示位置。ドラッグで置いた場所を保持する。 */
export interface CardPosition {
  x: number;
  y: number;
}

export interface SurnameRecord {
  familyName: string;
  /** 変わった時期。年だけ・年月だけの曖昧な指定もできる。 */
  date: string | null;
  reason: SurnameChangeReason;
  note: string | null;
}

export interface Tree {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  /**
   * 機微項目の暗号鍵を導くためのソルト（Base64）。公開されても問題ない値。
   * まだパスフレーズを決めていないツリーでは null。
   */
  e2eeSalt: string | null;
  /** uid -> 権限。セキュリティルールの判定もこのマップを見る。 */
  roles: Record<string, TreeRole>;
  /** roles のキーと同じ内容。「自分が参加しているツリー」を1クエリで引くために持つ。 */
  memberIds: string[];
}

/**
 * 家。ツリーの中の、血のつながりでまとまった一群。
 *
 * 既定では親子の線をたどって自動で判定するので、ここに登録するのは
 * 名前を付け直した家と、人物の所属を手で決めた家だけ。
 */
export interface House {
  id: string;
  name: string;
}

export interface Person {
  id: string;
  familyName: string | null;
  givenName: string | null;
  /** ふりがな。読みが分からない名前が多いため、姓名それぞれに持つ。 */
  familyNameKana: string | null;
  givenNameKana: string | null;
  maidenName: string | null;
  gender: Gender;
  /**
   * `YYYY` / `YYYY-MM` / `YYYY-MM-DD` のいずれか。
   * 古い戸籍では年しか分からないことがあるため、精度の欠けた日付を許す。
   */
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  note: string | null;
  isLiving: boolean;
  /** 続柄の手動指定。null なら親子関係と生年から自動で導く。 */
  birthOrder: string | null;
  /**
   * きょうだい内の並び順の手動指定。null なら生年順に並べる。
   * 戸籍の記載順に合わせたい場合など、自動の年長者順を上書きするために使う。
   */
  siblingOrder: number | null;
  /**
   * 段（世代の行）を手で何段ずらすか。0 か null なら自動のまま。
   *
   * 婚姻や養子縁組で家系がつながると、自動で決めた段が実感と食い違うことがある。
   * 絶対の段ではなく「ずらす量」で持つのは、人物を足したときに自動側が動いても
   * 手の指定が意味を保つようにするため。
   * 親が子より下に来る指定は、レイアウト側で無効にする。
   */
  generationShift: number | null;
  /**
   * 属する家の指定。空なら血のつながりから自動で決める。
   *
   * **1人が複数の家に属することを前提にする。** 嫁いだ人は生家と婚家の両方に
   * 名を連ねるし、養子は実家と養家の両方に属する。
   * 先頭の1つを「主たる家」として配置のまとまりに使い、残りは所属の記録として持つ。
   * 改姓や婿養子で自動の判定と実感が食い違うときだけ、人物ごとに指定する。
   */
  houseIds: string[];
  /**
   * カードを手で置いた位置。null なら自動レイアウトに従う。
   * ドラッグで移動すると、格子に合わせた座標がここに入る。
   */
  position: CardPosition | null;
  /** 改姓の履歴。出生時の姓から順に並べる。 */
  surnameHistory: SurnameRecord[];
  /** 生年月日を和暦で入れたときの、入力そのまま。西暦は birthDate に持つ */
  birthEra: EraDate | null;
  /** 没年月日の和暦。同上 */
  deathEra: EraDate | null;
  /** 生年がはっきりしない（「頃」）。古い記録では珍しくない */
  birthDateUncertain: boolean;
  /** 没年がはっきりしない（「頃」） */
  deathDateUncertain: boolean;
  /**
   * 端末内で暗号化した機微項目（本籍地・住所・戒名・お墓・思い出）。
   * 中身は src/lib/crypto.ts の SensitiveFields。鍵が無ければ復号できない。
   */
  encryptedData: EncryptedPayload | null;
  /** ソフト削除の時刻（ISO文字列）。null なら生存レコード。 */
  deletedAt: string | null;
}

/** 人物の新規作成・更新で編集できる項目。 */
export type PersonInput = Pick<
  Person,
  | 'familyName'
  | 'givenName'
  | 'familyNameKana'
  | 'givenNameKana'
  | 'maidenName'
  | 'gender'
  | 'birthDate'
  | 'deathDate'
  | 'birthEra'
  | 'deathEra'
  | 'birthDateUncertain'
  | 'deathDateUncertain'
  | 'birthPlace'
  | 'note'
  | 'isLiving'
  | 'birthOrder'
  | 'surnameHistory'
  | 'encryptedData'
  | 'houseIds'
>;

/** 何も入力していない状態の人物。フォームの初期値に使う。 */
export const EMPTY_PERSON_INPUT: PersonInput = {
  familyName: '',
  givenName: '',
  familyNameKana: '',
  givenNameKana: '',
  maidenName: '',
  gender: 'unknown',
  birthDate: '',
  deathDate: '',
  birthEra: null,
  deathEra: null,
  birthDateUncertain: false,
  deathDateUncertain: false,
  birthPlace: '',
  note: '',
  isLiving: true,
  birthOrder: '',
  surnameHistory: [],
  encryptedData: null,
  houseIds: [],
};

/**
 * 何も入力していない人物。
 * 表示用の仮のカードや、テスト・デモの土台に使う。ID は使う側で入れる。
 */
export const EMPTY_PERSON: Person = {
  ...EMPTY_PERSON_INPUT,
  id: '',
  siblingOrder: null,
  generationShift: null,
  position: null,
  deletedAt: null,
};

/**
 * 配偶者として追加する人の性別の既定値。
 * 男女どちらかが分かっていればもう一方を初期選択にし、選び直す手間を減らす。
 * 断定はできないので、いつでも変更できる「既定値」に留める。
 */
export function oppositeGender(gender: Gender): Gender {
  if (gender === 'male') return 'female';
  if (gender === 'female') return 'male';
  return 'unknown';
}

export interface ParentChild {
  id: string;
  parentId: string;
  childId: string;
  kind: ParentKind;
  deletedAt: string | null;
}

export interface Union {
  id: string;
  partner1Id: string;
  partner2Id: string;
  status: UnionStatus;
  startDate: string | null;
  endDate: string | null;
  deletedAt: string | null;
}

export interface Invitation {
  id: string;
  email: string | null;
  role: TreeRole;
  /** 期限まで何人でも使える共通リンクか */
  shared: boolean;
  /** 共通リンクのときだけ、そのままの文字列を控えてある（あとで配り直せるように） */
  token: string | null;
  /** 共通リンクを使って入った人数 */
  acceptedCount: number;
  /** このリンクから入った人の uid（誰がどのリンクで入ったかを追えるように） */
  acceptedUids: string[];
  /** 何のために配ったかの覚え書き。リンクが増えたときに見分けるためのもの */
  label: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  createdAt: string | null;
}

export interface InvitationPreview {
  treeName: string;
  role: TreeRole;
  requiresEmail: string | null;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  entity: string;
  entityId: string | null;
  action: 'insert' | 'update' | 'delete' | 'restore';
  createdAt: string | null;
}

/** ツリー1件分のデータをまとめて保持する。ビューはこれを入力にする。 */
export interface TreeGraph {
  persons: Person[];
  parentChild: ParentChild[];
  unions: Union[];
}

export const ROLE_LABELS: Record<TreeRole, string> = {
  owner: 'オーナー',
  editor: '編集者',
  viewer: '閲覧者',
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: '男性',
  female: '女性',
  other: 'その他',
  unknown: '不明',
};

/**
 * 続柄として選べる値。
 * 戸籍では「二男」と書くことも多いが、ここでは一般的な「次男」に揃えている。
 */
const ORDINAL_PREFIXES = ['長', '次', '三', '四', '五', '六', '七', '八', '九', '十'];

export const BIRTH_ORDER_OPTIONS: string[] = [
  ...ORDINAL_PREFIXES.map((prefix) => `${prefix}男`),
  ...ORDINAL_PREFIXES.map((prefix) => `${prefix}女`),
  ...Array.from({ length: 10 }, (_, i) => `第${i + 1}子`),
  '養子',
  '養女',
];

export const PARENT_KIND_LABELS: Record<ParentKind, string> = {
  biological: '実子',
  adoptive: '養子',
  special_adoptive: '特別養子',
  son_in_law_adoptive: '婿養子',
  step: '連れ子',
  foster: '里子',
};

export const SURNAME_CHANGE_REASON_LABELS: Record<SurnameChangeReason, string> = {
  birth: '出生',
  marriage: '婚姻',
  divorce: '離婚',
  adoption: '養子縁組',
  branch: '分家',
  other: 'その他',
};

export const UNION_STATUS_LABELS: Record<UnionStatus, string> = {
  married: '婚姻',
  divorced: '離婚',
  widowed: '死別',
  partner: 'パートナー',
};

/** 表示用の氏名。姓と名のどちらかが欠けていても破綻しないようにする。 */
export function displayName(person: Pick<Person, 'familyName' | 'givenName'>): string {
  const name = [person.familyName, person.givenName].filter(Boolean).join(' ');
  return name || '(名前未設定)';
}

/** 「1958–」「1930–2005」のような生没年表記。 */
export function lifespanLabel(
  person: Pick<Person, 'birthDate' | 'deathDate' | 'isLiving'>,
): string {
  const birth = person.birthDate?.slice(0, 4) ?? '';
  const death = person.deathDate?.slice(0, 4) ?? '';

  if (!birth && !death) return '';
  if (person.isLiving) return birth ? `${birth}–` : '';
  return `${birth}–${death}`;
}

/** ふりがなを含めた表示用の読み。検索の対象にも使う。 */
export function displayNameKana(person: Pick<Person, 'familyNameKana' | 'givenNameKana'>): string {
  return [person.familyNameKana, person.givenNameKana].filter(Boolean).join(' ');
}

/**
 * 出生時の姓。改姓履歴の先頭を使い、無ければ旧姓、それも無ければ現在の姓。
 * ツリー上で「いつ姓が変わったか」を出すために使う。
 */
export function originalFamilyName(person: Person): string | null {
  const first = person.surnameHistory?.[0];
  return first?.familyName ?? person.maidenName ?? person.familyName;
}

/** 改姓しているか（履歴が2件以上、または旧姓が現在の姓と異なる）。 */
export function hasSurnameChange(person: Person): boolean {
  if ((person.surnameHistory?.length ?? 0) > 1) return true;
  return Boolean(person.maidenName && person.maidenName !== person.familyName);
}
