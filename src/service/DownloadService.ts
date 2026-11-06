/**
 * 下载服务（M6 文档 §4.4.2；设计文档 §7.7）：离线下载编排与单飞调度。
 * 职责：判定（查重 → resolve 直连判定 → 磁盘空间校验）→ 建目录 + SQLite 快照行 →
 * worker 调度（MAX_CONCURRENT_DOWNLOADS=1 单飞，其余排队）→ 暂停/续传/重试/删除 →
 * 本地播放会话构造（buildLocalSession）→ 冷启动恢复（rehydrate）。
 * 下载 URL 与 PlaybackSource.url 同模板（{base}/Videos/{id}/stream?static=true…，设计 §6.1/§8.1）
 * ——resolve 的 URL 含 token 不落库，起任务（含续传/重试）时按快照行重建，日志一律脱敏。
 * 进度仅写内存 store（节流 DOWNLOAD_PROGRESS_UI_THROTTLE_MS），状态迁移/暂停才落 SQLite。
 * 断点续传：pauseAsync 产物的 resumeData（「已下载字节偏移十进制字符串」，原生直接拼
 * Range: bytes=<offset>- 请求头）落库；冷启动 downloading 一律降级 paused。
 */
import * as FileSystem from 'expo-file-system/legacy';

import type {
  EpisodeItem,
  MediaDetail,
  MediaLibraryItem,
  PlaybackSession,
} from '@/adapter/model';
import {
  DOWNLOAD_DIR_NAME,
  DOWNLOAD_MEDIA_FILE_BASE_NAME,
  DOWNLOAD_POSTER_FILE_NAME,
  DOWNLOAD_PROGRESS_UI_THROTTLE_MS,
  MIN_FREE_DISK_MARGIN_BYTES,
} from '@/constant/download';
import { DETAIL_POSTER_MAX_WIDTH } from '@/constant/image';
import type { DownloadDao, DownloadRow } from '@/infra/db';
import { getDownloadDao } from '@/infra/db';
import { AppError } from '@/infra/error';
import { getToken } from '@/infra/tokenVault';
import { getActiveAdapter } from '@/service/adapterProvider';
import { playbackService } from '@/service/PlaybackService';
import { useAccountStore } from '@/store/accountStore';
import { useDownloadStore, type DownloadTaskUi } from '@/store/downloadStore';
import { useSettingsStore } from '@/store/settingsStore';
import { sanitizedForLog } from '@/util/sanitize';
import { getResumePositionMs } from '@/util/resume';
import { newUid } from '@/util/uuid';

/**
 * 下载入参：电影为 MediaLibraryItem 基类字段；剧集为集级条目（M2 增量 EpisodeItem 已定型）。
 * 剧集上下文字段（seriesName/seasonNumber）由详情页拼好传入（集条目模型不携带剧名/季号，
 * 06 文档 §4.4.1 副标题「剧名 · S1E2 集名」的取材来源）。
 */
export type DownloadableItem = MediaLibraryItem &
  Partial<EpisodeItem> & { seriesName?: string; seasonNumber?: number };

/** 可注入依赖（单测假实现断言判定/状态机/落库序列；缺省取真实环境值） */
export interface DownloadServiceDeps {
  /** 播放决策（PlaybackService.resolve：DeviceProfile 全量 → PlaybackSource） */
  resolveItem: (itemId: string) => Promise<PlaybackSession>;
  /** 详情快照（adapter.getItemDetail：元数据 + MediaSource.sizeBytes/container） */
  loadDetail: (userId: string, itemId: string) => Promise<MediaDetail>;
  /** 海报 URL（本地化下载用；带 token 完整 URL） */
  loadPosterUrl: (itemId: string) => string;
  /** 下载快照 DAO */
  dao: DownloadDao;
  /** 剩余磁盘空间（FileSystem.getFreeDiskStorageAsync） */
  freeDiskBytes: () => Promise<number>;
  /** 时钟（完成时间戳/节流，单测注入） */
  nowFn?: () => number;
}

/** 进度回调携带的期望值（expo-file-system DownloadProgressData 所需子集） */
interface DownloadProgressDataLike {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}

/** 排队任务（携带任务归属服务器：worker 取件按任务自身服务器定位行，与活跃账号解耦） */
interface QueueTask {
  serverId: string;
  itemId: string;
}

