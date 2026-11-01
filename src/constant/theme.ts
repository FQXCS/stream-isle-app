/**
 * 主题变量收敛一处（M1 文档 §4.2/§4.3；M6 文档 §4.6.1；设计文档 §10.1）。
 * 深色为默认主题（现状色值收敛 DARK_TOKENS）；浅色 P1 以同结构对象扩展；
 * resolveTokens 为三态（system/light/dark）纯函数（A9 单测点）。
 * COLORS 保留为「媒体沉浸页固定深色白名单」（Player/PhotoViewer/NowPlaying 大封面态）
 * 与 radius 等非主题量的引用出处——这些页面不随主题（06 文档 §4.6.1 白名单）。
 */

/** 主题模式（跟随系统/浅色/深色三态，06 文档 §4.6.1） */
export type ThemeModeEnum = 'system' | 'light' | 'dark';

/** 系统方案（useColorScheme 产物；resolveTokens 入参） */
export type SystemScheme = 'light' | 'dark';

/** 主题 token（06 文档 §4.6.1 ThemeTokens；warning 为现状色值反推补充位） */
export interface ThemeTokens {
  /** 页面背景 */
  bg: string;
  /** 卡片/面板底 */
  surface: string;
  /** 浮层/强调卡片底（比 surface 高一层） */
  surfaceElevated: string;
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
  /** 警示（版本过低提示等，现状 #F5A524 反推） */
  warning: string;
  /** 遮罩（弹层底） */
  scrim: string;
}

/** 深色 token（现状色值收敛，深色为默认主题，设计文档 §10.1） */
export const DARK_TOKENS: ThemeTokens = {
  bg: '#0B0F14',
  surface: '#151A21',
  surfaceElevated: '#1C232C',
  textPrimary: '#EAECEF',
  textSecondary: '#9AA3AD',
  textTertiary: '#6B7480',
  separator: '#232B35',
  accent: '#4C8DFF',
  accentOn: '#FFFFFF',
  accentSoft: 'rgba(76,141,255,0.18)',
  danger: '#E5484D',
  success: '#46A758',
  warning: '#F5A524',
  scrim: 'rgba(0,0,0,0.5)',
};

/** 浅色 token（以深色逐项反推：正文/次级文字对各自背景对比度达 WCAG AA 4.5:1，06 文档 §4.6.1） */
export const LIGHT_TOKENS: ThemeTokens = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#1A1D21',
  textSecondary: '#5A626C',
  textTertiary: '#8B929B',
  separator: '#E2E5E9',
  accent: '#2F6FDE',
  accentOn: '#FFFFFF',
  accentSoft: 'rgba(47,111,222,0.12)',
  danger: '#C93338',
  success: '#217A42',
  warning: '#9A6700',
  scrim: 'rgba(0,0,0,0.4)',
};

/**
 * 三态解析纯函数（A9 单测点）：system → 随系统方案；light/dark → 对应 token。
 * systemScheme 缺省按深色兜底（Android 低版本 ColorScheme 未定时保持深色基调）。
 */
export function resolveTokens(mode: ThemeModeEnum, systemScheme: SystemScheme): ThemeTokens {
  if (mode === 'light') {
    return LIGHT_TOKENS;
  }
  if (mode === 'dark') {
    return DARK_TOKENS;
  }
  return systemScheme === 'light' ? LIGHT_TOKENS : DARK_TOKENS;
}

/**
 * 固定深色调色板（媒体沉浸页白名单引用 + posterRadius 非 theme 量）：
 * Player / PhotoViewer / NowPlaying 大封面态不随主题（06 文档 §4.6.1），维持 M1–M5 既有视觉。
 */
export const COLORS = {
  bg: '#0B0F14',
  surface: '#151A21',
  textPrimary: '#EAECEF',
  textSecondary: '#9AA3AD',
  accent: '#4C8DFF',
  danger: '#E5484D',
  warning: '#F5A524',
  posterRadius: 12,
} as const;

/** 海报/卡片圆角（非主题量，从 COLORS 归并引用；浅色主题同值） */
export const POSTER_RADIUS = COLORS.posterRadius;

/** 间距变量 */
export const SPACING = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;

/** 字号变量 */
export const FONT_SIZE = { body: 14, title: 16, header: 20 } as const;
