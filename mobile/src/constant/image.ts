/**
 * 图片请求参数常量（M1 文档 §4.2；设计文档 §11）。
 * M2/M5 增量字段（DETAIL_BACKDROP_MAX_WIDTH 等）由对应里程碑追加，不在 M1 双留。
 */

/** 海报请求最大宽度 */
export const POSTER_MAX_WIDTH = 400;

/** 图片压缩质量（0-100） */
export const IMAGE_QUALITY = 85;

/** 登录响应头像 URL 最大宽度（§4.6.3 login 行 avatarUrl） */
export const AVATAR_MAX_WIDTH = 128;

/** 详情页 Hero 背景图最大宽度（Backdrop，M2 §4.7 增量） */
export const DETAIL_BACKDROP_MAX_WIDTH = 1280;

/** 详情页海报/Logo 最大宽度（Primary/Logo，M2 §4.7 增量） */
export const DETAIL_POSTER_MAX_WIDTH = 600;

/** 人物头像最大宽度（Primary，M2 §4.7 增量） */
export const PERSON_HEAD_MAX_WIDTH = 200;

/** 集列表缩略图最大宽度（M2 §4.7 增量） */
export const EPISODE_THUMB_MAX_WIDTH = 400;
