/**
 * 图书文件大小惰性采集（M8 增量）：
 * Emby/Jellyfin 的 Book 条目 DTO 不返回 Size/MediaSources（实测 Emby 4.10 列表与详情均无），
 * 通过原文件下载端点（buildBookFileUrl）发一字节 Range 请求，从 Content-Range 总分片取大小；
 * 结果按 serverId:itemId 缓存 Promise（含失败 null，避免重复请求），并发上限 3，失败静默。
 */
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';

/** 同时进行的大小探测请求上限 */
const MAX_CONCURRENT_PROBES = 3;
/** 只取首字节（服务器返回 206 + Content-Range: bytes 0-0/总大小） */
const RANGE_HEADER = { Range: 'bytes=0-0' };

export class BookSizeService {
  private readonly cache = new Map<string, Promise<number | null>>();

  private runningCount = 0;

  private readonly waitQueue: (() => void)[] = [];

  /** 取文件大小（字节）；失败/无活跃账号返回 null，并由卡片静默不展示 */
  loadSize(itemId: string): Promise<number | null> {
    const active = useAccountStore.getState().active;
    if (active === null) {
      return Promise.resolve(null);
    }
    const key = `${active.serverId}:${itemId}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const task = this.runLimited(() => this.fetchSize(itemId));
    this.cache.set(key, task);
    return task;
  }

  /** 并发闸门：超过上限的探测排队，前一个结束后放行 */
  private async runLimited<T>(task: () => Promise<T>): Promise<T> {
    if (this.runningCount >= MAX_CONCURRENT_PROBES) {
      await new Promise<void>((resolve) => {
        this.waitQueue.push(resolve);
      });
    }
    this.runningCount += 1;
    try {
      return await task();
    } finally {
      this.runningCount -= 1;
      this.waitQueue.shift()?.();
    }
  }

  private async fetchSize(itemId: string): Promise<number | null> {
    try {
      const response = await fetch(getActiveAdapter().buildBookFileUrl(itemId), {
        headers: RANGE_HEADER,
      });
      if (response.status !== 206) {
        // 服务器不支持 Range（返回 200 整包）时立即取消响应体，避免整本 PDF 进内存
        void response.body?.cancel().catch(() => undefined);
        return null;
      }
      const contentRange = response.headers.get('content-range');
      const total = contentRange !== null ? Number(contentRange.split('/')[1]) : Number.NaN;
      return Number.isFinite(total) && total > 0 ? total : null;
    } catch {
      return null;
    }
  }
}

/** 全局单例 */
export const bookSizeService = new BookSizeService();
