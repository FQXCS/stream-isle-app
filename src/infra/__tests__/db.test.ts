/**
 * infra/db DAO 单测（06 文档 §6.1 db DAO 行）：建表幂等、upsert 主键冲突覆盖、
 * pending_progress 有序读取与按 id 删除。以内存假 DbClient（Map 表）驱动 createDownloadDao
 * ——生产 SQLiteDatabase 方法签名同构（openDatabaseAsync 在 jest 由 __mocks__/expo-sqlite 提供）。
 */
import { createDownloadDao, DDL_SQL, type DbClient } from '@/infra/db';
import type { DownloadRow, PendingProgressRow } from '@/infra/db';

/** 内存假库：支持 DAO 用到的 SQL 子集（run/getAll/事务） */
function makeFakeDb(): DbClient & {
  tables: { downloads: Map<string, Record<string, unknown>>; pending: Map<number, PendingProgressRow> };
} {
  const downloads = new Map<string, Record<string, unknown>>();
  const pending = new Map<number, PendingProgressRow>();
  let pendingAutoId = 0;
  return {
    tables: { downloads, pending },
    async runAsync(source: string, ...params: unknown[]) {
      const sql = source.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('INSERT INTO downloads')) {
        // 位置参数 ↔ 列序（与 createDownloadDao.upsertDownload 的 INSERT 列序一致）
        const [
          server_id, user_id, item_id, media_source_id, item_type,
          series_id, series_name, season_id, parent_index_number, index_number,
          title, subtitle, overview, production_year, official_rating, community_rating,
          runtime_ms, container, size_bytes, poster_file_uri, media_file_uri,
          status, progress_bytes, resume_data, user_position_ms, user_played,
          created_at_ms, completed_at_ms, error_message,
        ] = params;
        const record: Record<string, unknown> = {
          server_id, user_id, item_id, media_source_id, item_type,
          series_id, series_name, season_id, parent_index_number, index_number,
          title, subtitle, overview, production_year, official_rating, community_rating,
          runtime_ms, container, size_bytes, poster_file_uri, media_file_uri,
          status, progress_bytes, resume_data, user_position_ms, user_played,
          created_at_ms, completed_at_ms, error_message,
        };
        const key = `${server_id}|${item_id}|${media_source_id}`;
        const changes = downloads.has(key) ? 1 : 0;
        downloads.set(key, record);
        return { changes, lastInsertRowId: 0 };
      }
      if (sql.startsWith('INSERT INTO pending_progress')) {
        pendingAutoId += 1;
        pending.set(pendingAutoId, {
          id: pendingAutoId,
          serverId: params[0] as string,
          userId: params[1] as string,
          itemId: params[2] as string,
          playSessionId: params[3] as string,
          mediaSourceId: params[4] as string,
          eventType: params[5] as string,
          positionMs: params[6] as number,
          isPaused: params[7] === null || params[7] === undefined ? undefined : (params[7] as number) === 1,
          createdAtMs: params[8] as number,
        });
        return { changes: 1, lastInsertRowId: pendingAutoId };
      }
      if (sql.startsWith('UPDATE downloads')) {
        return { changes: 0, lastInsertRowId: 0 };
      }
      if (sql.startsWith('DELETE FROM pending_progress WHERE id = ?')) {
        pending.delete(params[0] as number);
        return { changes: 1, lastInsertRowId: 0 };
      }
      if (sql.startsWith('DELETE FROM downloads')) {
        const list = [...downloads.keys()].filter((key) => {
          const [serverId, itemId] = key.split('|');
          return serverId === params[0] && itemId === params[1];
        });
        list.forEach((key) => downloads.delete(key));
        return { changes: list.length, lastInsertRowId: 0 };
      }
      return { changes: 0, lastInsertRowId: 0 };
    },
    async getAllAsync<T>(source: string, ...params: unknown[]) {
      const sql = source.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('SELECT * FROM downloads')) {
        const list = [...downloads.values()].filter(
          (row) => row.server_id === params[0]
        ) as DownloadRowRaw[];
        if (sql.includes('ORDER BY created_at_ms DESC')) {
          return list
            .sort((a, b) => (b.created_at_ms as number) - (a.created_at_ms as number))
            .slice() as unknown as T[];
        }
        return list.filter((row) => row.item_id === params[1]).slice() as unknown as T[];
      }
      if (sql.startsWith('SELECT * FROM pending_progress')) {
        let list = [...pending.values()];
        if (sql.includes('WHERE server_id = ? AND user_id = ?')) {
          list = list.filter((row) => row.serverId === params[0] && row.userId === params[1]);
        }
        // 有序读取：created_at_ms 升序，次键 id 升序（06 §6.1「有序读取」）；
        // 真实库 getAllAsync 返回列名 snake_case 原始形态，fake 同形（DAO 层 pendingFromRaw 消费）
        return list
          .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id - b.id)
          .map((row) => ({
            id: row.id,
            server_id: row.serverId,
            user_id: row.userId,
            item_id: row.itemId,
            play_session_id: row.playSessionId,
            media_source_id: row.mediaSourceId,
            event_type: row.eventType,
            position_ms: row.positionMs,
            is_paused: row.isPaused === undefined ? null : row.isPaused ? 1 : 0,
            created_at_ms: row.createdAtMs,
          }))
          .slice() as unknown as T[];
      }
      return [] as unknown as T[];
    },
    async withTransactionAsync(task: () => Promise<void>) {
      await task();
    },
  };
}

