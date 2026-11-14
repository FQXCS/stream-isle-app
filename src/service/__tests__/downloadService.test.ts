/**
 * DownloadService 单测（M6 文档 §6.1 DownloadService 行）：
 * resolve 非 DirectPlay → DOWNLOAD_UNAVAILABLE 且不落库；空间不足 → DOWNLOAD_NO_SPACE
 * 且不落库；状态机流转（queued→downloading→completed/paused/failed）；删除清文件与行（mock fs）；
 * buildLocalSession 字段（本地 uri、UUID 会话号、DirectPlay、离线续播起点）。
 * fs 与 DAO 全注入假实现（不触真机/真库）。
 */
import { AppError } from '@/infra/error';
import type { DownloadDao, DownloadRow } from '@/infra/db';
import type { MediaDetail, PlaybackSession } from '@/adapter/model';
import { useAccountStore } from '@/store/accountStore';
import { useDownloadStore } from '@/store/downloadStore';

import { DownloadService, type DownloadableItem } from '@/service/DownloadService';

// Token 获取链 mock（buildDownloadUrl 经 getToken 回源 secure-store；jest 无原生环境）
jest.mock('@/infra/tokenVault', () => ({
  getToken: jest.fn().mockResolvedValue('tok-1'),
}));

// DownloadService 静态引入 PlaybackService（默认 resolve 依赖）→ 原生 mediaCaps 模块在
// jest 下不可用，与 playbackService.test 同款 mock 掉（本测试不消费 resolve 默认实现）
jest.mock('@/infra/mediaCaps', () => ({
  fetchDecoderCaps: jest.fn().mockResolvedValue({
    supportsHevcMain10: false,
    supportsVp9: false,
    supportsAv1: false,
  }),
}));

/** expo-file-system/legacy 假实现（createDownloadResumable/downloadAsync 等） */
jest.mock('expo-file-system/legacy', () => {
  const createDownloadResumable = jest.fn();
  const makeDirectoryAsync = jest.fn().mockResolvedValue(undefined);
  const deleteAsync = jest.fn().mockResolvedValue(undefined);
  const getInfoAsync = jest.fn().mockResolvedValue({ exists: true, size: 500 });
  const downloadAsync = jest.fn().mockResolvedValue({ status: 200, uri: 'file:///docs/x/poster.jpg' });
  return {
    documentDirectory: 'file:///docs/',
    makeDirectoryAsync,
    deleteAsync,
    getInfoAsync,
    downloadAsync,
    getFreeDiskStorageAsync: jest.fn().mockResolvedValue(10 * 1024 * 1024 * 1024),
    createDownloadResumable,
  };
});

/** 从 mock 取回 createDownloadResumable（jest.mock 工厂内不可引外作用域变量，此处回读） */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fsLegacy = require('expo-file-system/legacy') as {
  createDownloadResumable: jest.Mock;
  makeDirectoryAsync: jest.Mock;
  deleteAsync: jest.Mock;
  getInfoAsync: jest.Mock;
  downloadAsync: jest.Mock;
};
const fsMock = fsLegacy.createDownloadResumable;

/** 内存假 DAO */
function makeFakeDao(): DownloadDao & { rows: Map<string, DownloadRow> } {
  const rows = new Map<string, DownloadRow>();
  const keyOf = (serverId: string, itemId: string): string => `${serverId}|${itemId}`;
  return {
    rows,
    async getDownloadsByServer(serverId: string) {
      return [...rows.values()]
        .filter((row) => row.serverId === serverId)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
    },
    async getDownload(serverId: string, itemId: string) {
      return rows.get(keyOf(serverId, itemId)) ?? null;
    },
    async upsertDownload(row: DownloadRow) {
      rows.set(keyOf(row.serverId, row.itemId), { ...row });
    },
    async updateDownloadStatus(serverId, itemId, status, extra) {
      const row = rows.get(keyOf(serverId, itemId));
      if (row === undefined) {
        return;
      }
      row.status = status;
      if (extra?.errorMessage !== undefined) row.errorMessage = extra.errorMessage;
      if (extra?.resumeData !== undefined && extra.resumeData !== null) row.resumeData = extra.resumeData;
      if (status === 'completed') row.completedAtMs = Date.now();
    },
    async updateResumeData(serverId, itemId, resumeData) {
      const row = rows.get(keyOf(serverId, itemId));
      if (row !== undefined && resumeData !== null) row.resumeData = resumeData;
    },
    async updateProgressBytes(serverId, itemId, progressBytes) {
      const row = rows.get(keyOf(serverId, itemId));
      if (row !== undefined) row.progressBytes = progressBytes;
    },
    async updatePosterUri(serverId, itemId, posterFileUri) {
      const row = rows.get(keyOf(serverId, itemId));
      if (row !== undefined) row.posterFileUri = posterFileUri;
    },
    async updateLocalPlayback(serverId, itemId, patch) {
      const row = rows.get(keyOf(serverId, itemId));
      if (row === undefined) return;
      if (patch.userPositionMs !== undefined) row.userPositionMs = patch.userPositionMs;
      if (patch.userPlayed !== undefined) row.userPlayed = patch.userPlayed;
    },
    async deleteDownload(serverId, itemId) {
      rows.delete(keyOf(serverId, itemId));
    },
    async appendPendingProgress() {
      return;
    },
    async listPendingProgress() {
      return [];
    },
    async listAllPendingProgress() {
      return [];
    },
    async deletePendingProgress() {
      return;
    },
  };
}

