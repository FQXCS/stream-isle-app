/**
 * EmbyAdapter：差异覆写（M1 文档 §4.6.4）。
 * 设备认证头走 X-Emby-Authorization，登录后 Token 注入 X-Emby-Token 独立头。
 */
import { BaseAdapter } from '@/adapter/BaseAdapter';

export class EmbyAdapter extends BaseAdapter {
  /** Emby 设备认证头：X-Emby-Authorization */
  protected authHeaderName(): 'Authorization' | 'X-Emby-Authorization' {
    return 'X-Emby-Authorization';
  }

  /** 登录后 Token 注入 X-Emby-Token 独立头 */
  protected tokenHeader(token: string): Record<string, string> {
    return { 'X-Emby-Token': token };
  }

  /** Emby 图片不追加 tag 参数（无缓存破坏需求） */
  protected imageTagQuery(_tag?: string): Record<string, string> {
    return {};
  }

  /** ActiveEncodings 参数名：Emby 为 id（设计文档 §7.2 记载形态，03 §4.5.3） */
  protected activeEncodingsQueryKey(): 'playSessionId' | 'id' {
    return 'id';
  }
}
