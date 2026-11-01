/**
 * 文件夹封面（M7）：Emby/Jellyfin 不给 Folder 条目图片（/Items/{id}/Images/Primary 返回 404），
 * 客户端取目录内首个带海报的条目当封面（列表页懒加载，滚动到才请求）。
 * 结果进程内缓存（null = 无封面，不重试）；并发上限 4，避免一页 40 个目录同时发请求。
 */
import { fetchFolderPreview } from '@/service/BrowseService';

/** 同时最多 4 个封面请求 */
const MAX_CONCURRENT = 4;

/** 目录 id → 封面 URL（null = 已查过但无封面） */
const coverCache = new Map<string, string | null>();

let activeCount = 0;
const waitQueue: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeCount += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeCount -= 1;
  const next = waitQueue.shift();
  if (next !== undefined) {
    next();
  }
}

/**
 * 取目录封面 URL（懒加载 + 缓存）：目录内前 5 个条目里第一个带海报的条目封面；
 * 查不到（空目录/纯目录层）返回 null，卡片回退文件夹图标。
 */
export async function loadFolderCover(folderId: string): Promise<string | null> {
  const cached = coverCache.get(folderId);
  if (cached !== undefined) {
    return cached;
  }
  await acquireSlot();
  try {
    // 拿到槽位后可能已被并发请求填过缓存
    const rechecked = coverCache.get(folderId);
    if (rechecked !== undefined) {
      return rechecked;
    }
    const page = await fetchFolderPreview(folderId);
    const cover = page.items.find((item) => item.posterImageUrl !== undefined)?.posterImageUrl;
    const url = cover ?? null;
    coverCache.set(folderId, url);
    return url;
  } catch {
    // 失败不缓存，滚动回来看时仍可重试
    return null;
  } finally {
    releaseSlot();
  }
}
