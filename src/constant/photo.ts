/**
 * 照片域常量（M5 文档 §4.8；设计文档 §7.6/§11）。
 */

/** 相册内照片网格列数（设计文档 §7.6：3 列等宽方格） */
export const PHOTO_GRID_COLUMNS = 3;

/** 相册网格列数 */
export const PHOTO_ALBUM_GRID_COLUMNS = 2;

/** 相册内照片分页页大小（3 列高密度网格，高于海报墙 40） */
export const PHOTO_PAGE_SIZE = 60;

/** 保存到系统相册的相册名（M5 文档 §4.14） */
export const SAVE_ALBUM_NAME = 'Stream Isle';

/** 查看器距已加载片段末尾多少张时预载下一页 */
export const PHOTO_VIEWER_PRELOAD_REMAINING = 5;
