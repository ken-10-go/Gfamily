/**
 * 縦書きに合わせて文字を置き換える。
 *
 * 生没年の「1931–2025」の横棒は、縦書きだと横に寝たままになって
 * 途切れた線のように見える（`text-orientation: upright` で字を立てているため）。
 * 縦書きの組版に合わせて、縦の棒（｜）に置き換える。
 *
 * 純粋関数。置き換えたい文字が増えてもここだけを見ればよい。
 */
export function verticalText(text: string): string {
  return text.replace(/[-–—〜~]/g, '｜');
}