export class DownloadService {
  private readonly resolveItem: (itemId: string) => Promise<PlaybackSession>;

  private readonly loadDetail: (userId: string, itemId: string) => Promise<MediaDetail>;

  private readonly loadPosterUrl: (itemId: string) => string;

  private readonly freeDiskBytes: () => Promise<number>;

  private readonly nowFn: () => number;

  private readonly dao: Promise<DownloadDao>;

  /** 单飞 worker：当前活动任务 */
  private activeItemId: string | null = null;

  private activeResumable: FileSystem.DownloadResumable | null = null;

  /** 排队任务 FIFO（SQLite queued 行为事实源，此处为调度视图） */
  private readonly queue: QueueTask[] = [];

  /** 进度 UI 节流（DOWNLOAD_PROGRESS_UI_THROTTLE_MS；单飞下全局一份节流器即可） */
  private lastUiProgressAt = 0;

  constructor(deps?: Partial<DownloadServiceDeps>) {
    this.resolveItem = deps?.resolveItem ?? ((itemId) => playbackService.resolve(itemId));
    this.loadDetail =
      deps?.loadDetail ?? ((userId, itemId) => getActiveAdapter().getItemDetail(userId, itemId));
    this.loadPosterUrl =
      deps?.loadPosterUrl ??
      ((itemId) => getActiveAdapter().imageUrl(itemId, 'Primary', DETAIL_POSTER_MAX_WIDTH));
    this.freeDiskBytes = deps?.freeDiskBytes ?? (() => FileSystem.getFreeDiskStorageAsync());
    this.nowFn = deps?.nowFn ?? Date.now;
    // DAO：注入优先；缺省懒取生产单例（SQLite 连接首次使用时打开）
    if (deps?.dao !== undefined) {
      this.dao = Promise.resolve(deps.dao);
    } else {
      this.dao = getDownloadDao();
    }
  }

  /**
   * 发起下载（06 文档 §4.4.2 签名语义）：查重（同 (serverId, itemId) 已有任意行 →
   * DOWNLOAD_DUPLICATE，同条目仅保留一份下载）→ 详情快照 → resolve 判定（非 DirectPlay →
   * DOWNLOAD_UNAVAILABLE）→ 磁盘空间校验（sizeBytes 已知且剩余不足 → DOWNLOAD_NO_SPACE）
   * → 建目录 + downloads 行（queued）→ worker 调度。
   */
  async startDownload(item: DownloadableItem): Promise<void> {
    const dao = await this.dao;
    const { serverId, userId } = requireActiveAccount();
    const existing = await dao.getDownload(serverId, item.id);
    if (existing !== null) {
      throw new AppError('DOWNLOAD_DUPLICATE');
    }
    // 决策判定走完整 DeviceProfile（与播放同源，M2 语义一致）；详情快照提供元数据与 sizeBytes/container
    const detail = await this.loadDetail(userId, item.id);
    // 音频：universal 端点对音频恒不走 DirectPlay（DeviceProfile 只声明视频直连），
    // 下载改走静态原流，媒体源直接取详情快照（Emby/Jellyfin 同构）
    let mediaSourceId: string;
    if (item.type === 'Audio') {
      const audioSource = detail.mediaSourceList[0];
      if (audioSource === undefined) {
        throw new AppError('DOWNLOAD_UNAVAILABLE');
      }
      mediaSourceId = audioSource.id;
    } else {
      const session = await this.resolveItem(item.id);
      if (session.playMethod !== 'DirectPlay') {
        throw new AppError('DOWNLOAD_UNAVAILABLE');
      }
      mediaSourceId = session.mediaSourceId;
    }
    const source =
      detail.mediaSourceList.find((media) => media.id === mediaSourceId) ??
      detail.mediaSourceList[0];
    const sizeBytes = source?.sizeBytes;
    if (sizeBytes !== undefined) {
      const freeBytes = await this.freeDiskBytes();
      if (freeBytes < sizeBytes + MIN_FREE_DISK_MARGIN_BYTES) {
        throw new AppError('DOWNLOAD_NO_SPACE');
      }
    }
    const container =
      source?.container !== undefined && source.container !== '' ? source.container : 'mp4';
    const dirUri = `${FileSystem.documentDirectory ?? ''}${DOWNLOAD_DIR_NAME}/${serverId}/${item.id}`;
    const mediaFileUri = `${dirUri}/${DOWNLOAD_MEDIA_FILE_BASE_NAME}.${container}`;
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    const row: DownloadRow = {
      serverId,
      userId,
      itemId: item.id,
      mediaSourceId,
      itemType: detail.type,
      title: detail.name,
      subtitle: buildRowSubtitle(detail, item),
      overview: detail.overview,
      productionYear: detail.productionYear,
      officialRating: detail.officialRating,
      communityRating: detail.communityRating,
      runtimeMs: detail.runtimeMs,
      container,
      sizeBytes,
      mediaFileUri,
      status: 'queued',
      progressBytes: 0,
      userPositionMs: 0,
      userPlayed: false,
      createdAtMs: this.nowFn(),
    };
    if (detail.type === 'Episode') {
      // 剧集专属快照字段（剧集本身无单文件，下载入口必须落到集级，06 §4.4.5）
      row.seriesId = item.seriesId;
      row.seasonId = item.seasonId;
      row.indexNumber = item.indexNumber;
      row.parentIndexNumber = item.seasonNumber;
      row.seriesName = item.seriesName;
    }
    await dao.upsertDownload(row);
    useDownloadStore.getState().upsertTask(rowToUi(row));
    this.enqueue(serverId, item.id);
  }

