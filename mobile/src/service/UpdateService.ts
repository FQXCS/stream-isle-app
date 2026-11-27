/**
 * 应用版本检查（GitHub Releases）：读取公开仓库的正式 Release 列表，按端 tag 前缀
 * 过滤（手机 v* / TV tv-v*）取首条，与当前 APP_VERSION 数值比较；下载与安装由用户经
 * Release 页面完成。TV-m4 列表化防御：不再单点依赖 releases/latest 端点——Latest
 * 徽标不分 tag 序列（TV release 后发即抢占），与发版侧 make_latest=false 互为双保险。
 */
import { GITHUB_RELEASES_API_URL } from '@/constant/app';
import { compareVersion } from '@/util/semver';

/** 检查请求超时（GitHub 无响应时不无限等待） */
const REQUEST_TIMEOUT_MS = 10_000;

/** 列表页大小（发版频率低，30 条足够覆盖两端最新正式版；不足时翻页参数预留） */
const RELEASES_PER_PAGE = 30;

/** 端形态：mobile 筛 v*（排除 tv- 前缀），tv 筛 tv-v* */
export type ReleaseForm = 'mobile' | 'tv';

/** 最新 Release 的展示字段（GitHub DTO 子集） */
export interface AppReleaseInfo {
  /** 去掉 tv-v / v 前缀的版本号（如 1.2.0） */
  version: string;
  /** Release 标题（缺省回退标签名） */
  name: string;
  /** 更新说明（Markdown 原文，更新页展示前经 formatReleaseNotes 清洗） */
  notes: string;
  /** Release 页面地址（下载入口） */
  htmlUrl: string;
}

/** 标签名 → 版本号（去 tv-v / v 前缀，其余交给 compareVersion 逐段比较） */
export function normalizeReleaseVersion(tagName: string): string {
  return tagName.trim().replace(/^(?:tv-)?v/i, '');
}

/** tag 是否属指定端序列（mobile：v* 且非 tv-；tv：tv-v*） */
function matchesForm(tagName: string, form: ReleaseForm): boolean {
  const tag = tagName.trim().toLowerCase();
  if (form === 'tv') {
    return tag.startsWith('tv-v');
  }
  return tag.startsWith('v') && !tag.startsWith('tv-');
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
   * 拉取指定端最新正式 Release（form 缺省 mobile，手机调用点行为等价）。
   * 列表端点 + 端前缀过滤取首条（GitHub 列表按发布时间倒序）；跳过预发布/草稿。
   * 网络失败 / 非 200 / 响应缺字段 / 无本端 Release 统一抛错，
   * 由更新页呈现「检查失败」状态（不区分错误类型，避免暴露实现细节）。
   */
  async fetchLatestRelease(form: ReleaseForm = 'mobile'): Promise<AppReleaseInfo> {
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
        (item) =>
          typeof item.tag_name === 'string' &&
          item.prerelease !== true &&
          item.draft !== true &&
          matchesForm(item.tag_name, form)
      );
      if (record === undefined) {
        throw new Error('未找到本端正式 Release');
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