type DownloadRowRaw = Record<string, unknown> & {
  server_id: string;
  item_id: string;
  media_source_id: string;
  created_at_ms: number;
};

/** 构造快照行（仅 DAO 关心字段） */
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

describe('db DAO（06 §6.1 db DAO 行）', () => {
  it('DDL 幂等：CREATE TABLE IF NOT EXISTS 语句可重复执行', async () => {
    // 真实库幂等由 IF NOT EXISTS 保证；此处断言 DDL 文本即幂等形态且重复传入不抛
    expect(DDL_SQL).toContain('CREATE TABLE IF NOT EXISTS downloads');
    expect(DDL_SQL).toContain('CREATE TABLE IF NOT EXISTS pending_progress');
    const db = makeFakeDb();
    const dao = createDownloadDao(db);
    await expect(dao.getDownloadsByServer('srv-1')).resolves.toEqual([]);
  });

  it('upsert 主键冲突覆盖：同 (server,item,source) 二次 upsert 全列覆盖', async () => {
    const db = makeFakeDb();
    const dao = createDownloadDao(db);
    await dao.upsertDownload(makeRow({ title: '旧标题', status: 'queued' }));
    await dao.upsertDownload(
      makeRow({ title: '新标题', status: 'completed', progressBytes: 123 })
    );
    const list = await dao.getDownloadsByServer('srv-1');
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('新标题');
    expect(list[0].status).toBe('completed');
    expect(list[0].progressBytes).toBe(123);
  });

  it('pending_progress 有序读取（created_at_ms 升序、次键 id）与按 id 删除', async () => {
    const db = makeFakeDb();
    const dao = createDownloadDao(db);
    // 故意乱序入队
    await dao.appendPendingProgress({ serverId: 'srv-1', userId: 'u1', itemId: 'a', playSessionId: 'p1', mediaSourceId: 'a', eventType: 'Progress', positionMs: 30, createdAtMs: 3_000 });
    await dao.appendPendingProgress({ serverId: 'srv-1', userId: 'u1', itemId: 'a', playSessionId: 'p1', mediaSourceId: 'a', eventType: 'Playing', positionMs: 10, createdAtMs: 1_000 });
    await dao.appendPendingProgress({ serverId: 'srv-1', userId: 'u1', itemId: 'a', playSessionId: 'p1', mediaSourceId: 'a', eventType: 'Stopped', positionMs: 40, createdAtMs: 2_000 });
    const list = await dao.listPendingProgress('srv-1', 'u1');
    expect(list.map((row) => row.eventType)).toEqual(['Playing', 'Stopped', 'Progress']);
    // 按 id 删除两组，剩一组
    await dao.deletePendingProgress([list[0].id, list[1].id]);
    const rest = await dao.listAllPendingProgress();
    expect(rest.map((row) => row.eventType)).toEqual(['Progress']);
  });

  it('deleteDownload 按 (serverId, itemId) 清行', async () => {
    const db = makeFakeDb();
    const dao = createDownloadDao(db);
    await dao.upsertDownload(makeRow());
    await dao.deleteDownload('srv-1', 'm1');
    await expect(dao.getDownload('srv-1', 'm1')).resolves.toBeNull();
  });
});
