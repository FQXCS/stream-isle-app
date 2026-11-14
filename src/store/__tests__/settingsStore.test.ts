/**
 * settingsStore 单测（M1 文档 §6.1 + M3 §6.1 + M4 文档 §6.1 收口）：
 * setInsecureTlsAllowed 按规范化 baseUrl 增删白名单并全量回同步原生（mock syncTlsBypassHosts
 * 断言重放剩余列表）；removeServerScopedData 清理后回同步；M3 播放四字段默认值与写入 +
 * persist 快照含新字段。
 */
import { SETTINGS_STORE_KEY } from '@/constant/storage';
import { mmkv } from '@/infra/storage';
import { DEFAULT_ACCENT_SCHEME, ACCENT_SCHEME_LIST } from '@/constant/theme';
import { translateFor } from '@/i18n/translate';
import { useSettingsStore } from '@/store/settingsStore';

const mockSyncTlsBypassHosts = jest.fn();

jest.mock('@/infra/tlsBypass', () => ({
  syncTlsBypassHosts: (...args: unknown[]) => mockSyncTlsBypassHosts(...args),
  probeTls: jest.fn(),
}));

describe('settingsStore（证书白名单，M4 §4.6/§4.7 终态）', () => {
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

  it('removeServerScopedData：删除服务器级联清理后回同步（M4 §4.7）', () => {
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

describe('settingsStore（继续观看/观看历史收录类型）', () => {
  beforeEach(() => {
    mmkv.clearAll();
    useSettingsStore.setState({
      resumeTypeList: ['Movie', 'Episode', 'Video'],
      historyTypeList: ['Movie', 'Episode', 'Video'],
    });
  });

  it('两组默认均为 Movie,Episode,Video', () => {
    expect(useSettingsStore.getState().resumeTypeList).toEqual(['Movie', 'Episode', 'Video']);
    expect(useSettingsStore.getState().historyTypeList).toEqual(['Movie', 'Episode', 'Video']);
  });

  it('继续观看：按选项固定顺序增删，取消最后一项被忽略', () => {
    const { toggleResumeType } = useSettingsStore.getState().actions;
    toggleResumeType('Video');
    expect(useSettingsStore.getState().resumeTypeList).toEqual(['Movie', 'Episode']);
    toggleResumeType('Video');
    expect(useSettingsStore.getState().resumeTypeList).toEqual(['Movie', 'Episode', 'Video']);
    toggleResumeType('Movie');
    toggleResumeType('Episode');
    expect(useSettingsStore.getState().resumeTypeList).toEqual(['Video']);
    // 至少保留一项：取消最后一项不生效
    toggleResumeType('Video');
    expect(useSettingsStore.getState().resumeTypeList).toEqual(['Video']);
  });

  it('观看历史：支持追加图书/音乐，与继续观看互不影响', () => {
    const { toggleHistoryType } = useSettingsStore.getState().actions;
    toggleHistoryType('Book');
    toggleHistoryType('Audio');
    expect(useSettingsStore.getState().historyTypeList).toEqual([
      'Movie',
      'Episode',
      'Video',
      'Book',
      'Audio',
    ]);
    expect(useSettingsStore.getState().resumeTypeList).toEqual(['Movie', 'Episode', 'Video']);
  });

  it('persist 快照包含两组字段并随 MMKV 落盘', () => {
    useSettingsStore.getState().actions.toggleHistoryType('Book');
    const snapshot = mmkv.getString(SETTINGS_STORE_KEY) ?? '';
    expect(snapshot).toContain('"resumeTypeList":["Movie","Episode","Video"]');
    expect(snapshot).toContain('"historyTypeList":["Movie","Episode","Video","Book"]');
    // actions 为函数集合，JSON 序列化后是 {}，不能落盘（否则回灌会清空 action）
    expect(snapshot).not.toContain('"actions"');
  });

  it('旧快照含 "actions":{} 时回灌仍保留 action 与设置值（冷启动回归）', async () => {
    mmkv.set(
      SETTINGS_STORE_KEY,
      JSON.stringify({ state: { themeMode: 'dark', actions: {} }, version: 0 })
    );
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().themeMode).toBe('dark');
    expect(typeof useSettingsStore.getState().actions.toggleResumeType).toBe('function');
    expect(typeof useSettingsStore.getState().actions.toggleHistoryType).toBe('function');
    expect(useSettingsStore.getState().resumeTypeList).toEqual(['Movie', 'Episode', 'Video']);
  });

  it('v1 迁移：旧快照「跟随系统」切到亮色，显式深色/浅色保持不动', async () => {
    mmkv.set(SETTINGS_STORE_KEY, JSON.stringify({ state: { themeMode: 'system' }, version: 0 }));
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().themeMode).toBe('light');

    mmkv.set(SETTINGS_STORE_KEY, JSON.stringify({ state: { themeMode: 'dark' }, version: 0 }));
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().themeMode).toBe('dark');
  });
});

describe('settingsStore（M3 播放设置四字段，M3 §4.7.2）', () => {
  beforeEach(() => {
    mmkv.clearAll();
    useSettingsStore.setState({
      maxResolutionTier: 'UNLIMITED',
      allowHevcDirectPlay: true,
      autoDowngradeOnCellular: true,
      preferredSubtitleLang: null,
    });
  });

  it('四字段默认值：UNLIMITED / true / true / null', () => {
    expect(useSettingsStore.getState().maxResolutionTier).toBe('UNLIMITED');
    expect(useSettingsStore.getState().allowHevcDirectPlay).toBe(true);
    expect(useSettingsStore.getState().autoDowngradeOnCellular).toBe(true);
    expect(useSettingsStore.getState().preferredSubtitleLang).toBeNull();
  });

  it('setMaxResolutionTier：写入档位（ResolutionMenu 与设置页共用同一 action）', () => {
    useSettingsStore.getState().actions.setMaxResolutionTier('FHD');
    expect(useSettingsStore.getState().maxResolutionTier).toBe('FHD');
    useSettingsStore.getState().actions.setMaxResolutionTier('SD');
    expect(useSettingsStore.getState().maxResolutionTier).toBe('SD');
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
    useSettingsStore.getState().actions.setMaxResolutionTier('FHD');
    useSettingsStore.getState().actions.setAllowHevcDirectPlay(false);
    useSettingsStore.getState().actions.setAutoDowngradeOnCellular(false);
    const snapshot = mmkv.getString(SETTINGS_STORE_KEY) ?? '';
    expect(snapshot).toContain('"maxResolutionTier":"FHD"');
    expect(snapshot).toContain('"allowHevcDirectPlay":false');
    expect(snapshot).toContain('"autoDowngradeOnCellular":false');
  });
});

describe('settingsStore（配色方案）', () => {
  beforeEach(() => {
    useSettingsStore.setState({ accentScheme: DEFAULT_ACCENT_SCHEME });
    mmkv.clearAll();
  });

  it('默认翡翠，且列表里绿色只保留翡翠', () => {
    expect(DEFAULT_ACCENT_SCHEME).toBe('EMERALD');
    expect(useSettingsStore.getState().accentScheme).toBe('EMERALD');
    const labels = ACCENT_SCHEME_LIST.map((scheme) => translateFor('zh', scheme.labelKey));
    expect(labels).toEqual(['翡翠', '雾蓝', '靛紫', '珊瑚', '墨黑', '莓果', '焦糖']);
  });

  it('setAccentScheme 写入并持久化', () => {
    useSettingsStore.getState().actions.setAccentScheme('BERRY');
    expect(useSettingsStore.getState().accentScheme).toBe('BERRY');
    const snapshot = mmkv.getString(SETTINGS_STORE_KEY) ?? '';
    expect(snapshot).toContain('"accentScheme":"BERRY"');
  });
});

describe('settingsStore（界面语言）', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'system' });
    mmkv.clearAll();
  });

  it('默认跟随系统', () => {
    expect(useSettingsStore.getState().language).toBe('system');
  });

  it('setLanguage 写入并持久化', () => {
    useSettingsStore.getState().actions.setLanguage('en');
    expect(useSettingsStore.getState().language).toBe('en');
    const snapshot = mmkv.getString(SETTINGS_STORE_KEY) ?? '';
    expect(snapshot).toContain('"language":"en"');
  });

  it('旧快照缺 language / 非法值 → 回灌为 system', async () => {
    mmkv.set(SETTINGS_STORE_KEY, JSON.stringify({ state: { themeMode: 'dark' }, version: 1 }));
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().language).toBe('system');
    expect(useSettingsStore.getState().themeMode).toBe('dark');

    mmkv.set(
      SETTINGS_STORE_KEY,
      JSON.stringify({ state: { language: 'fr' }, version: 1 })
    );
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().language).toBe('system');
  });
});
