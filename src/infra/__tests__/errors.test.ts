/**
 * 错误归一化矩阵单测（M1 文档 §6.1 errors 行 / §4.5.2）。
 */
import { LOGIN_PATH_SUFFIX } from '@/constant/api';
import { ERROR_MESSAGE_KEYS } from '@/constant/error';
import { apiEvents } from '@/infra/api/apiEvents';
import { AppError, errorMessageOf, isRetryable, normalizeHttpError } from '@/infra/error';
import { useSettingsStore } from '@/store/settingsStore';

/** 构造 axios 形态错误 */
function axiosLike(status?: number, data?: unknown): { response?: { status: number; data?: unknown } } {
  return status === undefined ? {} : { response: { status, data } };
}

describe('normalizeHttpError 归一化矩阵', () => {
  it('无 response（网络层失败）→ NETWORK_UNREACHABLE', () => {
    const err = normalizeHttpError(new Error('Network request failed'), 'http://x/Users/1/Items');
    expect(err.code).toBe('NETWORK_UNREACHABLE');
  });

  it(`401 + 登录端点（${LOGIN_PATH_SUFFIX}）→ LOGIN_FAILED，不触发登出事件`, () => {
    const onUnauthorized = jest.fn();
    const off = apiEvents.on('UNAUTHORIZED', onUnauthorized);
    const err = normalizeHttpError(
      axiosLike(401),
      `http://x${LOGIN_PATH_SUFFIX}`
    );
    expect(err.code).toBe('LOGIN_FAILED');
    expect(onUnauthorized).not.toHaveBeenCalled();
    off();
  });

  it('401 + 其余端点 → UNAUTHORIZED 且触发全局登出事件', () => {
    const onUnauthorized = jest.fn();
    const off = apiEvents.on('UNAUTHORIZED', onUnauthorized);
    const err = normalizeHttpError(axiosLike(401), 'http://x/Users/uid/Items');
    expect(err.code).toBe('UNAUTHORIZED');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    off();
  });

  it('404 → NOT_FOUND', () => {
    expect(normalizeHttpError(axiosLike(404), 'http://x/Items').code).toBe('NOT_FOUND');
  });

  it('429 / 503 → RATE_LIMITED', () => {
    expect(normalizeHttpError(axiosLike(429), 'http://x').code).toBe('RATE_LIMITED');
    expect(normalizeHttpError(axiosLike(503), 'http://x').code).toBe('RATE_LIMITED');
  });

  it('其余 5xx → SERVER_ERROR', () => {
    expect(normalizeHttpError(axiosLike(500), 'http://x').code).toBe('SERVER_ERROR');
    expect(normalizeHttpError(axiosLike(502), 'http://x').code).toBe('SERVER_ERROR');
  });

  it('其余带响应状态（400/403）→ UNKNOWN，httpStatus 留痕', () => {
    const err = normalizeHttpError(axiosLike(400, { message: 'bad' }), 'http://x');
    expect(err.code).toBe('UNKNOWN');
    expect(err.httpStatus).toBe(400);
    expect(err.serverMessage).toBe('bad');
  });

  it('无响应且 message 命中 TLS_ERROR_PATTERNS → TLS_ERROR（M4 收口补全分支）', () => {
    // Android RN 证书错误 message 形态（小写化匹配）
    expect(
      normalizeHttpError(new Error('java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.'), 'http://x')
        .code
    ).toBe('TLS_ERROR');
    expect(normalizeHttpError(new Error('SSL handshake failed'), 'http://x').code).toBe('TLS_ERROR');
    expect(normalizeHttpError(new Error('The certificate for this server is invalid'), 'http://x').code).toBe('TLS_ERROR');
  });

  it('无响应且 message 未命中启发式 → NETWORK_UNREACHABLE（漏判由 connect 原生 probe 兜底细分）', () => {
    expect(normalizeHttpError(new Error('Network request failed'), 'http://x').code).toBe(
      'NETWORK_UNREACHABLE'
    );
    expect(normalizeHttpError(new Error('timeout of 10000ms exceeded'), 'http://x').code).toBe(
      'NETWORK_UNREACHABLE'
    );
  });

  it('带响应的状态码不参与 TLS 启发式（判定表「有 response」分支优先）', () => {
    // 有 response 时按 status 映射，与 message 内容无关
    expect(normalizeHttpError(axiosLike(400, { message: 'ssl error' }), 'http://x').code).toBe('UNKNOWN');
    expect(normalizeHttpError(axiosLike(500, { message: 'certificate error' }), 'http://x').code).toBe('SERVER_ERROR');
  });
});

