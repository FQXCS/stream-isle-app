/**
 * 搜索域常量（04 文档 §4.8；设计文档 §7.4）。
 */
import type { MessageKey } from '@/i18n/messages/zh';

/** 输入防抖间隔（毫秒） */
export const SEARCH_DEBOUNCE_MS = 400;

/**
 * 分组限额（按类型三请求各设限额）：单请求共享 Limit 会让返回序靠前的类型
 * 长期挤占配额、其余组在大库下恒空（04 §4.3）。
 */
export const SEARCH_GROUP_LIMIT = 12;

/** 搜索结果分组标题（组标题由常量提供，04 §4.3 SearchResultGroup 不携带） */
export const SEARCH_GROUP_TITLE_MAP: Record<'MOVIE' | 'SERIES' | 'PERSON', MessageKey> = {
  MOVIE: 'search.movies',
  SERIES: 'search.series',
  PERSON: 'search.people',
};

/** 人物头像请求最大宽度（搜索结果头像卡，04 §4.8） */
export const PERSON_AVATAR_MAX_WIDTH = 200;
