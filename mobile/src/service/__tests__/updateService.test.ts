/**
 * UpdateService 单测：Release 列表首条映射、非 200 / 脏响应抛错、版本号比较。
 * 发版形态「同 tag 双 APK」单 Release 流（TV 设计 §4.2，2026-11-28 修订）：
 * 无端前缀过滤，预发布/草稿跳过防御保留。
 */
import { GITHUB_RELEASES_API_URL } from '@/constant/app';
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

/** 构造 Release 列表条目最小替身 */
function releaseEntry(tagName: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: tagName,
    name: `Stream Isle ${tagName}`,
    body: '## 更新内容\n- 修复若干问题',
    html_url: `https://github.com/FQXCS/stream-isle-app/releases/tag/${tagName}`,
    ...extra,
  };
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
  it('请求列表端点并映射首条正式 Release', async () => {
    mockResponse([releaseEntry('v1.3.0'), releaseEntry('v1.2.0')]);
    const release = await new UpdateService().fetchLatestRelease();
    expect(release).toEqual({
      version: '1.3.0',
      name: 'Stream Isle v1.3.0',
      notes: '## 更新内容\n- 修复若干问题',
      htmlUrl: 'https://github.com/FQXCS/stream-isle-app/releases/tag/v1.3.0',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${GITHUB_RELEASES_API_URL}?per_page=30`,
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
      })
    );
  });

  it('跳过预发布与草稿条目', async () => {
    mockResponse([
      releaseEntry('v2.0.0', { prerelease: true }),
      releaseEntry('v1.9.0', { draft: true }),
      releaseEntry('v1.3.0'),
    ]);
    const release = await new UpdateService().fetchLatestRelease();
    expect(release.version).toBe('1.3.0');
  });

  it('标题/说明缺省时回退标签名与空串', async () => {
    mockResponse([
      {
        tag_name: 'v1.0.1',
        html_url: 'https://github.com/FQXCS/stream-isle-app/releases/tag/v1.0.1',
      },
    ]);
    const release = await new UpdateService().fetchLatestRelease();
    expect(release.name).toBe('v1.0.1');
    expect(release.notes).toBe('');
  });

  it('非 200 抛错（页面呈现检查失败）', async () => {
    mockResponse({}, false, 404);
    await expect(new UpdateService().fetchLatestRelease()).rejects.toThrow('HTTP 404');
  });

  it('响应非列表抛错', async () => {
    mockResponse({ tag_name: 'v1.0.2' });
    await expect(new UpdateService().fetchLatestRelease()).rejects.toThrow('缺少必要字段');
  });

  it('首条缺 html_url 抛错', async () => {
    mockResponse([{ tag_name: 'v1.0.2' }]);
    await expect(new UpdateService().fetchLatestRelease()).rejects.toThrow('缺少必要字段');
  });

  it('无正式 Release 抛错（空列表）', async () => {
    mockResponse([]);
    await expect(new UpdateService().fetchLatestRelease()).rejects.toThrow('未找到正式 Release');
  });

  it('全为预发布/草稿时抛错', async () => {
    mockResponse([
      releaseEntry('v2.0.0', { prerelease: true }),
      releaseEntry('v1.9.0', { draft: true }),
    ]);
    await expect(new UpdateService().fetchLatestRelease()).rejects.toThrow('未找到正式 Release');
  });
});