describe('ERROR_MESSAGE_KEYS（§4.3 唯一出处）', () => {
  beforeEach(() => {
    // 文案断言固定中文，避免跟随系统语言影响
    useSettingsStore.getState().actions.setLanguage('zh');
  });

  const ALL_CODES = [
    'INVALID_ADDRESS',
    'NETWORK_UNREACHABLE',
    'TLS_ERROR',
    'NOT_MEDIA_SERVER',
    'LOGIN_FAILED',
    'UNAUTHORIZED',
    'NOT_FOUND',
    'RATE_LIMITED',
    'SERVER_ERROR',
    'PLAYBACK_UNSUPPORTED',
    // M5 增量三码（M5 文档 §4.8）
    'AUDIO_ENGINE_INIT_FAILED',
    'PHOTO_SAVE_FAILED',
    'PHOTO_SAVE_PERMISSION_DENIED',
    // M6 增量七码（M6 文档 §4.8：QC 四码 + 下载三码）
    'QUICK_CONNECT_DISABLED',
    'QUICK_CONNECT_TIMEOUT',
    'QUICK_CONNECT_CANCELLED',
    'QUICK_CONNECT_EXPIRED',
    'DOWNLOAD_UNAVAILABLE',
    'DOWNLOAD_NO_SPACE',
    'DOWNLOAD_DUPLICATE',
    'DOWNLOAD_CREDENTIAL_MISSING',
    'NOT_IMPLEMENTED',
    'UNKNOWN',
  ] as const;

  it('覆盖全部 23 个 AppErrorCode 且无多余键', () => {
    expect(Object.keys(ERROR_MESSAGE_KEYS).sort()).toEqual([...ALL_CODES].sort());
  });

  it('三类错误文案与 §4.3 映射逐字一致（验收标准 3）', () => {
    expect(errorMessageOf('NETWORK_UNREACHABLE')).toBe(
      '无法连接服务器，请检查地址与网络后重试'
    );
    expect(errorMessageOf('NOT_MEDIA_SERVER')).toBe('该地址不是 Emby/Jellyfin 服务器');
    expect(errorMessageOf('TLS_ERROR')).toBe(
      '服务器证书校验失败。若为自签名证书，可在设置中开启「忽略证书校验」后重试'
    );
    expect(errorMessageOf('INVALID_ADDRESS')).toBe(
      '地址格式无效，请输入如 http://192.168.1.5:8096'
    );
    expect(errorMessageOf('UNAUTHORIZED')).toBe('登录已失效，请重新输入密码');
  });

  it('切换语言后错误文案跟随（en）', () => {
    useSettingsStore.getState().actions.setLanguage('en');
    expect(errorMessageOf('NETWORK_UNREACHABLE')).toBe(
      'Cannot reach the server. Check the address and network, then try again'
    );
    expect(errorMessageOf('NOT_MEDIA_SERVER')).toBe(
      'This address is not an Emby/Jellyfin server'
    );
  });

  it('isRetryable 按 RETRYABLE_ERROR_CODES 判定', () => {
    expect(isRetryable('NETWORK_UNREACHABLE')).toBe(true);
    expect(isRetryable('TLS_ERROR')).toBe(true);
    expect(isRetryable('RATE_LIMITED')).toBe(true);
    expect(isRetryable('SERVER_ERROR')).toBe(true);
    expect(isRetryable('UNKNOWN')).toBe(true);
    expect(isRetryable('UNAUTHORIZED')).toBe(false);
    expect(isRetryable('LOGIN_FAILED')).toBe(false);
    expect(isRetryable('NOT_FOUND')).toBe(false);
  });

  it('AppError message 固定为错误码、httpStatus/serverMessage 留痕', () => {
    const err = new AppError('SERVER_ERROR', { httpStatus: 500, serverMessage: 'boom' });
    expect(err.message).toBe('SERVER_ERROR');
    expect(err.httpStatus).toBe(500);
    expect(err.serverMessage).toBe('boom');
  });
});