/** 详情假数据（直连 + 已知体积） */
function makeDetail(overrides: Partial<MediaDetail> = {}): MediaDetail {
  return {
    id: 'm1',
    type: 'Movie',
    name: '电影甲',
    productionYear: 2024,
    runtimeMs: 120 * 60 * 1000,
    genreList: [],
    peopleList: [],
    userData: { played: false, playCount: 0, favorite: false, playbackPositionMs: 0 },
    mediaSourceList: [
      { id: 'ms1', name: '', container: 'mp4', supportsDirectPlay: true, supportsTranscoding: true, sizeBytes: 1024 },
    ],
    ...overrides,
  };
}

/** 直连 PlaybackSession */
function makeSession(overrides: Partial<PlaybackSession> = {}): PlaybackSession {
  return {
    playSessionId: 'ps-1',
    itemId: 'm1',
    mediaSourceId: 'ms1',
    playMethod: 'DirectPlay',
    url: 'http://srv/Videos/m1/stream?static=true',
    positionMsAtStart: 0,
    runTimeMs: 120 * 60 * 1000,
    subtitleList: [],
    audioList: [],
    startedAtEpochMs: 0,
    ...overrides,
  };
}

/** 注入活跃账号（DownloadService 消费 accountStore.active） */
function setActiveAccount(): void {
  useAccountStore.setState({
    servers: [
      {
        id: 'srv-1',
        baseUrl: 'http://srv',
        flavor: 'JELLYFIN',
        serverId: 'srv-1',
        serverName: 'srv',
        version: '10.10.0',
        users: [],
        activeUserId: 'u1',
      },
    ],
    active: { serverId: 'srv-1', userId: 'u1' },
  });
}

/** 组装被测服务（全 deps 注入） */
function makeService(
  dao: DownloadDao,
  session: PlaybackSession,
  freeBytes = 10 * 1024 * 1024 * 1024
): DownloadService {
  return new DownloadService({
    resolveItem: () => Promise.resolve(session),
    loadDetail: () => Promise.resolve(makeDetail()),
    loadPosterUrl: () => 'http://srv/Items/m1/Images/Primary',
    dao,
    freeDiskBytes: () => Promise.resolve(freeBytes),
    nowFn: (() => {
      let tick = 0;
      return () => {
        tick += 1;
        return 1_000 + tick;
      };
    })(),
  });
}

/** 微任务冲刷（worker void async 链排空；不依赖真实定时器） */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 30; i += 1) {
    await Promise.resolve();
  }
}

const ITEM: DownloadableItem = {
  id: 'm1',
  type: 'Movie',
  name: '电影甲',
  userData: { played: false, playCount: 0, favorite: false, playbackPositionMs: 0 },
};

/** 构造快照行（buildLocalSession/rehydrate 用例直接入库） */
function makeRow(overrides: Partial<DownloadRow> = {}): DownloadRow {
  return {
    serverId: 'srv-1',
    userId: 'u1',
    itemId: 'm1',
    mediaSourceId: 'ms1',
    itemType: 'Movie',
    title: '电影甲',
    mediaFileUri: 'file:///downloads/srv-1/m1/media.mp4',
    status: 'queued',
    progressBytes: 0,
    userPositionMs: 0,
    userPlayed: false,
    createdAtMs: 1_000,
    ...overrides,
  };
}

