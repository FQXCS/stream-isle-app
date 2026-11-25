/**
 * TV 库浏览域常量（TV-m2 §4.1）：手机 GRID_COLUMNS=3 为手机值，TV 自定列数。
 * 列数定值（TV-m2 开放问题 1）：960dp 屏宽 − 2×32 overscan − 32 网格留白 = 896dp 内容区，
 * 6 列卡宽 ~128dp（与 m1 卡尺度衔接、10-foot 可读性好）；7 列 ~118dp 过窄不取。
 */
export const TV_GRID_COLUMNS = 6;

/** 网格单元间隙（卡间横向 + 行间纵向一致，视觉密度对齐 m1 行内 gap 16） */
export const TV_GRID_GAP = 16;

/** 网格外侧留白（TvScreenFrame 32 之外的内容区横向 padding） */
export const TV_GRID_CONTENT_PADDING = 16;