  /** 暂停：下载中 pauseAsync → resumeData 落库 → paused；排队中直接摘队 → paused */
  async pauseDownload(itemId: string): Promise<void> {
    const { serverId } = requireActiveAccount();
    const dao = await this.dao;
    if (this.activeItemId === itemId && this.activeResumable !== null) {
      // pauseAsync 触发底层任务中止（downloadAsync 以异常结束），runTask 按暂停态收敛不落 failed。
      // resumeData 契约：pauseState.resumeData 是「已下载字节偏移十进制字符串」，原生续传时
      // 直接拼为 Range: bytes=<offset>- 请求头——只存该字符串本身，不得存 DownloadPauseState
      // 包装对象（非数字会被原生抛 InvalidResumeData）
      const pauseState = await this.activeResumable.pauseAsync();
      if (pauseState.resumeData !== null && pauseState.resumeData !== undefined) {
        await dao.updateResumeData(serverId, itemId, pauseState.resumeData);
      }
      await dao.updateProgressBytes(serverId, itemId, this.progressBytesOf(itemId));
      await dao.updateDownloadStatus(serverId, itemId, 'paused');
      useDownloadStore.getState().updateStatus(itemId, 'paused');
      return;
    }
    // 排队任务：摘队 + 状态落库（排队项仅当前活跃服务器视图可见可操作）
    const index = this.queue.findIndex((task) => task.itemId === itemId);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
    await dao.updateDownloadStatus(serverId, itemId, 'paused');
    useDownloadStore.getState().updateStatus(itemId, 'paused');
  }

  /** 继续：paused → queued 入调度（有 resumeData 续传，无则从头，worker 侧按行恢复） */
  async resumeDownload(itemId: string): Promise<void> {
    const { serverId } = requireActiveAccount();
    const dao = await this.dao;
    const row = await dao.getDownload(serverId, itemId);
    if (row === null || row.status !== 'paused') {
      return;
    }
    await dao.updateDownloadStatus(serverId, itemId, 'queued');
    useDownloadStore.getState().updateStatus(itemId, 'queued');
    this.enqueue(serverId, itemId);
  }

  /** 重试：failed → queued（resumeData 有效则由 worker 续传，无效从头） */
  async retryDownload(itemId: string): Promise<void> {
    const { serverId } = requireActiveAccount();
    const dao = await this.dao;
    const row = await dao.getDownload(serverId, itemId);
    if (row === null || row.status !== 'failed') {
      return;
    }
    await dao.updateDownloadStatus(serverId, itemId, 'queued');
    useDownloadStore.getState().updateStatus(itemId, 'queued');
    this.enqueue(serverId, itemId);
  }