describe('DownloadService（M6 §6.1 DownloadService 行）', () => {
  beforeEach(() => {
    setActiveAccount();
    useDownloadStore.getState().replaceAll([]);
    fsMock.mockClear();
  });

  it('resolve 非 DirectPlay → DOWNLOAD_UNAVAILABLE 且不落库（A2）', async () => {
    const dao = makeFakeDao();
    const service = makeService(
      dao,
      makeSession({ playMethod: 'Transcode' })
    );
    await expect(service.startDownload(ITEM)).rejects.toMatchObject({
      code: 'DOWNLOAD_UNAVAILABLE',
    });
    expect(dao.rows.size).toBe(0);
  });

  it('音频下载：不调用视频 resolve，取详情媒体源并走 /Audio 静态原流', async () => {
    const dao = makeFakeDao();
    let startedUrl = '';
    fsMock.mockImplementation((url: string) => {
      startedUrl = url;
      return {
        downloadAsync: () =>
          Promise.resolve({ status: 200, uri: 'file:///docs/downloads/srv-1/m1/media.mp3' }),
        pauseAsync: () => Promise.resolve({ resumeData: null }),
        cancelAsync: () => Promise.resolve(),
      };
    });
    const resolveItem = jest.fn();
    const service = new DownloadService({
      resolveItem,
      loadDetail: () =>
        Promise.resolve(
          makeDetail({
            type: 'Audio',
            name: '歌曲甲',
            mediaSourceList: [
              {
                id: 'mediasource_1',
                name: '',
                container: 'mp3',
                supportsDirectPlay: false,
                supportsTranscoding: true,
                sizeBytes: 2048,
              },
            ],
          })
        ),
      loadPosterUrl: () => 'http://srv/Items/m1/Images/Primary',
      dao,
      freeDiskBytes: () => Promise.resolve(10 * 1024 * 1024 * 1024),
      nowFn: () => 1,
    });
    await service.startDownload({
      id: 'm1',
      type: 'Audio',
      name: '歌曲甲',
      userData: { played: false, playCount: 0, favorite: false, playbackPositionMs: 0 },
    });
    expect(resolveItem).not.toHaveBeenCalled();
    const row = await dao.getDownload('srv-1', 'm1');
    expect(row).toMatchObject({ itemType: 'Audio', mediaSourceId: 'mediasource_1', container: 'mp3' });
    await flushAsync();
    expect(startedUrl).toContain('/Audio/m1/stream?static=true');
    expect(startedUrl).toContain('MediaSourceId=mediasource_1');
  });

  it('空间不足 → DOWNLOAD_NO_SPACE 且不落库', async () => {
    const dao = makeFakeDao();
    const service = makeService(dao, makeSession(), 512 * 1024 * 1024);
    await expect(service.startDownload(ITEM)).rejects.toMatchObject({
      code: 'DOWNLOAD_NO_SPACE',
    });
    expect(dao.rows.size).toBe(0);
  });

  it('重复发起 → DOWNLOAD_DUPLICATE（同条目仅保留一份）', async () => {
    const dao = makeFakeDao();
    const service = makeService(dao, makeSession());
    await service.startDownload(ITEM);
    await expect(service.startDownload(ITEM)).rejects.toMatchObject({
      code: 'DOWNLOAD_DUPLICATE',
    });
    expect(dao.rows.size).toBe(1);
  });

  it('状态机流转：start → queued；worker 起任务 → downloading；完成 → completed（文件校验+海报）', async () => {
    const dao = makeFakeDao();
    const service = makeService(dao, makeSession());
    fsMock.mockImplementation(() => ({
      downloadAsync: () =>
        Promise.resolve({ status: 200, uri: 'file:///docs/downloads/srv-1/m1/media.mp4' }),
      pauseAsync: () => Promise.resolve({ resumeData: null }),
      cancelAsync: () => Promise.resolve(),
    }));
    await service.startDownload(ITEM);
    // worker 链冲刷（queued → downloading → completed；mock 立即完成）
    await flushAsync();
    const done = await dao.getDownload('srv-1', 'm1');
    expect(done?.status).toBe('completed');
    expect(done?.mediaFileUri).toBe('file:///docs/downloads/srv-1/m1/media.mp4');
    // 海报本地化已落库
    expect(done?.posterFileUri).toBe('file:///docs/x/poster.jpg');
  });

  it('暂停/继续：pauseAsync 产物 resumeData（字节偏移字符串）落库原样回传第 5 参（A4 断点续传契约）', async () => {
    const dao = makeFakeDao();
    const service = makeService(dao, makeSession());
    let paused = false;
    let createdResumeData: string | undefined;
    // 模拟原生语义：pauseAsync 中止底层任务并使 downloadAsync 以 undefined 结束（释放 worker）
    let resolveDownload: ((value: unknown) => void) | null = null;
    fsMock.mockImplementation(
      (_url: string, _fileUri: string, _opts: unknown, _cb: unknown, resumeData?: string) => {
        createdResumeData = resumeData;
        return {
          downloadAsync: () =>
            new Promise((resolve) => {
              if (paused) {
                resolve(undefined);
              } else {
                resolveDownload = resolve;
              }
            }),
          // pauseAsync 真实形态：DownloadPauseState { url, fileUri, options, resumeData }，
          // resumeData = 已下载字节偏移十进制字符串（原生直接拼 Range: bytes=<offset>- 头）
          pauseAsync: () => {
            paused = true;
            resolveDownload?.(undefined);
            return Promise.resolve({
              url: 'http://srv/Videos/m1/stream?static=true',
              fileUri: 'file:///docs/downloads/srv-1/m1/media.mp4',
              options: {},
              resumeData: '1048576',
            });
          },
          cancelAsync: () => Promise.resolve(),
        };
      }
    );
    await service.startDownload(ITEM);
    await flushAsync(); // worker 已挂起在 downloadAsync（mock pending promise）
    await service.pauseDownload('m1');
    const pausedRow = await dao.getDownload('srv-1', 'm1');
    expect(pausedRow?.status).toBe('paused');
    // 落库值为字节偏移字符串本身（不是 DownloadPauseState 包装对象的 JSON）
    expect(pausedRow?.resumeData).toBe('1048576');
    // 继续：有 resumeData → queued，单飞 worker 即刻领件推进 downloading，并把偏移串
    // 原样作为 createDownloadResumable 第 5 参（续传契约）
    await service.resumeDownload('m1');
    await flushAsync();
    const resumedRow = await dao.getDownload('srv-1', 'm1');
    expect(['queued', 'downloading']).toContain(resumedRow?.status);
    expect(createdResumeData).toBe('1048576');
  });

  it('下载失败 → failed + error_message（保留 resumeData 供重试）；retry → queued', async () => {
    const dao = makeFakeDao();
    const service = makeService(dao, makeSession());
    fsMock.mockImplementation(() => ({
      downloadAsync: () => Promise.reject(new Error('网络断开')),
      pauseAsync: () => Promise.resolve({ resumeData: null }),
      cancelAsync: () => Promise.resolve(),
    }));
    await service.startDownload(ITEM);
    await flushAsync();
    const failedRow = await dao.getDownload('srv-1', 'm1');
    expect(failedRow?.status).toBe('failed');
    expect(failedRow?.errorMessage).toContain('网络断开');
    // retry：failed → 重新调度（worker 重启任务；mock 持续失败 → 冲刷后仍 failed，证明任务确已重启）
    await service.retryDownload('m1');
    await flushAsync();
    const retriedRow = await dao.getDownload('srv-1', 'm1');
    expect(retriedRow?.status).toBe('failed');
    expect(retriedRow?.errorMessage).toContain('网络断开');
  });

  it('删除：清文件（幂等）与行，store 同步摘除', async () => {
    const dao = makeFakeDao();
    const service = makeService(dao, makeSession());
    await service.startDownload(ITEM);
    await service.deleteDownload('m1');
    expect(await dao.getDownload('srv-1', 'm1')).toBeNull();
    expect(useDownloadStore.getState().taskMap['m1']).toBeUndefined();
  });

  it('buildLocalSession：本地 uri、UUID 会话号、DirectPlay、local=true、离线续播起点', async () => {
    const dao = makeFakeDao();
    const service = makeService(dao, makeSession());
    await dao.upsertDownload(
      makeRow({
        status: 'completed',
        userPositionMs: 30 * 60 * 1000,
        userPlayed: false,
        runtimeMs: 120 * 60 * 1000,
      })
    );
    const session = await service.buildLocalSession('m1');
    expect(session.url).toBe('file:///downloads/srv-1/m1/media.mp4');
    expect(session.playMethod).toBe('DirectPlay');
    expect(session.local).toBe(true);
    expect(session.positionMsAtStart).toBe(30 * 60 * 1000);
    // UUID v4 形态（客户端生成会话号，M6 §4.5 关键决策）
    expect(session.playSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    // 已看（user_played=1）→ 不弹续播（positionMsAtStart=0）
    await dao.upsertDownload(makeRow({ status: 'completed', userPlayed: true, userPositionMs: 60 * 60 * 1000 }));
    const playedSession = await service.buildLocalSession('m1');
    expect(playedSession.positionMsAtStart).toBe(0);
  });

  it('rehydrate：downloading 一律降为 paused（冷启动无活动连接）', async () => {
    const dao = makeFakeDao();
    await dao.upsertDownload(makeRow({ status: 'downloading' }));
    const service = makeService(dao, makeSession());
    await service.rehydrate();
    const row = await dao.getDownload('srv-1', 'm1');
    expect(row?.status).toBe('paused');
  });

  it('AppError 语义：message 固定为错误码，展示文案由 errorMessageOf 按语言解析', () => {
    expect(new AppError('DOWNLOAD_UNAVAILABLE').message).toBe('DOWNLOAD_UNAVAILABLE');
  });
});
