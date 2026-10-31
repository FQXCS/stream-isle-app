/**
 * JellyfinAdapter：差异覆写（M1 文档 §4.6.4）。
 * Jellyfin 10.9+ 强制标准 Authorization 头（格式不对会 401），Token 按官方推荐拼入同一头。
 */
import { BaseAdapter } from '@/adapter/BaseAdapter';

export class JellyfinAdapter extends BaseAdapter {
  /** 10.9+ 强制标准头：Authorization */
  protected authHeaderName(): 'Authorization' | 'X-Emby-Authorization' {
    return 'Authorization';
  }

  /** Token 拼入同一 Authorization 头（buildHeaders 实现），无额外注入头 */
  protected tokenHeader(_token: string): Record<string, string> {
    return {};
  }

  /** Jellyfin 追加 tag 参数做缓存破坏（§6.1 图片行） */
  protected imageTagQuery(tag?: string): Record<string, string> {
    return tag ? { tag } : {};
  }

  /** ActiveEncodings 参数名：Jellyfin 新版 playSessionId（03 §4.5.3；实测不生效则兜底双参数并回评差异表） */
  protected activeEncodingsQueryKey(): 'playSessionId' | 'id' {
    return 'playSessionId';
  }
}