  /**
   * 删除（06 文档 §4.4.2 删除语义）：下载中先 cancelAsync → 删目录（幂等）→ 删行；
   * 只删文件与 downloads 行，pending_progress 独立存续（补报不依赖本地文件）。
   */
  async deleteDownload(itemId: string): Promise<void> {
    const { serverId } = requireActiveAccount();
    const dao = await this.dao;
    if (this.activeItemId === itemId && this.activeResumable !== null) {
      // cancelAsync 使 downloadAsync 以 undefined 结束（取消态），runTask 按已删除收敛
      await this.activeResumable.cancelAsync().catch(() => {
        // 幂等吞错
      });
    }
    const queueIndex = this.queue.findIndex((task) => task.itemId === itemId);
    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
    }
    const row = await dao.getDownload(serverId, itemId);
    if (row !== null) {
      // 删除条目级目录（media + poster；幂等，目录缺失不抛）
      const dirUri = row.mediaFileUri.slice(0, row.mediaFileUri.lastIndexOf('/'));
      await FileSystem.deleteAsync(dirUri, { idempotent: true }).catch(() => {
        // 幂等吞错（目录可能已被系统回收）
      });
    }
    await dao.deleteDownload(serverId, itemId);
    useDownloadStore.getState().removeTask(itemId);
  }

  /**
   * 本地播放会话（06 文档 §4.4.2）：读快照行 → 构造 PlaybackSession
   * （url=media_file_uri、playSessionId=客户端生成 UUID、playMethod="DirectPlay"、local=true、
   * positionMsAtStart=离线续播判定（user_played=1 或断点续播关闭 → 0））。
   */
  async buildLocalSession(itemId: string): Promise<PlaybackSession> {
    const { serverId } = requireActiveAccount();
    const dao = await this.dao;
    const row = await dao.getDownload(serverId, itemId);
    if (row === null || row.status !== 'completed') {
      throw new AppError('NOT_FOUND');
    }
    // 断点续播关闭时本地播放同样从头（与在线播放入口共用同一设置）
    const resumeMs = useSettingsStore.getState().resumePlaybackEnabled
      ? getResumePositionMs({
          played: row.userPlayed,
          playbackPositionMs: row.userPositionMs,
          runtimeMs: row.runtimeMs ?? undefined,
        })
      : null;
    return {
      playSessionId: newUid(),
      itemId: row.itemId,
      mediaSourceId: row.mediaSourceId,
      playMethod: 'DirectPlay',
      url: row.mediaFileUri,
      positionMsAtStart: resumeMs ?? 0,
      runTimeMs: row.runtimeMs ?? undefined,
      subtitleList: [],
      audioList: [],
      startedAtEpochMs: this.nowFn(),
      local: true,
      name: row.subtitle !== undefined && row.subtitle !== '' ? row.subtitle : row.title,
    };
  }

  /**
   * 冷启动恢复（06 文档 §4.4.2）：downloading 态一律降为 paused（进程死后无活动连接），
   * 有 resumeData 的保留续传能力；恢复 downloadStore；重启 worker 处理 queued。
   */
  async rehydrate(): Promise<void> {
    const { serverId } = requireActiveAccount();
    const dao = await this.dao;
    const rowList = await dao.getDownloadsByServer(serverId);
    for (const row of rowList) {
      if (row.status === 'downloading') {
        await dao.updateDownloadStatus(serverId, row.itemId, 'paused');
        row.status = 'paused';
      }
    }
    useDownloadStore.getState().replaceAll(rowList.map(rowToUi));
    // 恢复 queued 调度（按发起顺序；任务按自身服务器入队）
    rowList
      .filter((row) => row.status === 'queued')
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .forEach((row) => this.enqueue(row.serverId, row.itemId));
  }

  /** 下载页/详情页聚焦刷新（SQLite → store 投影，切服务器/账号切换后调用） */
  async refreshFromDb(): Promise<void> {
    const { serverId } = requireActiveAccount();
    const dao = await this.dao;
    const rowList = await dao.getDownloadsByServer(serverId);
    useDownloadStore.getState().replaceAll(rowList.map(rowToUi));
  }

  // —— worker 内部 ——

  /** 入调度（queued FIFO；单飞 pump；serverId 为任务归属服务器） */
  private enqueue(serverId: string, itemId: string): void {
    this.queue.push({ serverId, itemId });
    this.pump();
  }

  /** 单飞泵：空闲且队列非空时取件执行 */
  private pump(): void {
    if (this.activeItemId !== null || this.queue.length === 0) {
      return;
    }
    const task = this.queue.shift();
    if (task === undefined) {
      return;
    }
    void this.runTask(task.serverId, task.itemId);
  }

  /** 单任务执行（serverId = 任务归属服务器，不读活跃账号）：queued → downloading → completed/failed */
  private async runTask(serverId: string, itemId: string): Promise<void> {
    this.activeItemId = itemId;
    try {
      const dao = await this.dao;
      const row = await dao.getDownload(serverId, itemId);
      // 排队期间被删除/暂停/重试改态：直接收敛（不重复起任务）
      if (row === null || row.status !== 'queued') {
        return;
      }
      await dao.updateDownloadStatus(serverId, itemId, 'downloading');
      useDownloadStore.getState().updateStatus(itemId, 'downloading');
      const resumable = FileSystem.createDownloadResumable(
        await this.buildDownloadUrl(row),
        row.mediaFileUri,
        {},
        (progress) => this.handleProgress(itemId, progress),
        // 断点续传：row.resumeData 即「已下载字节偏移字符串」，原生直接拼 Range 头
        row.resumeData ?? undefined
      );
      this.activeResumable = resumable;
      const result = await resumable.downloadAsync();
      this.activeResumable = null;
      // cancel（删除）/pause 后 downloadAsync 返回 undefined：状态已由 delete/pause 收敛
      if (result === undefined) {
        return;
      }
      await this.completeDownload(serverId, row);
    } catch (err) {
      this.activeResumable = null;
      // 暂停/删除路径的中止异常不算失败；其余落 failed（保留 resumeData 供重试续传）
      const row = await this.safeGetRow(serverId, itemId);
      if (row !== null && row.status !== 'paused' && row.status !== 'completed') {
        const dao = await this.dao;
        // AppError.message 即错误码，由下载页按当前语言翻译；非 Error 归入 UNKNOWN
        const message = err instanceof Error ? err.message : 'UNKNOWN';
        console.warn('[下载] 任务失败:', sanitizedForLog(message));
        await dao.updateDownloadStatus(serverId, itemId, 'failed', { errorMessage: message });
        useDownloadStore.getState().updateStatus(itemId, 'failed', message);
      }
    } finally {
      if (this.activeItemId === itemId) {
        this.activeItemId = null;
      }
      this.pump();
    }
  }

  /** 完成收尾（06 §4.4.2）：文件校验（存在且 >0 字节）→ 海报本地化 → completed */
  private async completeDownload(serverId: string, row: DownloadRow): Promise<void> {
    const dao = await this.dao;
    const info = await FileSystem.getInfoAsync(row.mediaFileUri);
    if (!info.exists) {
      throw new AppError('UNKNOWN');
    }
    if ((info.size ?? 0) <= 0) {
      throw new AppError('UNKNOWN');
    }
    await dao.updateProgressBytes(serverId, row.itemId, info.size ?? row.progressBytes);
    try {
      const posterUri = `${row.mediaFileUri.slice(0, row.mediaFileUri.lastIndexOf('/'))}/${DOWNLOAD_POSTER_FILE_NAME}`;
      const posterResult = await FileSystem.downloadAsync(this.loadPosterUrl(row.itemId), posterUri);
      if (posterResult.status === 200) {
        await dao.updatePosterUri(serverId, row.itemId, posterResult.uri);
      }
    } catch {
      // 海报本地化失败不阻塞完成态（下载页回退占位块）
      console.warn('[下载] 海报本地化失败（忽略）');
    }
    await dao.updateDownloadStatus(serverId, row.itemId, 'completed');
    useDownloadStore.getState().updateStatus(row.itemId, 'completed');
  }

  /**
   * 下载 URL（06 文档 §4.4.2）：视频 {base}/Videos/{id}/stream，音频 {base}/Audio/{id}/stream，
   * 均 static=true + MediaSourceId + api_key。与 PlaybackSource.url 同模板——resolve 的 URL
   * 含 token 不落库，起任务（含续传/重试）时按快照行重建。Token 内存未命中回源 secure-store
   * （getToken，与 OfflineProgressService.buildAdapterFor 同款）——冷启动仅预热活跃账号，
   * 非活跃账号的排队任务重启后也能取到 Token；缺失按可读失败收敛。
   */
  private async buildDownloadUrl(row: DownloadRow): Promise<string> {
    const server = useAccountStore
      .getState()
      .servers.find((item) => item.serverId === row.serverId);
    const token = await getToken(row.serverId, row.userId);
    if (server === undefined || token === null || token === '') {
      // 账号记录/凭据缺失（登出或记录被清）：无法重建合法 URL，按可读失败收敛（重试需重登）
      throw new AppError('DOWNLOAD_CREDENTIAL_MISSING');
    }
    const url =
      `${server.baseUrl}/${row.itemType === 'Audio' ? 'Audio' : 'Videos'}/${row.itemId}/stream?static=true` +
      `&MediaSourceId=${encodeURIComponent(row.mediaSourceId)}&api_key=${encodeURIComponent(token)}`;
    console.log('[下载] 开始下载:', sanitizedForLog(url));
    return url;
  }

  /** 进度回调：仅写内存 store（节流 500ms），状态迁移才落 SQLite */
  private handleProgress(itemId: string, progress: DownloadProgressDataLike): void {
    const now = this.nowFn();
    if (now - this.lastUiProgressAt < DOWNLOAD_PROGRESS_UI_THROTTLE_MS) {
      return;
    }
    this.lastUiProgressAt = now;
    const store = useDownloadStore.getState();
    const task = store.taskMap[itemId];
    if (task === undefined) {
      return;
    }
    store.updateProgress(itemId, progress.totalBytesWritten);
    if (progress.totalBytesExpectedToWrite > 0 && task.totalBytes === undefined) {
      store.upsertTask({ ...task, totalBytes: progress.totalBytesExpectedToWrite });
    }
  }

  /** 当前内存进度（暂停落库用；store 为进度主副本） */
  private progressBytesOf(itemId: string): number {
    return useDownloadStore.getState().taskMap[itemId]?.progressBytes ?? 0;
  }

  /** 失败路径的安全读行（按任务自身服务器；行已被删时返回 null） */
  private async safeGetRow(serverId: string, itemId: string): Promise<DownloadRow | null> {
    try {
      return await this.dao.then((dao) => dao.getDownload(serverId, itemId));
    } catch {
      return null;
    }
  }
}

