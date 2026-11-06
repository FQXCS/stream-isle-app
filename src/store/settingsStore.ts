/**
 * 设置 store（M1 文档 §4.8；设计文档 §9；M3 文档 §4.7.2；04 §4.7 终态）。
 * allowInsecureTls 白名单键 = 规范化 baseUrl（04 收口升级，M1 基座为 host 键）；
 * 原生侧经 syncTlsBypassHosts 逐条解析为 host:port 全量回同步（变化时重放剩余白名单）。
 * M3 四个播放设置字段：maxResolutionTier（转码分辨率档位，替代原码率档位）/ allowHevcDirectPlay /
 * autoDowngradeOnCellular / preferredSubtitleLang；断点续播开关 resumePlaybackEnabled。persist，key "settings-store" 不变。
 * 注意：自动降档（蜂窝）不写 maxResolutionTier——唯一落盘入口是 ResolutionMenu/设置页手动切换（03 §4.9）。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { MediaItemTypeEnum } from '@/adapter/model';
import type { LanguagePreference } from '@/i18n/types';
import type { ResolutionTierKey } from '@/constant/resolution';
import { DEFAULT_RESOLUTION_TIER } from '@/constant/resolution';
import { DEFAULT_FEED_TYPES, HISTORY_TYPE_OPTIONS, RESUME_TYPE_OPTIONS } from '@/constant/browse';
import type { AccentSchemeEnum, ThemeModeEnum } from '@/constant/theme';
import { DEFAULT_ACCENT_SCHEME } from '@/constant/theme';
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
  /** 转码分辨率档位落盘（ResolutionMenu 与设置页共用同一 action，杜绝两处语义分叉，03 §4.13） */
  setMaxResolutionTier(tier: ResolutionTierKey): void;
  /** 「允许 HEVC 直连」开关（默认 true；关闭后 HEVC 片全量转码兜底） */
  setAllowHevcDirectPlay(value: boolean): void;
  /** 「蜂窝自动降档」开关（默认 true；仅控制自动降档，不影响手动切换） */
  setAutoDowngradeOnCellular(value: boolean): void;
  /** 「断点续播」开关（默认 true；关闭后点播放恒从头开始） */
  setResumePlaybackEnabled(value: boolean): void;
  /** 字幕语言偏好（M3 无 UI，M4 设置页接入；null = 取 DEFAULT_SUBTITLE_LANGUAGE 自动选轨） */
  setPreferredSubtitleLang(lang: string | null): void;
  /** M5：电池引导已展示标记（无论用户选择与否，写 true 后不再弹，05 文档 §4.14） */
  setBatteryGuideShown(): void;
  /** 主题三态（system/light/dark，默认亮色；06 文档 §4.6.1） */
  setThemeMode(mode: ThemeModeEnum): void;
  /** 强调色配色方案（设置页可切换，默认翡翠；浅色/深色各有适配） */
  setAccentScheme(scheme: AccentSchemeEnum): void;
  /** 界面语言偏好（system = 跟随系统，默认；zh/en 显式指定） */
  setLanguage(preference: LanguagePreference): void;
  /** 首页继续观看收录类型多选（至少保留一项，空列表变更忽略） */
  toggleResumeType(type: MediaItemTypeEnum): void;
  /** 观看历史收录类型多选（至少保留一项，空列表变更忽略） */
  toggleHistoryType(type: MediaItemTypeEnum): void;
}

interface SettingsState {
  /** 证书白名单（键 = 规范化 baseUrl，04 §4.6） */
  allowInsecureTls: string[];
  /** 最大转码分辨率档位（默认无限制；直连不受影响） */
  maxResolutionTier: ResolutionTierKey;
  /** 允许 HEVC 直连（默认 true，设计文档 §8.2；探测仍要求 Main10 才声明 hevc，03 §4.4.2） */
  allowHevcDirectPlay: boolean;
  /** 蜂窝自动降档（默认 true，设计文档 §11「可关」） */
  autoDowngradeOnCellular: boolean;
  /** 断点续播（默认 true：点播放从上次停止位置继续；关闭后恒从头播放） */
  resumePlaybackEnabled: boolean;
  /** 字幕语言偏好（默认 null → 消费时取 DEFAULT_SUBTITLE_LANGUAGE，03 §4.7.2） */
  preferredSubtitleLang: string | null;
  /** M5：电池白名单引导一次性标记（已展示不再弹，05 文档 §4.14；persist） */
  batteryGuideShown: boolean;
  /** 主题模式（默认 light 亮色优先；随既有 MMKV persist 持久化，06 文档 §4.6.1） */
  themeMode: ThemeModeEnum;
  /** 强调色配色方案（默认翡翠；persist） */
  accentScheme: AccentSchemeEnum;
  /** 界面语言偏好（默认跟随系统；persist） */
  language: LanguagePreference;
  /** 继续观看收录类型（默认 Movie,Episode,Video；persist） */
  resumeTypeList: MediaItemTypeEnum[];
  /** 观看历史收录类型（默认 Movie,Episode,Video；persist；较继续观看多图书/音乐） */
  historyTypeList: MediaItemTypeEnum[];
  actions: SettingsActions;
}

