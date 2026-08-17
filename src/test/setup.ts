import '@testing-library/jest-dom/vitest';

/*
 * jsdom には ResizeObserver が無い。家系図の描画は要素の大きさを見て
 * 全体表示に合わせるので、これが無いと描画そのものをテストできない。
 * 大きさは 0 のままでよい（座標の計算はレイアウト側が持っている）。
 */
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
