/**
 * 主题变量收敛一处（M1 文档 §4.2/§4.3；M6 文档 §4.6.1；设计文档 §10.1）。
 * 浅色为默认主题（亮色优先），深色保持同结构；resolveTokens 为三态（system/light/dark）
 * 纯函数（A9 单测点）。
 * COLORS 保留为「媒体沉浸页固定深色白名单」（Player/PhotoViewer/NowPlaying 大封面态）
 * 与 radius 等非主题量的引用出处——这些页面不随主题（06 文档 §4.6.1 白名单）。
 * 视觉基调：翡翠主色（设置页可切换配色方案）+ 冷调中性底（Isle 意象），白卡片、大圆角、轻阴影。
 */
import type { ViewStyle } from 'react-native';

/** 主题模式（跟随系统/浅色/深色三态，06 文档 §4.6.1） */
export type ThemeModeEnum = 'system' | 'light' | 'dark';

/** 系统方案（useColorScheme 产物；resolveTokens 入参） */
export type SystemScheme = 'light' | 'dark';

/** 强调色配色方案（设置页可切换；浅色/深色主题各有一套取值） */
export type AccentSchemeEnum =
  | 'EMERALD'
  | 'BLUE'
  | 'INDIGO'
  | 'CORAL'
  | 'GRAPHITE'
  | 'BERRY'
  | 'CARAMEL';

/** 一套主题里与强调色相关的三个 token */
export interface AccentColorTokens {
  accent: string;
  accentOn: string;
  accentSoft: string;
}

export interface AccentSchemeDefinition {
  key: AccentSchemeEnum;
  label: string;
  /** 设置页色点用（与浅色主色一致） */
  swatch: string;
  light: AccentColorTokens;
  dark: AccentColorTokens;
}

/** 全部配色方案（顺序即设置页顺序；绿色只保留翡翠） */
export const ACCENT_SCHEME_LIST: readonly AccentSchemeDefinition[] = [
  {
    key: 'EMERALD',
    label: '翡翠',
    swatch: '#047857',
    light: { accent: '#047857', accentOn: '#FFFFFF', accentSoft: '#E3F3EC' },
    dark: { accent: '#4ADE9C', accentOn: '#04281A', accentSoft: 'rgba(74,222,156,0.18)' },
  },
  {
    key: 'BLUE',
    label: '雾蓝',
    swatch: '#2F6BFF',
    light: { accent: '#2F6BFF', accentOn: '#FFFFFF', accentSoft: '#E9F0FF' },
    dark: { accent: '#7AA2FF', accentOn: '#081A33', accentSoft: 'rgba(122,162,255,0.18)' },
  },
  {
    key: 'INDIGO',
    label: '靛紫',
    swatch: '#5B5EE8',
    light: { accent: '#5B5EE8', accentOn: '#FFFFFF', accentSoft: '#EDEDFD' },
    dark: { accent: '#A5A7FF', accentOn: '#12123A', accentSoft: 'rgba(165,167,255,0.18)' },
  },
  {
    key: 'CORAL',
    label: '珊瑚',
    swatch: '#C24A22',
    light: { accent: '#C24A22', accentOn: '#FFFFFF', accentSoft: '#FBEAE4' },
    dark: { accent: '#FF8F6B', accentOn: '#2B0E05', accentSoft: 'rgba(255,143,107,0.18)' },
  },
  {
    key: 'GRAPHITE',
    label: '墨黑',
    swatch: '#1F2937',
    light: { accent: '#1F2937', accentOn: '#FFFFFF', accentSoft: '#E9EDF1' },
    dark: { accent: '#E5E7EB', accentOn: '#111827', accentSoft: 'rgba(229,231,235,0.14)' },
  },
  {
    key: 'BERRY',
    label: '莓果',
    swatch: '#C2185B',
    light: { accent: '#C2185B', accentOn: '#FFFFFF', accentSoft: '#FCE8EF' },
    dark: { accent: '#FF7BA3', accentOn: '#3A0718', accentSoft: 'rgba(255,123,163,0.18)' },
  },
  {
    key: 'CARAMEL',
    label: '焦糖',
    swatch: '#9A5B2E',
    light: { accent: '#9A5B2E', accentOn: '#FFFFFF', accentSoft: '#F8EEE5' },
    dark: { accent: '#F0B27A', accentOn: '#2B1406', accentSoft: 'rgba(240,178,122,0.18)' },
  },
];

export const ACCENT_SCHEMES = ACCENT_SCHEME_LIST.reduce(
  (result, scheme) => {
    result[scheme.key] = scheme;
    return result;
  },
  {} as Record<AccentSchemeEnum, AccentSchemeDefinition>
);

/** 设置页弹层选项（带色点） */
export const ACCENT_SCHEME_OPTIONS = ACCENT_SCHEME_LIST.map(({ key, label, swatch }) => ({
  key,
  label,
  swatchColor: swatch,
}));