/**
 * 在指定选项集内切换收录类型：返回按选项固定顺序重排的新列表；
 * 取消最后一项时返回 null（调用方维持原值，避免查询类型为空）。
 */
/** 持久化语言偏好归一：非法/缺失值回退跟随系统 */
function normalizeLanguagePreference(value: unknown): LanguagePreference {
  return value === 'zh' || value === 'en' || value === 'system' ? value : 'system';
}

function toggleTypeInList(
  currentList: readonly MediaItemTypeEnum[],
  type: MediaItemTypeEnum,
  optionList: readonly { type: MediaItemTypeEnum }[]
): MediaItemTypeEnum[] | null {
  const selected = new Set(currentList);
  if (selected.has(type)) {
    selected.delete(type);
  } else {
    selected.add(type);
  }
  const next = optionList.map((option) => option.type).filter((item) => selected.has(item));
  return next.length === 0 ? null : next;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      allowInsecureTls: [],
      maxResolutionTier: DEFAULT_RESOLUTION_TIER,
      allowHevcDirectPlay: true,
      autoDowngradeOnCellular: true,
      resumePlaybackEnabled: true,
      preferredSubtitleLang: null,
      batteryGuideShown: false,
      themeMode: 'light',
      accentScheme: DEFAULT_ACCENT_SCHEME,
      language: 'system',
      resumeTypeList: [...DEFAULT_FEED_TYPES],
      historyTypeList: [...DEFAULT_FEED_TYPES],

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

        setMaxResolutionTier: (tier: ResolutionTierKey) => {
          set({ maxResolutionTier: tier });
        },

        setAllowHevcDirectPlay: (value: boolean) => {
          set({ allowHevcDirectPlay: value });
        },

        setAutoDowngradeOnCellular: (value: boolean) => {
          set({ autoDowngradeOnCellular: value });
        },

        setResumePlaybackEnabled: (value: boolean) => {
          set({ resumePlaybackEnabled: value });
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

        setAccentScheme: (scheme: AccentSchemeEnum) => {
          set({ accentScheme: scheme });
        },

        setLanguage: (preference: LanguagePreference) => {
          set({ language: preference });
        },

        toggleResumeType: (type: MediaItemTypeEnum) => {
          set((state) => {
            const next = toggleTypeInList(state.resumeTypeList, type, RESUME_TYPE_OPTIONS);
            return next === null ? state : { resumeTypeList: next };
          });
        },

        toggleHistoryType: (type: MediaItemTypeEnum) => {
          set((state) => {
            const next = toggleTypeInList(state.historyTypeList, type, HISTORY_TYPE_OPTIONS);
            return next === null ? state : { historyTypeList: next };
          });
        },
      },
    }),
    {
      name: SETTINGS_STORE_KEY,
      storage: createMmkvJSONStorage(),
      version: 1,
      // v1：默认主题切到亮色；旧快照里「跟随系统」统一迁移为 light，显式 dark/light 保持不动
      migrate: (persistedState, version) => {
        const persisted = (persistedState ?? {}) as Record<string, unknown>;
        if (version < 1 && persisted.themeMode === 'system') {
          return { ...persisted, themeMode: 'light' } as unknown as SettingsState;
        }
        return persistedState as SettingsState;
      },
      // 只持久化设置字段：actions 是函数集合，JSON 序列化为 {}，回灌会清空全部 action
      partialize: (state) => ({
        allowInsecureTls: state.allowInsecureTls,
        maxResolutionTier: state.maxResolutionTier,
        allowHevcDirectPlay: state.allowHevcDirectPlay,
        autoDowngradeOnCellular: state.autoDowngradeOnCellular,
        resumePlaybackEnabled: state.resumePlaybackEnabled,
        preferredSubtitleLang: state.preferredSubtitleLang,
        batteryGuideShown: state.batteryGuideShown,
        themeMode: state.themeMode,
        accentScheme: state.accentScheme,
        language: state.language,
        resumeTypeList: state.resumeTypeList,
        historyTypeList: state.historyTypeList,
      }),
      // 兼容已落盘的旧快照（内含 "actions":{}）：回灌时始终保留当前 actions；
      // language 为新增字段，缺失/非法值统一回退跟随系统
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<SettingsState>;
        return {
          ...currentState,
          ...persisted,
          language: normalizeLanguagePreference(persisted.language),
          actions: currentState.actions,
        };
      },
    }
  )
);