/** 活跃账号断言（发起/暂停/继续/重试/删除为当前服务器视图操作；UI 路由守卫应已拦截） */
function requireActiveAccount(): { serverId: string; userId: string } {
  const state = useAccountStore.getState();
  const active = state.active;
  if (active === null) {
    throw new Error('时序错误：无活跃账号时不应调用 DownloadService');
  }
  return { serverId: active.serverId, userId: active.userId };
}

/** 快照行副标题（06 文档 §4.4.1：「2024」或「剧名 · S1E2 集名」） */
function buildRowSubtitle(detail: MediaDetail, item: DownloadableItem): string | undefined {
  if (detail.type === 'Episode') {
    const seriesName = item.seriesName ?? '';
    const season = item.seasonNumber ?? 0;
    const episode = item.indexNumber ?? 0;
    return `${seriesName} · S${season}E${episode} ${detail.name}`;
  }
  return detail.productionYear !== undefined ? String(detail.productionYear) : undefined;
}

/** 快照行 → UI 形态（downloadStore.upsertTask 消费） */
function rowToUi(row: DownloadRow): DownloadTaskUi {
  const task: DownloadTaskUi = {
    itemId: row.itemId,
    title: row.title,
    status: row.status,
    progressBytes: row.progressBytes,
    totalBytes: row.sizeBytes ?? undefined,
    mediaFileUri: row.mediaFileUri,
    userPositionMs: row.userPositionMs,
    userPlayed: row.userPlayed,
  };
  if (row.subtitle !== null && row.subtitle !== undefined) task.subtitle = row.subtitle;
  if (row.posterFileUri !== null && row.posterFileUri !== undefined) {
    task.posterFileUri = row.posterFileUri;
  }
  if (row.errorMessage !== null && row.errorMessage !== undefined) {
    task.errorMessage = row.errorMessage;
  }
  return task;
}

/** 全局单例（下载页/详情页/设置页共用） */
export const downloadService = new DownloadService();
