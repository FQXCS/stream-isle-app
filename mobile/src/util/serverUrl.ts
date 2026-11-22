/**
 * 服务器地址表单 ⇄ baseUrl（添加/编辑服务器、备用线路共用）：
 * 表单拆成 协议 / 主机 / 端口 / 子路径 四段，拼装后统一交给 normalizeAddress 收敛格式。
 */
import { normalizeAddress } from '@/util/normalizeUrl';

/** 服务器地址表单字段 */
export interface ServerAddressParts {
  https: boolean;
  /** 主机/IP（不含协议与端口） */
  host: string;
  /** 端口文本（空串表示用协议默认端口） */
  port: string;
  /** 子路径（如 /emby，可空） */
  path: string;
}

/** 表单四段 → 完整地址；非法返回 null */
export function composeServerUrl(parts: ServerAddressParts): string | null {
  const host = parts.host.trim();
  if (host === '') {
    return null;
  }
  // 容错：用户把完整地址粘进了「服务器地址」（含协议/端口/路径）时直接按完整地址规范化
  if (/^https?:\/\//i.test(host) || host.includes('/') || /:\d+$/.test(host)) {
    return normalizeAddress(host);
  }
  const protocol = parts.https ? 'https' : 'http';
  const port = parts.port.trim();
  const path = parts.path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  const authority = port === '' ? host : `${host}:${port}`;
  const suffix = path === '' ? '' : `/${path}`;
  return normalizeAddress(`${protocol}://${authority}${suffix}`);
}

/** baseUrl → 表单四段（编辑回填；无法解析时返回空主机） */
export function splitServerUrl(baseUrl: string): ServerAddressParts {
  const match = /^(https?):\/\/([^/:]+)(?::(\d+))?(?:\/(.*))?$/i.exec(baseUrl.trim());
  if (match === null) {
    return { https: false, host: '', port: '', path: '' };
  }
  return {
    https: match[1].toLowerCase() === 'https',
    host: match[2],
    port: match[3] ?? '',
    path: match[4] ?? '',
  };
}
