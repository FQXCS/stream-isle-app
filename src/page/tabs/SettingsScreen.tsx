/**
 * 设置页（04 文档 §4.5 完整化；设计文档 §5.1/§8.2/§9/§10.2/§11；M6 文档 §4.4.5/§4.9.3）：
 * 播放（M3 PlaybackSettingsSection 收编回归 + M4 新增「默认字幕语言」单选弹层）/
 * 外观（M6 浅色主题三态，06 §4.6.1）/ 下载与历史入口（06 §4.4.5 设置页入口）/
 * 收录类型二级页入口 / 关于（应用名/版本号/版本 Code + GitHub Releases 外链）。
 * 账号与服务器管理已迁至「媒体服务器」Tab（MediaServerScreen）。
 */
import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';

import { RadioOptionSheet } from '@/component/RadioOptionSheet';
import { SettingRow } from '@/component/SettingRow';
import { CLIENT_NAME, APP_VERSION } from '@/constant/app';
import {
  SUBTITLE_LANG_OPTION_LIST,
  type SubtitleLangOption,
} from '@/constant/subtitle';
import { SERVER_FLAVOR_OPTIONS } from '@/constant/server';
import { ACCENT_SCHEME_OPTIONS, CARD_RADIUS, CARD_SHADOW, FONT_SIZE, SPACING } from '@/constant/theme';
import { useMiniPlayerPadding } from '@/component/MiniPlayer';
import { useTheme } from '@/component/useTheme';
import { useT } from '@/i18n';
import type { LanguagePreference, MessageKey } from '@/i18n';
import type { ThemeModeEnum } from '@/constant/theme';
import { ROUTES } from '@/constant/navigation';
import { PlaybackSettingsSection } from '@/page/tabs/components/PlaybackSettingsSection';
import type { RootStackParamList } from '@/page/navigation/types';
import { useSettingsStore } from '@/store/settingsStore';

/** 字幕语言单选 key（04 §4.5：code ?? "default"） */
type SubtitleOptionKey = string;

/** 主题三态选项（06 文档 §4.6.1：跟随系统/浅色/深色） */
const THEME_MODE_OPTIONS: readonly { key: ThemeModeEnum; labelKey: MessageKey }[] = [
  { key: 'system', labelKey: 'theme.system' },
  { key: 'light', labelKey: 'theme.light' },
  { key: 'dark', labelKey: 'theme.dark' },
];

/** 界面语言选项：简体中文/English 固定自称，跟随系统随 UI 语言翻译 */
const LANGUAGE_OPTIONS: readonly { key: LanguagePreference; labelKey: MessageKey }[] = [
  { key: 'system', labelKey: 'settings.languageSystem' },
  { key: 'zh', labelKey: 'settings.languageZh' },
  { key: 'en', labelKey: 'settings.languageEn' },
];

