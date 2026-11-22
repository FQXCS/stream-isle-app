/**
 * UpdateService 单测：GitHub Release 响应映射、非 200 / 脏响应抛错、版本号比较。
 */
import { GITHUB_LATEST_RELEASE_API_URL } from '@/constant/app';
import {
  formatReleaseNotes,
  isNewerVersion,
  normalizeReleaseVersion,
  UpdateService,
} from '@/service/UpdateService';

const fetchMock = jest.fn();
const originalFetch = globalThis.fetch;

/** 构造 fetch 响应最小替身（服务只消费 ok/status/json） */
function mockResponse(payload: unknown, ok = true, status = 200): void {
  fetchMock.mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('normalizeReleaseVersion / isNewerVersion', () => {
  it('标签去 v 前缀并去除空白', () => {
    expect(normalizeReleaseVersion(' v1.2.3 ')).toBe('1.2.3');
    expect(normalizeReleaseVersion('V2.0')).toBe('2.0');
  });

  it('按数值段比较且段数不齐补 0', () => {
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(true);
    expect(isNewerVersion('1.2.0', '1.1.9')).toBe(false);
    expect(isNewerVersion('1.0', '1.0.0')).toBe(false);
  });
});

describe('formatReleaseNotes', () => {
  it('去除 Markdown 标题/粗体/代码/链接标记并统一列表符号', () => {
    const notes = '## 本次更新\n- **新增**更新页\n- 详见[发布页](https://example.com)\n\n\n> 提示 `test`';
    expect(formatReleaseNotes(notes)).toBe(
      '本次更新\n• 新增更新页\n• 详见发布页\n\n提示 test'
    );
  });

  it('空说明返回空串', () => {
    expect(formatReleaseNotes('   ')).toBe('');
  });
});

describe('UpdateService.fetchLatestRelease', () => {
  it('请求 latest 端点并映射展示字段', async () => {
    mockResponse({
      tag_name: 'v1.3.0',
      name: 'Stream Isle 1.3.0',
      body: '## 更新内容\n- 修复若干问题',
      html_url: 'https://github.com/FQXCS/stream-isle-app/releases/tag/v1.3.0',
    });
    const release = await new UpdateService().fetchLatestRelease();
    expect(release).toEqual({
      version: '1.3.0',
      name: 'Stream Isle 1.3.0',
      notes: '## 更新内容\n- 修复若干问题',
      htmlUrl: 'https://github.com/FQXCS/stream-isle-app/releases/tag/v1.3.0',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      GITHUB_LATEST_RELEASE_API_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
      })
    );
  });

  it('标题/说明缺省时回退标签名与空串', async () => {
    mockResponse({
      tag_name: 'v1.0.1',
      html_url: 'https://github.com/FQXCS/stream-isle-app/releases/tag/v1.0.1',
    });
    const release = await new UpdateService().fetchLatestRelease();
    expect(release.name).toBe('v1.0.1');
    expect(release.notes).toBe('');
  });

  it('非 200 抛错（页面呈现检查失败）', async () => {
    mockResponse({}, false, 404);
    await expect(new UpdateService().fetchLatestRelease()).rejects.toThrow('HTTP 404');
  });

  it('响应缺少必要字段抛错', async () => {
    mockResponse({ tag_name: 'v1.0.2' });
    await expect(new UpdateService().fetchLatestRelease()).rejects.toThrow('缺少必要字段');
  });
});
