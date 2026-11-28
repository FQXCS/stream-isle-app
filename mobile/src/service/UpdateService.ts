/**
 * 应用版本检查（GitHub Releases）：读取公开仓库的正式 Release 列表取首条
 * （跳过预发布/草稿），与当前 APP_VERSION 数值比较；下载与安装由用户经 Release
 * 页面完成。发版形态为「同 tag 双 APK」单 Release 流（TV 设计 §4.2，2026-11-28
 * 修订）：单一 v* tag 序列即双端统一版本，Latest 徽标即本流、无端前缀过滤需求；
 * 列表端点 + 预发布/草稿防御保留（不单点依赖 releases/latest 端点）。
 */
import { GITHUB_RELEASES_API_URL } from '@/constant/app';
import { compareVersion } from '@/util/semver';

/** 检查请求超时（GitHub 无响应时不无限等待） */
const REQUEST_TIMEOUT_MS = 10_000;

/** 列表页大小（发版频率低，30 条足够覆盖最新正式版；不足时翻页参数预留） */
const RELEASES_PER_PAGE = 30;

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

/** 标签名 → 版本号（去 v 前缀，其余交给 compareVersion 逐段比较） */
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
   * 拉取最新正式 Release。列表端点取首条非预发布/非草稿（GitHub 列表按发布时间
   * 倒序）。网络失败 / 非 200 / 响应缺字段 / 无正式 Release 统一抛错，
   * 由更新页呈现「检查失败」状态（不区分错误类型，避免暴露实现细节）。
   */
  async fetchLatestRelease(): Promise<AppReleaseInfo> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${GITHUB_RELEASES_API_URL}?per_page=${RELEASES_PER_PAGE}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`GitHub Releases 请求失败：HTTP ${response.status}`);
      }
      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) {
        throw new Error('GitHub Releases 响应缺少必要字段');
      }
      const record = (payload as Record<string, unknown>[]).find(
        (item) => typeof item.tag_name === 'string' && item.prerelease !== true && item.draft !== true
      );
      if (record === undefined) {
        throw new Error('未找到正式 Release');
      }
      const tagName = (record.tag_name as string).trim();
      if (typeof record.html_url !== 'string') {
        throw new Error('GitHub Releases 响应缺少必要字段');
      }
      return {
        version: normalizeReleaseVersion(tagName),
        name: typeof record.name === 'string' && record.name.trim() !== '' ? record.name : tagName,
        notes: typeof record.body === 'string' ? record.body.trim() : '',
        htmlUrl: record.html_url,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 全局单例 */
export const updateService = new UpdateService();
