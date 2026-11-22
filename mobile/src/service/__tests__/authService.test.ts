/**
 * AuthService.connect 错误转换单测（M1 文档 §6.1 authService 行 / §4.7）：
 * normalizeAddress null → INVALID_ADDRESS；probe 网络失败 + probeTls=TLS_FAIL → TLS_ERROR；
 * probeTls=UNREACHABLE → NETWORK_UNREACHABLE（TLS_ERROR 的 connect 链路生产者唯一性）。
 */
import { AppError } from '@/infra/error';
import { connect } from '@/service/AuthService';

const mockProbeTls = jest.fn();
const mockAdapterProbe = jest.fn();

jest.mock('@/adapter', () => ({
  createAdapter: jest.fn(() => ({
    probe: (...args: unknown[]) => mockAdapterProbe(...args),
  })),
}));

jest.mock('@/infra/tlsBypass', () => ({
  syncTlsBypassHosts: jest.fn(),
  probeTls: (...args: unknown[]) => mockProbeTls(...args),
}));

describe('AuthService.connect 错误转换', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizeAddress 返回 null → AppError(INVALID_ADDRESS)，且不发起探测', async () => {
    await expect(connect('ht tp://x')).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
    expect(mockAdapterProbe).not.toHaveBeenCalled();
  });

  it('probe 网络失败 + 原生 probeTls=TLS_FAIL → AppError(TLS_ERROR)', async () => {
    mockAdapterProbe.mockRejectedValue(new AppError('NETWORK_UNREACHABLE'));
    mockProbeTls.mockResolvedValue('TLS_FAIL');
    await expect(connect('192.168.1.5:8443')).rejects.toMatchObject({ code: 'TLS_ERROR' });
    expect(mockProbeTls).toHaveBeenCalledWith('http://192.168.1.5:8443');
  });

  it('probe 网络失败 + 原生 probeTls=UNREACHABLE → NETWORK_UNREACHABLE', async () => {
    mockAdapterProbe.mockRejectedValue(new AppError('NETWORK_UNREACHABLE'));
    mockProbeTls.mockResolvedValue('UNREACHABLE');
    await expect(connect('192.168.1.5:9')).rejects.toMatchObject({
      code: 'NETWORK_UNREACHABLE',
    });
  });

  it('probe 成功 → 原样返回 ServerInfo，且不调 probeTls', async () => {
    const info = {
      flavor: 'JELLYFIN',
      baseUrl: 'http://192.168.1.5:8096',
      serverId: 'srv1',
      serverName: 'Jellyfin',
      version: '10.10.1',
      versionTooLow: false,
    };
    mockAdapterProbe.mockResolvedValue(info);
    const result = await connect('192.168.1.5:8096');
    expect(result).toEqual(info);
    expect(mockProbeTls).not.toHaveBeenCalled();
  });

  it('NOT_MEDIA_SERVER 原样穿透，不做 TLS 细分', async () => {
    mockAdapterProbe.mockRejectedValue(new AppError('NOT_MEDIA_SERVER'));
    await expect(connect('192.168.1.1')).rejects.toMatchObject({ code: 'NOT_MEDIA_SERVER' });
    expect(mockProbeTls).not.toHaveBeenCalled();
  });
});
