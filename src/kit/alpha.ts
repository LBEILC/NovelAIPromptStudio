// 透明图下面垫的棋盘格（doc/design.md 2.32）：图片加载完才铺，样式见 10-product.css 的 img.alpha-bg。
// 只设 data-loaded，不动 className：React 重新渲染时会整个覆盖 className。
import type { SyntheticEvent } from 'react';

export const markLoaded = (e: SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.dataset.loaded = '';
};

/** 大图的底色：棋盘格、白、黑。记在这台电脑上（localStorage），下次打开大图沿用 */
export type Matte = 'checker' | 'white' | 'black';
const MATTE_KEY = 'nps.viewer.matte';

export function readMatte(): Matte {
  try {
    const v = localStorage.getItem(MATTE_KEY);
    return v === 'white' || v === 'black' ? v : 'checker';
  } catch {
    return 'checker';
  }
}

export function writeMatte(v: Matte) {
  try {
    localStorage.setItem(MATTE_KEY, v);
  } catch {
    // 存不下就只在这次打开里生效
  }
}