export const DEFAULT_ACCENT_SCHEME: AccentSchemeEnum = 'EMERALD';

/** 主题 token（06 文档 §4.6.1 ThemeTokens；warning 为现状色值反推补充位） */
export interface ThemeTokens {
  /** 页面背景 */
  bg: string;
  /** 卡片/面板底 */
  surface: string;
  /** 浮层/强调卡片底（比 surface 高一层） */
  surfaceElevated: string;
  /** 下沉底（分段控件轨道/输入框底等，比 bg 深一级） */
  surfaceSunken: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  /** 分隔线/描边 */
  separator: string;
  /** 主色（按钮/高亮/进度） */
  accent: string;
  /** 主色上的文字 */
  accentOn: string;
  /** 主色淡底（分段控件选中态） */
  accentSoft: string;
  danger: string;
  success: string;
  /** 警示（版本过低提示等） */
  warning: string;
  /** 遮罩（弹层底） */
  scrim: string;
}

/** 浅色 token（默认主题：冷调纸白 + 翡翠主色；强调色可在设置中切换） */
export const LIGHT_TOKENS: ThemeTokens = {
  bg: '#F5F7F8',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceSunken: '#EAF0F2',
  textPrimary: '#132229',
  textSecondary: '#5B6B73',
  textTertiary: '#93A4AC',
  separator: '#E4EBEE',
  ...ACCENT_SCHEMES[DEFAULT_ACCENT_SCHEME].light,
  danger: '#D14343',
  success: '#177E5A',
  warning: '#A96500',
  scrim: 'rgba(9,25,31,0.45)',
};

/** 深色 token（低亮度墨蓝底 + 翡翠亮绿；与浅色同结构） */
export const DARK_TOKENS: ThemeTokens = {
  bg: '#0A1418',
  surface: '#111F25',
  surfaceElevated: '#182A31',
  surfaceSunken: '#0D1A1F',
  textPrimary: '#E9F1F3',
  textSecondary: '#9CAFB6',
  textTertiary: '#6D8189',
  separator: '#1E323A',
  ...ACCENT_SCHEMES[DEFAULT_ACCENT_SCHEME].dark,
  danger: '#F07070',
  success: '#52C08B',
  warning: '#F2B34C',
  scrim: 'rgba(0,0,0,0.55)',
};

/**
 * 三态解析纯函数（A9 单测点）：system → 随系统方案；light/dark → 对应 token。
 * accentScheme 非默认值时，仅覆盖 accent / accentOn / accentSoft 三个 token。
 * systemScheme 缺省按深色兜底（Android 低版本 ColorScheme 未定时保持深色基调）。
 */
export function resolveTokens(
  mode: ThemeModeEnum,
  systemScheme: SystemScheme,
  accentScheme: AccentSchemeEnum = DEFAULT_ACCENT_SCHEME
): ThemeTokens {
  const isLight = mode === 'light' || (mode === 'system' && systemScheme === 'light');
  const base = isLight ? LIGHT_TOKENS : DARK_TOKENS;
  if (accentScheme === DEFAULT_ACCENT_SCHEME) {
    return base;
  }
  const scheme = ACCENT_SCHEMES[accentScheme] ?? ACCENT_SCHEMES[DEFAULT_ACCENT_SCHEME];
  return { ...base, ...(isLight ? scheme.light : scheme.dark) };
}

/**
 * 固定深色调色板（媒体沉浸页白名单引用 + posterRadius 非 theme 量）：
 * Player / PhotoViewer / NowPlaying 大封面态不随主题（06 文档 §4.6.1），维持深色视觉。
 */
export const COLORS = {
  bg: '#0A1418',
  surface: '#111F25',
  textPrimary: '#E9F1F3',
  textSecondary: '#9CAFB6',
  danger: '#F07070',
  warning: '#F2B34C',
  posterRadius: 14,
} as const;

/** 海报/缩略图圆角（非主题量） */
export const POSTER_RADIUS = COLORS.posterRadius;

/** 卡片/分组容器圆角（设置卡、服务器卡等） */
export const CARD_RADIUS = 18;

/** 底部弹层圆角（单选/队列面板） */
export const SHEET_RADIUS = 24;

/** 轻卡片阴影（浅色主题下让白卡从灰底浮起；深色主题几乎不可见，作为层次兜底） */
export const CARD_SHADOW: ViewStyle = {
  shadowColor: '#0A2A33',
  shadowOpacity: 0.07,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

/** 浮层阴影（菜单/弹层） */
export const FLOATING_SHADOW: ViewStyle = {
  shadowColor: '#071C22',
  shadowOpacity: 0.18,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 10 },
  elevation: 10,
};

/** 间距变量 */
export const SPACING = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;

/** 字号变量（display 用于 Tab 页大标题，section 用于分区标题） */
export const FONT_SIZE = {
  caption: 12,
  body: 14,
  title: 16,
  section: 18,
  header: 20,
  display: 26,
} as const;
