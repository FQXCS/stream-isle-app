/**
 * ApiClient：请求描述执行器（M1 文档 §4.5.1；设计文档 §4/§6.1）。
 * 服务层不直接发请求，adapter 产出 API 描述，ApiClient 统一执行；
 * 纯执行器，不感知 flavor / token（认证头由 adapter 组装）。
 */
import axios, { AxiosError } from 'axios';

import { MAX_REDIRECTS, REQUEST_TIMEOUT_MS } from '@/constant/api';
import { AppError, normalizeHttpError } from '@/infra/error';
import { sanitizedForLog } from '@/util/sanitize';

/** adapter 产出的 API 描述 */
export interface ApiRequest {
  method: 'GET' | 'POST' | 'DELETE';
  /** adapter 已拼好的完整 URL（baseUrl + path） */
  url: string;
  /** 认证头由 adapter 组装（buildHeaders） */
  headers?: Record<string, string>;
  body?: unknown;
  /** 默认 REQUEST_TIMEOUT_MS，探测用 PROBE_TIMEOUT_MS */
  timeoutMs?: number;
  /**
   * M6：401 时抑制全局登出事件（Quick Connect 免认证端点以 401 表达「服务器未启用 QC」，
   * 非 Token 失效语义；06 文档 §4.3.1）。默认 undefined = 照常 emit。
   */
  skipUnauthorizedEmit?: boolean;
}

export class ApiClient {
  /**
   * 执行请求：超时 → 归一化错误 → 返回解析后的 JSON；
   * 请求日志对 query 中 api_key 脱敏；401 非登录接口由 normalizeHttpError emit UNAUTHORIZED。
   */
  async request<T>(req: ApiRequest): Promise<T> {
    const timeoutMs = req.timeoutMs ?? REQUEST_TIMEOUT_MS;
    try {
      const response = await axios.request<T>({
        method: req.method,
        url: req.url,
        headers: req.headers,
        data: req.body,
        timeout: timeoutMs,
        maxRedirects: MAX_REDIRECTS,
        // 服务器错误也走响应解析，交由归一化按 status 分类
        validateStatus: null,
        transitional: { clarifyTimeoutError: true },
      });
      // 2xx 之外的状态由归一化统一转 AppError（含 401 事件发射）
      if (response.status >= 200 && response.status < 300) {
        return response.data;
      }
      throw this.toNormalizedError(response.status, req, response.data);
    } catch (err) {
      throw this.wrapError(err, req);
    }
  }

  /** 已是 AppError（上方 2xx 外构造）直接抛出；axios 错误经 normalizeHttpError 归一化 */
  private wrapError(err: unknown, req: ApiRequest): AppError {
    if (err instanceof AppError) {
      return err;
    }
    const normalized = normalizeHttpError(err, req.url, {
      emitUnauthorized: !req.skipUnauthorizedEmit,
    });
    // 网络层失败统一打脱敏日志（含证书/不可达；证书错误由 TLS_ERROR_PATTERNS 启发式判定）
    if (normalized.code === 'NETWORK_UNREACHABLE' || normalized.code === 'TLS_ERROR') {

      console.warn(
        `[ApiClient] 请求失败(${normalized.code}): ${sanitizedForLog(req.url)}`,
        err instanceof AxiosError ? err.message : ''
      );
    }
    return normalized;
  }

  /** 非 2xx 响应构造 AppError（保留原始 data 作为 serverMessage 留痕） */
  private toNormalizedError(status: number, req: ApiRequest, data: unknown): AppError {
    const err = { response: { status, data } } as AxiosError;
    return normalizeHttpError(err, req.url, { emitUnauthorized: !req.skipUnauthorizedEmit });
  }
}

/** 全局单例 */
export const apiClient = new ApiClient();
