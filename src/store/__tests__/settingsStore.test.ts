/**
 * settingsStore 单测（M1 文档 §6.1 + M3 §6.1 + 04 文档 §6.1 收口）：
 * setInsecureTlsAllowed 按规范化 baseUrl 增删白名单并全量回同步原生（mock syncTlsBypassHosts
 * 断言重放剩余列表）；removeServerScopedData 清理后回同步；M3 播放四字段默认值与写入 +
 * persist 快照含新字段。
 */
import { SETTINGS_STORE_KEY } from '@/constant/storage';
import { mmkv } from '@/infra/storage';
import { useSettingsStore } from '@/store/settingsStore';

const mockSyncTlsBypassHosts = jest.fn();

jest.mock('@/infra/tlsBypass', () => ({
  syncTlsBypassHosts: (...args: unknown[]) => mockSyncTlsBypassHosts(...args),
  probeTls: jest.fn(),
}));

describe('settingsStore（证书白名单，04 §4.6/§4.7 终态）', () => {
  beforeEach(() => {
    // 重置 store 与 MMKV（persist 快照同步内存 mock）
    useSettingsStore.setState({ allowInsecureTls: [] });
    mmkv.clearAll();
    mockSyncTlsBypassHosts.mockClear();
  });

  it('setInsecureTlsAllowed(true)：按规范化 baseUrl 增加白名单并全量回同步原生', () => {
    useSettingsStore.getState().actions.setInsecureTlsAllowed('https://192.168.1.5:8920', true);
    expect(useSettingsStore.getState().allowInsecureTls).toEqual(['https://192.168.1.5:8920']);
    expect(mockSyncTlsBypassHosts).toHaveBeenLastCalledWith(['https://192.168.1.5:8920']);

    // 已存在幂等（不重复），仍回同步
    useSettingsStore.getState().actions.setInsecureTlsAllowed('https://192.168.1.5:8920', true);
    expect(useSettingsStore.getState().allowInsecureTls).toEqual(['https://192.168.1.5:8920']);
    expect(mockSyncTlsBypassHosts).toHaveBeenLastCalledWith(['https://192.168.1.5:8920']);

    useSettingsStore.getState().actions.setInsecureTlsAllowed('https://myhost.lan/jellyfin', true);
    expect(useSettingsStore.getState().allowInsecureTls).toEqual([
      'https://192.168.1.5:8920',
      'https://myhost.lan/jellyfin',
    ]);
    // 回同步的是完整剩余白名单（键 = 规范化 baseUrl；host:port 解析在 syncTlsBypassHosts 内）
    expect(mockSyncTlsBypassHosts).toHaveBeenLastCalledWith([
      'https://192.168.1.5:8920',
      'https://myhost.lan/jellyfin',
    ]);
  });

  it('setInsecureTlsAllowed(false)：移除并全量回同步剩余列表', () => {
    useSettingsStore.getState().actions.setInsecureTlsAllowed('https://192.168.1.5:8920', true);
    useSettingsStore.getState().actions.setInsecureTlsAllowed('https://myhost.lan/jellyfin', true);
    useSettingsStore.getState().actions.setInsecureTlsAllowed('https://192.168.1.5:8920', false);
    expect(useSettingsStore.getState().allowInsecureTls).toEqual(['https://myhost.lan/jellyfin']);
    expect(mockSyncTlsBypassHosts).toHaveBeenLastCalledWith(['https://myhost.lan/jellyfin']);
  });

  it('removeServerScopedData：删除服务器级联清理后回同步（04 §4.7）', () => {
    useSettingsStore.getState().actions.setInsecureTlsAllowed('https://192.168.1.5:8920', true);
    useSettingsStore.getState().actions.setInsecureTlsAllowed('https://myhost.lan/jellyfin', true);
    mockSyncTlsBypassHosts.mockClear();
    useSettingsStore.getState().actions.removeServerScopedData('https://192.168.1.5:8920');
    expect(useSettingsStore.getState().allowInsecureTls).toEqual(['https://myhost.lan/jellyfin']);
    expect(mockSyncTlsBypassHosts).toHaveBeenCalledTimes(1);
    expect(mockSyncTlsBypassHosts).toHaveBeenLastCalledWith(['https://myhost.lan/jellyfin']);
  });

  it('persist 快照落 MMKV（key settings-store），不包含 token 类内容', () => {
    useSettingsStore.getState().actions.setInsecureTlsAllowed('https://192.168.1.5:8920', true);
    const snapshot = mmkv.getString(SETTINGS_STORE_KEY) ?? '';
    expect(snapshot).toContain('192.168.1.5');
    expect(snapshot.toLowerCase()).not.toContain('token');
  });
});

describe('settingsStore（M3 播放设置四字段，03 §4.7.2）', () => {
  beforeEach(() => {
    mmkv.clearAll();
    useSettingsStore.setState({
      maxBitrateMode: 'AUTO',
      allowHevcDirectPlay: true,
      autoDowngradeOnCellular: true,
      preferredSubtitleLang: null,
    });
  });

  it('四字段默认值：AUTO / true / true / null', () => {
    expect(useSettingsStore.getState().maxBitrateMode).toBe('AUTO');
    expect(useSettingsStore.getState().allowHevcDirectPlay).toBe(true);
    expect(useSettingsStore.getState().autoDowngradeOnCellular).toBe(true);
    expect(useSettingsStore.getState().preferredSubtitleLang).toBeNull();
  });

  it('setMaxBitrateMode：写入档位（BitrateMenu 与设置页共用同一 action）', () => {
    useSettingsStore.getState().actions.setMaxBitrateMode('MEDIUM');
    expect(useSettingsStore.getState().maxBitrateMode).toBe('MEDIUM');
    useSettingsStore.getState().actions.setMaxBitrateMode('LOW');
    expect(useSettingsStore.getState().maxBitrateMode).toBe('LOW');
  });

  it('setAllowHevcDirectPlay / setAutoDowngradeOnCellular / setPreferredSubtitleLang', () => {
    useSettingsStore.getState().actions.setAllowHevcDirectPlay(false);
    expect(useSettingsStore.getState().allowHevcDirectPlay).toBe(false);
    useSettingsStore.getState().actions.setAutoDowngradeOnCellular(false);
    expect(useSettingsStore.getState().autoDowngradeOnCellular).toBe(false);
    useSettingsStore.getState().actions.setPreferredSubtitleLang('chi');
    expect(useSettingsStore.getState().preferredSubtitleLang).toBe('chi');
    useSettingsStore.getState().actions.setPreferredSubtitleLang(null);
    expect(useSettingsStore.getState().preferredSubtitleLang).toBeNull();
  });

  it('persist 快照含新字段（杀 App 重进恢复，T4/T9/T10 支撑）', () => {
    useSettingsStore.getState().actions.setMaxBitrateMode('HIGH');
    useSettingsStore.getState().actions.setAllowHevcDirectPlay(false);
    useSettingsStore.getState().actions.setAutoDowngradeOnCellular(false);
    const snapshot = mmkv.getString(SETTINGS_STORE_KEY) ?? '';
    expect(snapshot).toContain('"maxBitrateMode":"HIGH"');
    expect(snapshot).toContain('"allowHevcDirectPlay":false');
    expect(snapshot).toContain('"autoDowngradeOnCellular":false');
  });
});
