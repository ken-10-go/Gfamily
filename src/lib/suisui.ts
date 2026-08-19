import { fromEra } from '@/lib/japanese-date';
import { EMPTY_PERSON_INPUT, type EraDate, type Gender, type PersonInput } from '@/types/models';

/**
 * 「すいすい家系図」の書き出し（.ftz / node.ftt）を読む。
 *
 * .ftz は ZIP で、中の `node.ftt` がタブ区切りのテキスト（UTF-8 BOM 付き）。
 * 1行目が件数の見出しで、そのあとに人物の行、最後に夫婦の行が続く。
 *
 *   見出し: 人物の数 \t 夫婦の数 \t 基準にしている人物ID
 *   人物:   ID \t ? \t 親の夫婦ID \t 兄弟の順 \t ? \t ? \t X \t Y \t 0 \t 0 \t 0 \t 0
 *           \t 姓 \t 名 \t 姓かな \t 名かな
 *           \t 生の元号 \t 年 \t 月 \t 日 \t 没の元号 \t 年 \t 月 \t 日 \t 性別
 *           \t … \t メモ
 *   夫婦:   ID \t ? \t 夫のID \t ? \t 妻のID \t ? \t X \t Y \t 0 \t 0 \t 0 \t 0
 *
 * 元号は数値のコードで入っている。分かっているのは西暦（128）と昭和（1785）だけで、
 * 他の元号のコードは手元の書き出しに現れなかった。**知らないコードは捨てずに
 * `unknownEras` として持ち帰る**（黙って日付を落とすと、取り込んだあとに気付けない）。
 *
 * 純粋関数だけを置く。ファイルの読み込みと画面はここに持ち込まない。
 */

/** 元号のコード。分かっているものだけを並べる。 */
const ERA_CODES: Record<number, string> = {
  128: '西暦',
  1785: '昭和',
};

/** 「存命」「不明」を表すコード。年が 0 のときは、そもそも入力されていない。 */
const UNKNOWN_ERA = new Set([0, 2]);

export interface ImportPerson {
  /** 書き出しの中での ID。関係をつなぎ直すのに使う */
  sourceId: string;
  input: PersonInput;
}

export interface ImportUnion {
  sourceId: string;
  partner1SourceId: string;
  partner2SourceId: string;
  /** その夫婦の子。書き出しの順（兄弟の並び）どおり */
  childSourceIds: string[];
}

export interface ImportData {
  persons: ImportPerson[];
  unions: ImportUnion[];
  /** 読み取れなかった元号のコード。画面で知らせるために持つ */
  unknownEras: number[];
}

/** 日付ひとつぶん。西暦の文字列と、和暦で入っていたときの元の値。 */
function readDate(
  code: number,
  year: number,
  month: number,
  day: number,
  unknown: Set<number>,
): { date: string | null; era: EraDate | null } {
  if (UNKNOWN_ERA.has(code) || year === 0) return { date: null, era: null };

  const eraName = ERA_CODES[code];
  if (!eraName) {
    unknown.add(code);
    return { date: null, era: null };
  }

  const parts = [
    String(year).padStart(4, '0'),
    month > 0 ? String(month).padStart(2, '0') : null,
    month > 0 && day > 0 ? String(day).padStart(2, '0') : null,
  ].filter((part): part is string => part !== null);

  if (eraName === '西暦') return { date: parts.join('-'), era: null };

  // 和暦は「戸籍に何と書いてあったか」として残し、西暦は並び替え用に別に持つ
  return {
    date: fromEra(eraName, year, month || null, day || null),
    era: { eraName, eraYear: year, month: month || null, day: day || null },
  };
}

const GENDERS: Record<string, Gender> = { '1': 'male', '2': 'female' };

/** タブ区切りの1行を数値で読む。空欄は 0 とみなす。 */
const num = (value: string | undefined) => Number(value ?? '0') || 0;