/** GitHub Releases 外链（06 文档 §4.9.3「关于」行；设计文档 §14.4 分发渠道） */
const GITHUB_RELEASES_URL = 'https://github.com/renym/stream-isle-app/releases';

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const t = useTheme();
  const tr = useT();
  // 迷你条浮在 Tab 栏上方：底部让位，设置项不被条子覆盖（停止播放后自动归零）
  const miniPadding = useMiniPlayerPadding();
  const preferredSubtitleLang = useSettingsStore((state) => state.preferredSubtitleLang);
  const themeMode = useSettingsStore((state) => state.themeMode);
  const accentScheme = useSettingsStore((state) => state.accentScheme);
  const language = useSettingsStore((state) => state.language);
  const [subtitleSheetOpen, setSubtitleSheetOpen] = useState(false);
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);
  const [accentSheetOpen, setAccentSheetOpen] = useState(false);
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);

  /** 当前选中 key：null → "default"（04 §4.5 UI 单选 key 约定） */
  const selectedSubtitleKey: SubtitleOptionKey = preferredSubtitleLang ?? 'default';
  const selectedOption: SubtitleLangOption | undefined = SUBTITLE_LANG_OPTION_LIST.find(
    (option) => (option.code ?? 'default') === selectedSubtitleKey
  );
  const selectedThemeOption = THEME_MODE_OPTIONS.find((option) => option.key === themeMode);
  const selectedAccentOption = ACCENT_SCHEME_OPTIONS.find((option) => option.key === accentScheme);
  const selectedLanguageOption = LANGUAGE_OPTIONS.find((option) => option.key === language);

  /** 写回 setPreferredSubtitleLang（M3 既有签名；null = 跟随默认自动选中文字幕） */
  const handleSelectSubtitle = (key: SubtitleOptionKey) => {
    const option = SUBTITLE_LANG_OPTION_LIST.find((item) => (item.code ?? 'default') === key);
    if (option !== undefined) {
      useSettingsStore.getState().actions.setPreferredSubtitleLang(option.code);
    }
  };

  /** 版本 Code（gradle versionCode；expo-application nativeBuildVersion，06 §4.9.3） */
  const versionCode = Application.nativeBuildVersion ?? '-';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: t.bg, marginBottom: miniPadding }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: t.textPrimary }]}>{tr('settings.title')}</Text>
      {/* 播放分区：M3 PlaybackSettingsSection 原样收编（行为零改动，04 §4.5）+ M4 字幕语言行 */}
      <View style={styles.playGroup}>
        <PlaybackSettingsSection />
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <SettingRow
            label={tr('settings.defaultSubtitle')}
            description={tr('settings.defaultSubtitleDesc')}
            value={
              selectedOption === undefined
                ? tr('subtitleLang.followDefault')
                : tr(selectedOption.labelKey)
            }
            onPress={() => setSubtitleSheetOpen(true)}
          />
        </View>
      </View>
      {/* M6 外观分区（06 §4.4.5/§4.6.1）：语言 + 主题三态（默认亮色） */}
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Text style={[styles.groupTitle, { color: t.textTertiary }]}>{tr('settings.appearance')}</Text>
        <SettingRow
          label={tr('settings.language')}
          description={tr('settings.languageDesc')}
          value={
            selectedLanguageOption === undefined
              ? tr('settings.languageSystem')
              : tr(selectedLanguageOption.labelKey)
          }
          onPress={() => setLanguageSheetOpen(true)}
        />
        <SettingRow
          label={tr('settings.theme')}
          description={tr('settings.themeDesc')}
          value={selectedThemeOption === undefined ? tr('theme.light') : tr(selectedThemeOption.labelKey)}
          onPress={() => setThemeSheetOpen(true)}
        />
        <SettingRow
          label={tr('settings.accentScheme')}
          description={tr('settings.accentSchemeDesc')}
          value={
            selectedAccentOption === undefined
              ? tr('accent.emerald')
              : tr(selectedAccentOption.labelKey)
          }
          onPress={() => setAccentSheetOpen(true)}
        />
      </View>
      {/* 收录类型二级页入口：继续观看/观看历史分别设置（类型集不同） */}
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <SettingRow
          label={tr('settings.includedTypes')}
          description={tr('settings.includedTypesDesc')}
          showArrow
          onPress={() => navigation.navigate(ROUTES.MEDIA_TYPE_SETTINGS)}
        />
      </View>
      {/* 库页配置入口：服务器类型直接列在设置页，进入后配置 Tab 分类/排序项 */}
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Text style={[styles.groupTitle, { color: t.textTertiary }]}>
          {tr('settings.sameFlavorConfig')}
        </Text>
        {SERVER_FLAVOR_OPTIONS.map((option) => (
          <SettingRow
            key={option.value}
            label={option.label}
            showArrow
            onPress={() =>
              navigation.navigate(ROUTES.LIBRARY_DISPLAY_SETTINGS, { flavor: option.value })
            }
          />
        ))}
      </View>
      {/* M6 下载与历史入口（06 §4.4.5 设置页入口行） */}
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <SettingRow
          label={tr('settings.downloads')}
          description={tr('settings.downloadsDesc')}
          showArrow
          onPress={() => navigation.navigate(ROUTES.DOWNLOADS)}
        />
        <SettingRow
          label={tr('settings.history')}
          description={tr('settings.historyDesc')}
          showArrow
          onPress={() => navigation.navigate(ROUTES.HISTORY)}
        />
      </View>
      {/* 关于分区（04 §4.5 容器；M6 增补版本 Code 与 GitHub Releases 外链，06 §4.9.3） */}
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Text style={[styles.groupTitle, { color: t.textTertiary }]}>{tr('settings.about')}</Text>
        <SettingRow label={tr('settings.appName')} value={CLIENT_NAME} />
        <SettingRow label={tr('settings.version')} value={`${APP_VERSION} (${versionCode})`} />
        <SettingRow
          label={tr('settings.githubReleases')}
          description={tr('settings.githubReleasesDesc')}
          showArrow
          onPress={() => {
            void Linking.openURL(GITHUB_RELEASES_URL).catch(() => {
              // 外链失败静默（无浏览器场景）
            });
          }}
        />
      </View>
      <RadioOptionSheet
        title={tr('settings.defaultSubtitle')}
        visible={subtitleSheetOpen}
        selectedKey={selectedSubtitleKey}
        optionList={SUBTITLE_LANG_OPTION_LIST.map((option) => ({
          key: option.code ?? 'default',
          label: tr(option.labelKey),
        }))}
        onSelect={handleSelectSubtitle}
        onClose={() => setSubtitleSheetOpen(false)}
      />
      {/* M6 主题三态弹层（06 §4.6.1） */}
      <RadioOptionSheet
        title={tr('settings.theme')}
        visible={themeSheetOpen}
        selectedKey={themeMode}
        optionList={THEME_MODE_OPTIONS.map((option) => ({
          key: option.key,
          label: tr(option.labelKey),
        }))}
        onSelect={(key) => useSettingsStore.getState().actions.setThemeMode(key)}
        onClose={() => setThemeSheetOpen(false)}
      />
      {/* 配色方案弹层：色点 + 名称，选中即全局生效 */}
      <RadioOptionSheet
        title={tr('settings.accentScheme')}
        visible={accentSheetOpen}
        selectedKey={accentScheme}
        optionList={ACCENT_SCHEME_OPTIONS.map((option) => ({
          key: option.key,
          label: tr(option.labelKey),
          swatchColor: option.swatchColor,
        }))}
        onSelect={(key) => useSettingsStore.getState().actions.setAccentScheme(key)}
        onClose={() => setAccentSheetOpen(false)}
      />
      {/* 界面语言弹层：切换立即重渲染（useT 订阅 store），持久化由 settingsStore 负责 */}
      <RadioOptionSheet
        title={tr('settings.language')}
        visible={languageSheetOpen}
        selectedKey={language}
        optionList={LANGUAGE_OPTIONS.map((option) => ({
          key: option.key,
          label: tr(option.labelKey),
        }))}
        onSelect={(key) => useSettingsStore.getState().actions.setLanguage(key)}
        onClose={() => setLanguageSheetOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.l, gap: SPACING.m },
  title: {
    fontSize: FONT_SIZE.display,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: SPACING.xs,
  },
  playGroup: { gap: SPACING.m },
  card: {
    borderRadius: CARD_RADIUS,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    gap: 2,
    ...CARD_SHADOW,
  },
  groupTitle: {
    fontSize: FONT_SIZE.caption + 1,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: SPACING.xs,
  },
});
