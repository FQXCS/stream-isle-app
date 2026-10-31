/**
 * 设置 store（M1 文档 §4.8；设计文档 §9；M3 文档 §4.7.2；04 §4.7 终态）。
 * allowInsecureTls 白名单键 = 规范化 baseUrl（04 收口升级，M1 基座为 host 键）；
 * 原生侧经 syncTlsBypassHosts 逐条解析为 host:port 全量回同步（变化时重放剩余白名单）。
 * M3 增量四个播放设置字段：maxBitrateMode / allowHevcDirectPlay / autoDowngradeOnCellular /
 * preferredSubtitleLang。persist，key "settings-store" 不变。
 * 注意：自动降档（蜂窝）不写 maxBitrateMode——唯一落盘入口是 BitrateMenu/设置页手动切换（03 §4.9）。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { BitrateTierKey } from '@/constant/bitrate';
import { DEFAULT_BITRATE_TIER } from '@/constant/bitrate';
import type { ThemeModeEnum } from '@/constant/theme';
import { SETTINGS_STORE_KEY } from '@/constant/storage';
import { syncTlsBypassHosts } from '@/infra/tlsBypass';
import { createMmkvJSONStorage } from '@/infra/storage';

interface SettingsActions {
  /**
   * 增删 TLS 白名单（04 §4.7 终态签名）：allowed=true 增加规范化 baseUrl 键（已存在幂等）、
   * false 移除；变化后全量回同步原生（重放剩余白名单）。
   */
  setInsecureTlsAllowed(baseUrl: string, allowed: boolean): void;
  /** 删除服务器级联清理（04 §4.7）：移除该 baseUrl 白名单键并全量回同步原生 */
  removeServerScopedData(baseUrl: string): void;
  /** 码率档位落盘（BitrateMenu 与设置页共用同一 action，杜绝两处语义分叉，03 §4.13） */
  setMaxBitrateMode(tier: BitrateTierKey): void;
  /** 「允许 HEVC 直连」开关（默认 true；关闭后 HEVC 片全量转码兜底） */
  setAllowHevcDirectPlay(value: boolean): void;
  /** 「蜂窝自动降档」开关（默认 true；仅控制自动降档，不影响手动切换） */
  setAutoDowngradeOnCellular(value: boolean): void;
  /** 字幕语言偏好（M3 无 UI，M4 设置页接入；null = 取 DEFAULT_SUBTITLE_LANGUAGE 自动选轨） */
  setPreferredSubtitleLang(lang: string | null): void;
  /** M5：电池引导已展示标记（无论用户选择与否，写 true 后不再弹，05 文档 §4.14） */
  setBatteryGuideShown(): void;
  /** M6：浅色主题三态（system/light/dark，默认跟随系统；06 文档 §4.6.1） */
  setThemeMode(mode: ThemeModeEnum): void;
}

interface SettingsState {
  /** 证书白名单（键 = 规范化 baseUrl，04 §4.6） */
  allowInsecureTls: string[];
  /** 码率档位（默认 AUTO=20Mbps，设计文档 §8.2） */
  maxBitrateMode: BitrateTierKey;
  /** 允许 HEVC 直连（默认 true，设计文档 §8.2；探测仍要求 Main10 才声明 hevc，03 §4.4.2） */
  allowHevcDirectPlay: boolean;
  /** 蜂窝自动降档（默认 true，设计文档 §11「可关」） */
  autoDowngradeOnCellular: boolean;
  /** 字幕语言偏好（默认 null → 消费时取 DEFAULT_SUBTITLE_LANGUAGE，03 §4.7.2） */
  preferredSubtitleLang: string | null;
  /** M5：电池白名单引导一次性标记（已展示不再弹，05 文档 §4.14；persist） */
  batteryGuideShown: boolean;
  /** M6：主题模式（默认 system 跟随系统；随既有 MMKV persist 持久化，06 文档 §4.6.1） */
  themeMode: ThemeModeEnum;
  actions: SettingsActions;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      allowInsecureTls: [],
      maxBitrateMode: DEFAULT_BITRATE_TIER,
      allowHevcDirectPlay: true,
      autoDowngradeOnCellular: true,
      preferredSubtitleLang: null,
      batteryGuideShown: false,
      themeMode: 'system',

      actions: {
        setInsecureTlsAllowed: (baseUrl: string, allowed: boolean) => {
          set((state) => {
            const exists = state.allowInsecureTls.includes(baseUrl);
            if (allowed) {
              // 已存在幂等（仍回同步原生，保持「变化即重放」的统一语义）
              return exists
                ? state
                : { allowInsecureTls: [...state.allowInsecureTls, baseUrl] };
            }
            return exists
              ? { allowInsecureTls: state.allowInsecureTls.filter((item) => item !== baseUrl) }
              : state;
          });
          syncTlsBypassHosts(get().allowInsecureTls);
        },

        removeServerScopedData: (baseUrl: string) => {
          set((state) => ({
            allowInsecureTls: state.allowInsecureTls.filter((item) => item !== baseUrl),
          }));
          syncTlsBypassHosts(get().allowInsecureTls);
        },

        setMaxBitrateMode: (tier: BitrateTierKey) => {
          set({ maxBitrateMode: tier });
        },

        setAllowHevcDirectPlay: (value: boolean) => {
          set({ allowHevcDirectPlay: value });
        },

        setAutoDowngradeOnCellular: (value: boolean) => {
          set({ autoDowngradeOnCellular: value });
        },

        setPreferredSubtitleLang: (lang: string | null) => {
          set({ preferredSubtitleLang: lang });
        },

        setBatteryGuideShown: () => {
          set({ batteryGuideShown: true });
        },

        setThemeMode: (mode: ThemeModeEnum) => {
          set({ themeMode: mode });
        },
      },
    }),
    {
      name: SETTINGS_STORE_KEY,
      storage: createMmkvJSONStorage(),
    }
  )
);