/** 空欄を null に寄せる。空文字のまま保存すると「入力済みの空」と区別が付かない */
const text = (value: string | undefined) => value?.trim() || null;

export function parseSuisui(content: string): ImportData {
  // BOM が付いたまま読むと、最初の項目が数値にならない
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const [personCount = 0, unionCount = 0] = (lines[0] ?? '').split('\t').map(Number);

  const unknown = new Set<number>();
  const persons: ImportPerson[] = [];
  /** 親の夫婦ID → 子（兄弟の順に並べる） */
  const childrenOf = new Map<string, { id: string; order: number }[]>();

  for (const line of lines.slice(1, 1 + personCount)) {
    const cells = line.split('\t');
    if (cells.length < 25) continue;

    const birth = readDate(num(cells[16]), num(cells[17]), num(cells[18]), num(cells[19]), unknown);
    const death = readDate(num(cells[20]), num(cells[21]), num(cells[22]), num(cells[23]), unknown);

    persons.push({
      sourceId: cells[0],
      input: {
        ...EMPTY_PERSON_INPUT,
        familyName: text(cells[12]),
        givenName: text(cells[13]),
        familyNameKana: text(cells[14]),
        givenNameKana: text(cells[15]),
        gender: GENDERS[cells[24]] ?? 'unknown',
        birthDate: birth.date,
        birthEra: birth.era,
        deathDate: death.date,
        deathEra: death.era,
        // 没年が入っていれば故人。入っていなければ存命として扱う
        isLiving: death.date === null,
        note: text(cells[28]),
      },
    });

    const parentUnion = cells[2];
    if (parentUnion && parentUnion !== '0') {
      childrenOf.set(parentUnion, [
        ...(childrenOf.get(parentUnion) ?? []),
        { id: cells[0], order: num(cells[3]) },
      ]);
    }
  }

  const unions: ImportUnion[] = [];
  for (const line of lines.slice(1 + personCount, 1 + personCount + unionCount)) {
    const cells = line.split('\t');
    if (cells.length < 6) continue;

    unions.push({
      sourceId: cells[0],
      partner1SourceId: cells[2],
      partner2SourceId: cells[4],
      childSourceIds: (childrenOf.get(cells[0]) ?? [])
        .sort((a, b) => a.order - b.order)
        .map((child) => child.id),
    });
  }

  return { persons, unions, unknownEras: [...unknown].sort((a, b) => a - b) };
}

/**
 * ZIP（.ftz）の中から node.ftt を取り出す。
 *
 * 取り込みのためだけに zip の読み書きを丸ごと抱えたくないので、
 * 必要な範囲——「無圧縮」と「deflate」の1ファイル——だけを自前で読む。
 * 展開はブラウザの DecompressionStream に任せる（外部の部品を足さない）。
 */
export async function readFtz(buffer: ArrayBuffer): Promise<string> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  for (let at = 0; at + 30 <= bytes.length;) {
    // ローカルファイルヘッダの目印。これ以外に当たったら、そこで終わり
    if (view.getUint32(at, true) !== 0x04034b50) break;

    const method = view.getUint16(at + 8, true);
    const compressed = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const nameAt = at + 30;
    const dataAt = nameAt + nameLength + extraLength;
    const name = new TextDecoder().decode(bytes.subarray(nameAt, nameAt + nameLength));

    if (name.endsWith('.ftt')) {
      const chunk = bytes.subarray(dataAt, dataAt + compressed);
      if (method === 0) return new TextDecoder().decode(chunk);
      if (method === 8) return await inflateRaw(chunk);
      throw new Error('この形式の圧縮には対応していません');
    }

    at = dataAt + compressed;
  }

  throw new Error('家系図のデータ（node.ftt）が見つかりませんでした');
}

async function inflateRaw(chunk: Uint8Array): Promise<string> {
  const stream = new Blob([chunk as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));

  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
