/**
 * 照片 URL 宽度策略（M5 文档 §4.6；设计文档 §7.6「maxWidth 按格子尺寸请求 /
 * 查看器按屏幕宽×dpr」+ §11 防大图 OOM）。纯函数、参数化便于单测。
 */

/** 网格格子请求宽（物理像素）：ceil(窗口宽 ÷ 列数 × dpr) */
export function getPhotoCellMaxWidth(
  windowWidthDp: number,
  pixelRatio: number,
  columns: number
): number {
  return Math.ceil((windowWidthDp / columns) * pixelRatio);
}

/** 查看器请求宽（物理像素）：ceil(窗口宽 × dpr)，见设计文档 §7.6 */
export function getPhotoViewerMaxWidth(windowWidthDp: number, pixelRatio: number): number {
  return Math.ceil(windowWidthDp * pixelRatio);
}
