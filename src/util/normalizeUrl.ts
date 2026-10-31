/**
 * 服务器地址规范化（M1 文档 §4.4；设计文档 §5.1）。
 * 支持 host、host:port、http(s)://host[:port][/子路径]；纯函数：不依赖 infra、不抛错。
 *
 * 【设计矛盾的解释（§8 开放问题 5 已登记）】§5.1 同节既写「规范化（补协议、去路径）」又写
 * 「子路径保留为 baseUrl 前缀」；本方案取：保留反代子路径（反代场景必需），
 * 「去路径」落实为「去 query/hash 与结尾斜杠」。
 */

/**
 * 规范化用户输入的服务器地址。
 *
 * 规则：trim → 无协议补 http://（默认明文：家庭内网 http 为主，此为决策）
 * → new URL 解析失败返回 null → host 小写、路径保留原大小写
 * → 去结尾 "/"、去 query/hash。
 *
 * @param raw 用户原始输入
 * @returns 规范化后的 baseUrl；非法输入返回 null（INVALID_ADDRESS 由调用方 AuthService.connect 转换）
 */
export function normalizeAddress(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  // 含空白的输入（如 "ht tp://x"）非法；先快速拒绝避免 URL 解析歧义
  if (/\s/.test(trimmed)) {
    return null;
  }
  // 无协议补 http://（默认明文）
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }
  // 必须有主机名（"http://"、协议缺失主机等非法形态在此拦截）
  if (url.hostname === '') {
    return null;
  }
  // 仅允许 http/https 协议
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  // host 小写；路径保留原大小写；去 query/hash 与结尾斜杠
  const host = url.hostname.toLowerCase();
  const port = url.port;
  const path = url.pathname.replace(/\/+$/, '');
  const originPart = port !== '' ? `${host}:${port}` : host;
  return `${url.protocol}//${originPart}${path}`;
}

/**
 * baseUrl → host:port（04 §4.6：TLS 白名单原生键）。
 * 显式端口保留；缺省端口按协议补齐（https→443 / http→80）；含子路径的 baseUrl 只取 host。
 * 纯函数：不依赖 infra、不抛错；非法输入返回 null。
 *
 * @param baseUrl normalizeAddress 规范化产物（或等价的完整 URL）
 */
export function toHostPort(baseUrl: string): string | null {
  const trimmed = baseUrl.trim();
  if (trimmed === '') {
    return null;
  }
  // 无协议补 http://（与 normalizeAddress 同规则，容忍纯 host 输入）
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }
  if (url.hostname === '' || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return null;
  }
  // URL.port 缺省返回空串：按协议补默认端口
  const port = url.port !== '' ? url.port : url.protocol === 'https:' ? '443' : '80';
  return `${url.hostname.toLowerCase()}:${port}`;
}
