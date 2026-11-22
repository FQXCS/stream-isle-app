/**
 * 日志脱敏（M2 文档 §4.3/§4.14：日志与错误信息不得原样输出含 token 的地址）。
 * ApiClient 请求日志与播放器错误日志（errorString 可能透传 ExoPlayer 含 api_key 的完整 URL）共用。
 */

/** 对文本中 query 的 api_key / X-Emby-Token 做脱敏后的日志文本 */
export function sanitizedForLog(text: string): string {
  return text.replace(/([?&]api_key=)[^&]*/gi, '$1***');
}
