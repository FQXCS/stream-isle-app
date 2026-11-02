/**
 * 服务器版本门槛常量（M1 文档 §4.2；设计文档 §5.1）。
 */
import type { ServerFlavor } from '@/adapter/model';

/** Jellyfin 最低支持版本（低于则版本过低警告） */
export const MIN_JELLYFIN_VERSION = '10.8';

/** Emby 最低支持版本（低于则版本过低警告） */
export const MIN_EMBY_VERSION = '4.7';

/** 设置页 flavor 分段选项（库页 Tab/排序配置第一级） */
export const SERVER_FLAVOR_OPTIONS: readonly { value: ServerFlavor; label: string }[] = [
  { value: 'JELLYFIN', label: 'Jellyfin' },
  { value: 'EMBY', label: 'Emby' },
];
