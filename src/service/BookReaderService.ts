/**
 * 图书阅读服务（M7）：Book 原文件本地缓存与阅读断点。
 * 下载复用 expo-file-system/legacy downloadAsync（仿 DownloadService，不走 ApiClient），
 * 缓存目录 cacheDirectory/pdf/{serverId}/{itemId}.pdf（系统磁盘紧张可回收，不做主动清理）；
 * 断点页码存 MMKV。Book 无媒体源概念，URL 由 adapter.buildBookFileUrl 产出（api_key 认证），
 * 不触碰 PlaybackInfo（Emby 对 Book 必 500）。
 */
import * as FileSystem from 'expo-file-system/legacy';
import { AppError } from '@/infra/error';
import { mmkv } from '@/infra/storage';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';

/** 阅读缓存目录名（cacheDirectory 下） */
const READER_CACHE_DIR = 'pdf';
/** 阅读断点 MMKV key 前缀（完整 key：reader-position:{serverId}:{itemId}） */
const READER_POSITION_PREFIX = 'reader-position';

/** 下载进度（totalBytesExpectedToWrite 未知时 percent 为 null，页面退化为不定进度） */
export interface ReaderDownloadProgress {
  percent: number | null;
}

export class BookReaderService {
  /**
   * 取 Book 原文件本地 uri：缓存命中直接返回；未命中经 buildBookFileUrl 下载
   * （进度经 onProgress 回调）。下载失败/非 200 抛 AppError（页面就地错误态）。
   */
  async ensureLocalPdf(
    itemId: string,
    onProgress?: (progress: ReaderDownloadProgress) => void
  ): Promise<string> {
    const active = useAccountStore.getState().active;
    if (!active) {
      throw new Error('时序错误：无活跃账号时不应调用 BookReaderService');
    }
    const fileUri = `${FileSystem.cacheDirectory ?? ''}${READER_CACHE_DIR}/${active.serverId}/${itemId}.pdf`;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      return fileUri;
    }

    const adapter = getActiveAdapter();
    const dirUri = fileUri.substring(0, fileUri.lastIndexOf('/'));
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    const download = FileSystem.createDownloadResumable(
      adapter.buildBookFileUrl(itemId),
      fileUri,
      {},
      (progress) => {
        const total = progress.totalBytesExpectedToWrite;
        onProgress?.({
          percent: total > 0 ? Math.floor((progress.totalBytesWritten / total) * 100) : null,
        });
      }
    );
    try {
      const result = await download.downloadAsync();
      if (!result || result.status !== 200) {
        // 非 200（鉴权失效/条目被删等）：残留半截文件无消费价值，删掉再报错
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
        throw new AppError('SERVER_ERROR');
      }
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      // 网络中断/存储异常统一按网络类归一（页面错误态重试）
      throw new AppError('NETWORK_UNREACHABLE', { cause: err });
    }
    return fileUri;
  }

  /** 读断点页码（1-based；无记录/脏值返回 1） */
  getResumePage(itemId: string): number {
    const key = this.positionKey(itemId);
    // mmkv.getString 缺失返回 undefined（storage 适配层已归一 null，此处直接真值判定）
    const raw = key === null ? undefined : mmkv.getString(key);
    const page = raw === undefined ? Number.NaN : parseInt(raw, 10);
    return Number.isFinite(page) && page > 0 ? page : 1;
  }

  /** 写断点页码（翻页时调用，MMKV 同步写无性能负担） */
  saveResumePage(itemId: string, page: number): void {
    const key = this.positionKey(itemId);
    if (key !== null) {
      mmkv.set(key, String(page));
    }
  }

  /** 读至末页自动标记已看（复用 markPlayed；失败由调用方静默，不影响阅读） */
  async markRead(itemId: string): Promise<void> {
    const adapter = getActiveAdapter();
    const active = useAccountStore.getState().active;
    if (!active) {
      throw new Error('时序错误：无活跃账号时不应调用 BookReaderService');
    }
    await adapter.markPlayed(active.userId, itemId);
  }

  /** 断点 key（无活跃账号返回 null，读写退化为无操作/默认值） */
  private positionKey(itemId: string): string | null {
    const active = useAccountStore.getState().active;
    return active === null ? null : `${READER_POSITION_PREFIX}:${active.serverId}:${itemId}`;
  }
}

/** 全局单例 */
export const bookReaderService = new BookReaderService();
