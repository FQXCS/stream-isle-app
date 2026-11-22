/**
 * expo-sqlite 的 jest mock（native 模块在 jest 环境不可用；root __mocks__ 对 node_modules
 * 包自动生效）。DAO 单测以注入的假 DbClient 验证（infra/__tests__/db.test.ts），
 * 本 mock 仅保证 import 链（service → db）在 jest 下可解析、不触发真实数据库。
 */

/** 打开数据库 mock：返回行为与 SQLiteDatabase 同形的空实现（方法存在即可解析调用链） */
export async function openDatabaseAsync(): Promise<unknown> {
  return {
    execAsync: async () => undefined,
    runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
    getRowsSync: () => [],
    execSync: () => undefined,
    runSync: () => ({ changes: 0, lastInsertRowId: 0 }),
    withTransactionAsync: async (task: () => Promise<void>) => {
      await task();
    },
    withExclusiveTransactionAsync: async (task: () => Promise<void>) => {
      await task();
    },
    closeAsync: async () => undefined,
  };
}

export const openDatabaseSync = openDatabaseAsync;
