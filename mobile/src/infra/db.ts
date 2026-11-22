/**
 * 本地 SQLite（M6 文档 §4.4.1；设计文档 §9「P1 引入 SQLite」）：
 * 数据库名 stream-isle.db，两张表——downloads（下载快照，含本地断点/已看标记）与
 * pending_progress（离线进度队列表）。全库单连接（openDatabaseAsync），写操作以
 * withTransactionAsync 包裹。
 * DAO 以结构化接口 DbClient 暴露（工厂 createDownloadDao 可注入），单测以内存假实现
 * 验证建表幂等 / upsert 主键冲突覆盖 / pending_progress 有序读取与按 id 删除（M6 §6.1），
 * 生产环境传入真实 SQLiteDatabase（方法签名同构）。
 */
import * as SQLite from 'expo-sqlite';

/** 数据库名（M6 文档 §4.4.1） */
export const DATABASE_NAME = 'stream-isle.db';

/** DAO 运行所需的最小数据库能力（SQLiteDatabase 同构子集，测试可注入假实现） */
export interface DbClient {
  runAsync(source: string, ...params: unknown[]): Promise<{ changes: number; lastInsertRowId: number | bigint }>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/** 下载状态（M6 文档 §4.4.1 downloads.status 词表） */
export type DownloadStatusEnum = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed';

/** 下载快照行（与 DDL 列一一对应；camelCase ↔ snake_case 映射收敛本文件） */
export interface DownloadRow {
  serverId: string;
  userId: string;
  itemId: string;
  mediaSourceId: string;
  itemType: string;
  seriesId?: string;
  seriesName?: string;
  seasonId?: string;
  parentIndexNumber?: number;
  indexNumber?: number;
  title: string;
  subtitle?: string;
  overview?: string;
  productionYear?: number;
  officialRating?: string;
  communityRating?: number;
  runtimeMs?: number;
  container?: string;
  sizeBytes?: number;
  posterFileUri?: string;
  mediaFileUri: string;
  status: DownloadStatusEnum;
  progressBytes: number;
  /** pauseAsync 产物的 resumeData（「已下载字节偏移十进制字符串」；原生续传直接拼 Range 头，返工勘误：非 JSON 包装对象） */
  resumeData?: string;
  /** 本地断点（离线播放节流窗口与 finish 写入；下载页展示/离线续播判定消费） */
  userPositionMs: number;
  /** 本地已看标记（finish 兜底/自然播完写入；离线续播判定 played → 不弹续播） */
  userPlayed: boolean;
  createdAtMs: number;
  completedAtMs?: number;
  errorMessage?: string;
}

/** 离线进度队列表行（M6 文档 §4.4.1 pending_progress） */
export interface PendingProgressRow {
  id: number;
  serverId: string;
  userId: string;
  itemId: string;
  playSessionId: string;
  mediaSourceId: string;
  /** "Playing" | "Progress" | "Stopped" | "MarkPlayed" */
  eventType: string;
  positionMs: number;
  isPaused?: boolean;
  createdAtMs: number;
}

/** 建表 DDL（IF NOT EXISTS 幂等；每次打开连接执行一次，M6 文档 §4.4.1 原文） */
export const DDL_SQL = `
CREATE TABLE IF NOT EXISTS downloads (
  server_id          TEXT    NOT NULL,
  user_id            TEXT    NOT NULL,
  item_id            TEXT    NOT NULL,
  media_source_id    TEXT    NOT NULL,
  item_type          TEXT    NOT NULL,
  series_id          TEXT, series_name TEXT, season_id TEXT,
  parent_index_number INTEGER, index_number INTEGER,
  title              TEXT    NOT NULL,
  subtitle           TEXT,
  overview           TEXT,
  production_year    INTEGER,
  official_rating    TEXT,
  community_rating   REAL,
  runtime_ms         INTEGER,
  container          TEXT,
  size_bytes         INTEGER,
  poster_file_uri    TEXT,
  media_file_uri     TEXT    NOT NULL,
  status             TEXT    NOT NULL,
  progress_bytes     INTEGER NOT NULL DEFAULT 0,
  resume_data        TEXT,
  user_position_ms   INTEGER NOT NULL DEFAULT 0,
  user_played        INTEGER NOT NULL DEFAULT 0,
  created_at_ms      INTEGER NOT NULL,
  completed_at_ms    INTEGER,
  error_message      TEXT,
  PRIMARY KEY (server_id, item_id, media_source_id)
);

CREATE TABLE IF NOT EXISTS pending_progress (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id        TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  item_id          TEXT NOT NULL,
  play_session_id  TEXT NOT NULL,
  media_source_id  TEXT NOT NULL,
  event_type       TEXT NOT NULL,
  position_ms      INTEGER NOT NULL,
  is_paused        INTEGER,
  created_at_ms    INTEGER NOT NULL
);
`;

/** downloads 行 snake_case → camelCase 映射（getAllAsync 原始形态 → DownloadRow） */
interface DownloadRowRaw {
  server_id: string;
  user_id: string;
  item_id: string;
  media_source_id: string;
  item_type: string;
  series_id: string | null;
  series_name: string | null;
  season_id: string | null;
  parent_index_number: number | null;
  index_number: number | null;
  title: string;
  subtitle: string | null;
  overview: string | null;
  production_year: number | null;
  official_rating: string | null;
  community_rating: number | null;
  runtime_ms: number | null;
  container: string | null;
  size_bytes: number | null;
  poster_file_uri: string | null;
  media_file_uri: string;
  status: string;
  progress_bytes: number;
  resume_data: string | null;
  user_position_ms: number;
  user_played: number;
  created_at_ms: number;
  completed_at_ms: number | null;
  error_message: string | null;
}

function rowFromRaw(raw: DownloadRowRaw): DownloadRow {
  const row: DownloadRow = {
    serverId: raw.server_id,
    userId: raw.user_id,
    itemId: raw.item_id,
    mediaSourceId: raw.media_source_id,
    itemType: raw.item_type,
    title: raw.title,
    mediaFileUri: raw.media_file_uri,
    status: raw.status as DownloadStatusEnum,
    progressBytes: raw.progress_bytes,
    userPositionMs: raw.user_position_ms,
    userPlayed: raw.user_played === 1,
    createdAtMs: raw.created_at_ms,
  };
  if (raw.series_id !== null) row.seriesId = raw.series_id;
  if (raw.series_name !== null) row.seriesName = raw.series_name;
  if (raw.season_id !== null) row.seasonId = raw.season_id;
  if (raw.parent_index_number !== null) row.parentIndexNumber = raw.parent_index_number;
  if (raw.index_number !== null) row.indexNumber = raw.index_number;
  if (raw.subtitle !== null) row.subtitle = raw.subtitle;
  if (raw.overview !== null) row.overview = raw.overview;
  if (raw.production_year !== null) row.productionYear = raw.production_year;
  if (raw.official_rating !== null) row.officialRating = raw.official_rating;
  if (raw.community_rating !== null) row.communityRating = raw.community_rating;
  if (raw.runtime_ms !== null) row.runtimeMs = raw.runtime_ms;
  if (raw.container !== null) row.container = raw.container;
  if (raw.size_bytes !== null) row.sizeBytes = raw.size_bytes;
  if (raw.poster_file_uri !== null) row.posterFileUri = raw.poster_file_uri;
  if (raw.resume_data !== null) row.resumeData = raw.resume_data;
  if (raw.completed_at_ms !== null) row.completedAtMs = raw.completed_at_ms;
  if (raw.error_message !== null) row.errorMessage = raw.error_message;
  return row;
}

/** pending_progress 行映射 */
interface PendingRowRaw {
  id: number;
  server_id: string;
  user_id: string;
  item_id: string;
  play_session_id: string;
  media_source_id: string;
  event_type: string;
  position_ms: number;
  is_paused: number | null;
  created_at_ms: number;
}

function pendingFromRaw(raw: PendingRowRaw): PendingProgressRow {
  const row: PendingProgressRow = {
    id: raw.id,
    serverId: raw.server_id,
    userId: raw.user_id,
    itemId: raw.item_id,
    playSessionId: raw.play_session_id,
    mediaSourceId: raw.media_source_id,
    eventType: raw.event_type,
    positionMs: raw.position_ms,
    createdAtMs: raw.created_at_ms,
  };
  if (raw.is_paused !== null) row.isPaused = raw.is_paused === 1;
  return row;
}

/** 下载快照 DAO（结构化工厂：生产传真实 SQLiteDatabase，单测传内存假实现） */
export interface DownloadDao {
  /** 某服务器全部下载行（下载页/rehydrate 整体刷新；创建时间倒序展示） */
  getDownloadsByServer(serverId: string): Promise<DownloadRow[]>;
  /** 单行定位（查重/本地会话构造/快照同步） */
  getDownload(serverId: string, itemId: string): Promise<DownloadRow | null>;
  /** upsert：主键冲突即全列覆盖（M6 §6.1「upsert 主键冲突覆盖」） */
  upsertDownload(row: DownloadRow): Promise<void>;
  /** 状态迁移（唯一高频写之外的状态写入点；errorMessage/完成时间随状态携带） */
  updateDownloadStatus(
    serverId: string,
    itemId: string,
    status: DownloadStatusEnum,
    extra?: { errorMessage?: string; resumeData?: string | null }
  ): Promise<void>;
  /** 断点数据落库（pauseAsync 产物） */
  updateResumeData(serverId: string, itemId: string, resumeData: string | null): Promise<void>;
  /** 进度字节数落库（暂停/完成等低频时点） */
  updateProgressBytes(serverId: string, itemId: string, progressBytes: number): Promise<void>;
  /** 海报本地化路径落库 */
  updatePosterUri(serverId: string, itemId: string, posterFileUri: string): Promise<void>;
  /** 本地播放断点/已看标记（离线播放节流窗口与 finish 写入，M6 §4.5） */
  updateLocalPlayback(
    serverId: string,
    itemId: string,
    patch: { userPositionMs?: number; userPlayed?: boolean }
  ): Promise<void>;
  /** 删除行（按 serverId+itemId 定位；仅删行不删文件） */
  deleteDownload(serverId: string, itemId: string): Promise<void>;
  /** 离线进度入队 */
  appendPendingProgress(event: Omit<PendingProgressRow, 'id'>): Promise<void>;
  /** 某账号的待补报事件（created_at_ms 升序） */
  listPendingProgress(serverId: string, userId: string): Promise<PendingProgressRow[]>;
  /** 全部待补报事件（flush 跨账号分组消费） */
  listAllPendingProgress(): Promise<PendingProgressRow[]>;
  /** 按主键删除已补报事件（M6 §6.1「按 id 删除」） */
  deletePendingProgress(ids: number[]): Promise<void>;
}

/** DAO 工厂（M6 文档 §4.4.1 导出形态的类型化实现） */
export function createDownloadDao(db: DbClient): DownloadDao {
  async function getDownload(serverId: string, itemId: string): Promise<DownloadRow | null> {
    const rawList = await db.getAllAsync<DownloadRowRaw>(
      'SELECT * FROM downloads WHERE server_id = ? AND item_id = ? LIMIT 1',
      serverId,
      itemId
    );
    const raw = rawList[0];
    return raw === undefined ? null : rowFromRaw(raw);
  }

  return {
    async getDownloadsByServer(serverId: string): Promise<DownloadRow[]> {
      const rawList = await db.getAllAsync<DownloadRowRaw>(
        'SELECT * FROM downloads WHERE server_id = ? ORDER BY created_at_ms DESC',
        serverId
      );
      return rawList.map(rowFromRaw);
    },

    getDownload,

    async upsertDownload(row: DownloadRow): Promise<void> {
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO downloads (
            server_id, user_id, item_id, media_source_id, item_type,
            series_id, series_name, season_id, parent_index_number, index_number,
            title, subtitle, overview, production_year, official_rating, community_rating,
            runtime_ms, container, size_bytes, poster_file_uri, media_file_uri,
            status, progress_bytes, resume_data, user_position_ms, user_played,
            created_at_ms, completed_at_ms, error_message
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (server_id, item_id, media_source_id) DO UPDATE SET
            user_id = excluded.user_id,
            item_type = excluded.item_type,
            series_id = excluded.series_id,
            series_name = excluded.series_name,
            season_id = excluded.season_id,
            parent_index_number = excluded.parent_index_number,
            index_number = excluded.index_number,
            title = excluded.title,
            subtitle = excluded.subtitle,
            overview = excluded.overview,
            production_year = excluded.production_year,
            official_rating = excluded.official_rating,
            community_rating = excluded.community_rating,
            runtime_ms = excluded.runtime_ms,
            container = excluded.container,
            size_bytes = excluded.size_bytes,
            poster_file_uri = excluded.poster_file_uri,
            media_file_uri = excluded.media_file_uri,
            status = excluded.status,
            progress_bytes = excluded.progress_bytes,
            resume_data = excluded.resume_data,
            user_position_ms = excluded.user_position_ms,
            user_played = excluded.user_played,
            created_at_ms = excluded.created_at_ms,
            completed_at_ms = excluded.completed_at_ms,
            error_message = excluded.error_message`,
          row.serverId,
          row.userId,
          row.itemId,
          row.mediaSourceId,
          row.itemType,
          row.seriesId ?? null,
          row.seriesName ?? null,
          row.seasonId ?? null,
          row.parentIndexNumber ?? null,
          row.indexNumber ?? null,
          row.title,
          row.subtitle ?? null,
          row.overview ?? null,
          row.productionYear ?? null,
          row.officialRating ?? null,
          row.communityRating ?? null,
          row.runtimeMs ?? null,
          row.container ?? null,
          row.sizeBytes ?? null,
          row.posterFileUri ?? null,
          row.mediaFileUri,
          row.status,
          row.progressBytes,
          row.resumeData ?? null,
          row.userPositionMs,
          row.userPlayed ? 1 : 0,
          row.createdAtMs,
          row.completedAtMs ?? null,
          row.errorMessage ?? null
        );
      });
    },

    async updateDownloadStatus(serverId, itemId, status, extra): Promise<void> {
      const errorMessage = extra?.errorMessage ?? null;
      const resumeData = extra?.resumeData !== undefined ? extra.resumeData : null;
      const completedAtMs = status === 'completed' ? Date.now() : null;
      await db.runAsync(
        'UPDATE downloads SET status = ?, error_message = ?, resume_data = COALESCE(?, resume_data), completed_at_ms = COALESCE(?, completed_at_ms) WHERE server_id = ? AND item_id = ?',
        status,
        errorMessage,
        resumeData,
        completedAtMs,
        serverId,
        itemId
      );
    },

    async updateResumeData(serverId, itemId, resumeData): Promise<void> {
      await db.runAsync(
        'UPDATE downloads SET resume_data = ? WHERE server_id = ? AND item_id = ?',
        resumeData,
        serverId,
        itemId
      );
    },

    async updateProgressBytes(serverId, itemId, progressBytes): Promise<void> {
      await db.runAsync(
        'UPDATE downloads SET progress_bytes = ? WHERE server_id = ? AND item_id = ?',
        progressBytes,
        serverId,
        itemId
      );
    },

    async updatePosterUri(serverId, itemId, posterFileUri): Promise<void> {
      await db.runAsync(
        'UPDATE downloads SET poster_file_uri = ? WHERE server_id = ? AND item_id = ?',
        posterFileUri,
        serverId,
        itemId
      );
    },

    async updateLocalPlayback(serverId, itemId, patch): Promise<void> {
      // 行不存在（非下载条目播放）时 UPDATE 零命中即无副作用
      if (patch.userPositionMs !== undefined) {
        await db.runAsync(
          'UPDATE downloads SET user_position_ms = ? WHERE server_id = ? AND item_id = ?',
          patch.userPositionMs,
          serverId,
          itemId
        );
      }
      if (patch.userPlayed !== undefined) {
        await db.runAsync(
          'UPDATE downloads SET user_played = ? WHERE server_id = ? AND item_id = ?',
          patch.userPlayed ? 1 : 0,
          serverId,
          itemId
        );
      }
    },

    async deleteDownload(serverId, itemId): Promise<void> {
      await db.runAsync(
        'DELETE FROM downloads WHERE server_id = ? AND item_id = ?',
        serverId,
        itemId
      );
    },

    async appendPendingProgress(event): Promise<void> {
      await db.runAsync(
        'INSERT INTO pending_progress (server_id, user_id, item_id, play_session_id, media_source_id, event_type, position_ms, is_paused, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        event.serverId,
        event.userId,
        event.itemId,
        event.playSessionId,
        event.mediaSourceId,
        event.eventType,
        event.positionMs,
        event.isPaused === undefined ? null : event.isPaused ? 1 : 0,
        event.createdAtMs
      );
    },

    async listPendingProgress(serverId, userId): Promise<PendingProgressRow[]> {
      const rawList = await db.getAllAsync<PendingRowRaw>(
        'SELECT * FROM pending_progress WHERE server_id = ? AND user_id = ? ORDER BY created_at_ms ASC, id ASC',
        serverId,
        userId
      );
      return rawList.map(pendingFromRaw);
    },

    async listAllPendingProgress(): Promise<PendingProgressRow[]> {
      const rawList = await db.getAllAsync<PendingRowRaw>(
        'SELECT * FROM pending_progress ORDER BY created_at_ms ASC, id ASC'
      );
      return rawList.map(pendingFromRaw);
    },

    async deletePendingProgress(ids: number[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      await db.withTransactionAsync(async () => {
        for (const id of ids) {
          await db.runAsync('DELETE FROM pending_progress WHERE id = ?', id);
        }
      });
    },
  };
}

/** 全库单连接（懒初始化；打开即执行 DDL，幂等建表） */
let daoPromise: Promise<DownloadDao> | null = null;

async function openDatabase(): Promise<DbClient> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync(DDL_SQL);
  return db;
}

/** 生产环境 DAO 获取入口（首次调用打开连接，之后复用） */
export async function getDownloadDao(): Promise<DownloadDao> {
  if (daoPromise === null) {
    daoPromise = openDatabase().then((db) => createDownloadDao(db));
  }
  return daoPromise;
}
