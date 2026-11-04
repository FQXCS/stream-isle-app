/**
 * BookReaderService 单测（M7）：缓存命中直接返回；未命中走 buildBookFileUrl 下载并返回
 * 本地 uri；非 200 → SERVER_ERROR 且清理残留；网络异常 → NETWORK_UNREACHABLE；
 * 断点页码 / 阅读方向 MMKV 往返与脏值兜底；无活跃账号断言抛错。
 * fs / adapterProvider 全注入假实现（不触真机/真网络）。
 */
import { AppError } from '@/infra/error';
import { useAccountStore } from '@/store/accountStore';

import { bookReaderService } from '@/service/BookReaderService';

/** expo-file-system/legacy 假实现（getInfoAsync/createDownloadResumable/makeDirectoryAsync） */
jest.mock('expo-file-system/legacy', () => {
  const getInfoAsync = jest.fn().mockResolvedValue({ exists: false });
  const makeDirectoryAsync = jest.fn().mockResolvedValue(undefined);
  const deleteAsync = jest.fn().mockResolvedValue(undefined);
  const createDownloadResumable = jest.fn();
  return {
    cacheDirectory: 'file:///cache/',
    getInfoAsync,
    makeDirectoryAsync,
    deleteAsync,
    createDownloadResumable,
  };
});

/** adapter 假实现（buildBookFileUrl / markPlayed 共享实现，无 flavor 差异；mock 前缀供 jest.mock 工厂引用） */
const mockBuildBookFileUrl = jest.fn((itemId: string) => `http://srv/Items/${itemId}/Download?api_key=tok`);
const mockMarkPlayed = jest.fn().mockResolvedValue(undefined);
jest.mock('@/service/adapterProvider', () => ({
  getActiveAdapter: () => ({ buildBookFileUrl: mockBuildBookFileUrl, markPlayed: mockMarkPlayed }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fsLegacy = require('expo-file-system/legacy') as {
  getInfoAsync: jest.Mock;
  makeDirectoryAsync: jest.Mock;
  deleteAsync: jest.Mock;
  createDownloadResumable: jest.Mock;
};

/** 统一活跃账号上下文（每个用例重置 fs mock 的 exists 语义） */
beforeEach(() => {
  useAccountStore.setState({ active: { serverId: 'srv1', userId: 'u1' } });
  fsLegacy.getInfoAsync.mockResolvedValue({ exists: false });
  fsLegacy.deleteAsync.mockClear();
  mockBuildBookFileUrl.mockClear();
  mockMarkPlayed.mockClear();
});

describe('BookReaderService.ensureLocalPdf', () => {
  it('缓存命中直接返回本地 uri，不发起下载', async () => {
    fsLegacy.getInfoAsync.mockResolvedValue({ exists: true });
    const uri = await bookReaderService.ensureLocalPdf('b1');
    expect(uri).toBe('file:///cache/pdf/srv1/b1.pdf');
    expect(fsLegacy.createDownloadResumable).not.toHaveBeenCalled();
  });

  it('未命中经 buildBookFileUrl 下载，建目录并返回 uri', async () => {
    const downloadAsync = jest.fn().mockResolvedValue({ status: 200, uri: 'file:///cache/pdf/srv1/b1.pdf' });
    fsLegacy.createDownloadResumable.mockReturnValue({ downloadAsync });
    const onProgress = jest.fn();
    const uri = await bookReaderService.ensureLocalPdf('b1', onProgress);
    expect(mockBuildBookFileUrl).toHaveBeenCalledWith('b1');
    expect(fsLegacy.makeDirectoryAsync).toHaveBeenCalledWith('file:///cache/pdf/srv1', { intermediates: true });
    expect(fsLegacy.createDownloadResumable).toHaveBeenCalledWith(
      'http://srv/Items/b1/Download?api_key=tok',
      'file:///cache/pdf/srv1/b1.pdf',
      {},
      expect.any(Function)
    );
    expect(uri).toBe('file:///cache/pdf/srv1/b1.pdf');
  });

  it('非 200 抛 SERVER_ERROR 且删除残留半截文件', async () => {
    fsLegacy.createDownloadResumable.mockReturnValue({
      downloadAsync: jest.fn().mockResolvedValue({ status: 404, uri: 'file:///cache/pdf/srv1/b1.pdf' }),
    });
    await expect(bookReaderService.ensureLocalPdf('b1')).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    expect(fsLegacy.deleteAsync).toHaveBeenCalledWith('file:///cache/pdf/srv1/b1.pdf', { idempotent: true });
  });

  it('下载异常归一为 NETWORK_UNREACHABLE', async () => {
    fsLegacy.createDownloadResumable.mockReturnValue({
      downloadAsync: jest.fn().mockRejectedValue(new Error('network down')),
    });
    const err = await bookReaderService.ensureLocalPdf('b1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('NETWORK_UNREACHABLE');
  });

  it('无活跃账号断言抛错（时序错误）', async () => {
    useAccountStore.setState({ active: null });
    await expect(bookReaderService.ensureLocalPdf('b1')).rejects.toThrow('时序错误');
  });
});

describe('BookReaderService 断点页码', () => {
  it('save → get 往返；无记录/脏值兜底为 1', () => {
    expect(bookReaderService.getResumePage('b1')).toBe(1);
    bookReaderService.saveResumePage('b1', 7);
    expect(bookReaderService.getResumePage('b1')).toBe(7);
    // 跨条目隔离
    expect(bookReaderService.getResumePage('b2')).toBe(1);
  });

  it('markRead 经 adapter.markPlayed 携带活跃 userId', async () => {
    await bookReaderService.markRead('b1');
    expect(mockMarkPlayed).toHaveBeenCalledWith('u1', 'b1');
  });
});

describe('BookReaderService 阅读方向', () => {
  it('默认上下滑动；save → get 往返', () => {
    expect(bookReaderService.getReadingMode()).toBe('vertical');
    bookReaderService.saveReadingMode('horizontal');
    expect(bookReaderService.getReadingMode()).toBe('horizontal');
    bookReaderService.saveReadingMode('vertical');
    expect(bookReaderService.getReadingMode()).toBe('vertical');
  });
});
