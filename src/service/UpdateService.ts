/**
 * 应用版本检查（GitHub Releases）：读取公开仓库的最新正式 Release，
 * 与当前 APP_VERSION 数值比较；下载与安装由用户经 Release 页面完成。
 */
import { GITHUB_LATEST_RELEASE_API_URL } from '@/constant/app';
import { compareVersion } from '@/util/semver';

/** 检查请求超时（GitHub 无响应时不无限等待） */
const REQUEST_TIMEOUT_MS = 10_000;

/** 最新 Release 的展示字段（GitHub DTO 子集） */
export interface AppReleaseInfo {
  /** 去掉 v 前缀的版本号（如 1.2.0） */
  version: string;
  /** Release 标题（缺省回退标签名） */
  name: string;
  /** 更新说明（Markdown 原文，更新页展示前经 formatReleaseNotes 清洗） */
  notes: string;
  /** Release 页面地址（下载入口） */
  htmlUrl: string;
}

/** 标签名 → 版本号（仅去 v 前缀，其余交给 compareVersion 逐段比较） */
export function normalizeReleaseVersion(tagName: string): string {
  return tagName.trim().replace(/^v/i, '');
}

/** latest 版本是否高于当前版本 */
export function isNewerVersion(currentVersion: string, latestVersion: string): boolean {
  return compareVersion(latestVersion, currentVersion) > 0;
}

/** Release 说明轻量清洗：去标题/引用/粗体/行内代码/图片/链接标记，列表符号统一为圆点 */
export function formatReleaseNotes(notes: string): string {
  return notes
    .split('\n')
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/^\s*[-*+]\s+/, '• ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class UpdateService {
  /**
   * 拉取最新正式 Release。网络失败 / 非 200 / 响应缺字段统一抛错，
   * 由更新页呈现「检查失败」状态（不区分错误类型，避免暴露实现细节）。
   */
  async fetchLatestRelease(): Promise<AppReleaseInfo> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(GITHUB_LATEST_RELEASE_API_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`GitHub Releases 请求失败：HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        tag_name?: unknown;
        name?: unknown;
        body?: unknown;
        html_url?: unknown;
      };
      const tagName = typeof payload.tag_name === 'string' ? payload.tag_name.trim() : '';
      if (tagName === '' || typeof payload.html_url !== 'string') {
        throw new Error('GitHub Releases 响应缺少必要字段');
      }
      return {
        version: normalizeReleaseVersion(tagName),
        name: typeof payload.name === 'string' && payload.name.trim() !== '' ? payload.name : tagName,
        notes: typeof payload.body === 'string' ? payload.body.trim() : '',
        htmlUrl: payload.html_url,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 全局单例 */
export const updateService = new UpdateService();
