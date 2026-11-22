/**
 * adapter 工厂（M1 文档 §4.6.4）：flavor 分发到两个子类；
 * token 变更（登录/重登）即重建实例。预留 StreamIsleAdapter 第三实现位（设计文档 §14.1）。
 */
import { BaseAdapter, type AdapterParams } from '@/adapter/BaseAdapter';
import { EmbyAdapter } from '@/adapter/EmbyAdapter';
import { JellyfinAdapter } from '@/adapter/JellyfinAdapter';
import type { ServerAdapter } from '@/adapter/ServerAdapter';

export type { AdapterParams };

/** 按服务器类型创建 adapter 实例 */
export function createAdapter(params: AdapterParams): ServerAdapter {
  const adapter: BaseAdapter =
    params.flavor === 'JELLYFIN' ? new JellyfinAdapter(params) : new EmbyAdapter(params);
  return adapter;
}
