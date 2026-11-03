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
import { FONT_SIZE, POSTER_RADIUS, SPACING } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import type { ThemeModeEnum } from '@/constant/theme';
import { ROUTES } from '@/constant/navigation';
import { PlaybackSettingsSection } from '@/page/tabs/components/PlaybackSettingsSection';
import type { RootStackParamList } from '@/page/navigation/types';
import { useSettingsStore } from '@/store/settingsStore';

/** 字幕语言单选 key（04 §4.5：code ?? "default"） */
type SubtitleOptionKey = string;

/** 主题三态选项（06 文档 §4.6.1：跟随系统/浅色/深色） */
const THEME_MODE_OPTIONS: readonly { key: ThemeModeEnum; label: string }[] = [
  { key: 'system', label: '跟随系统' },
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
];

/** GitHub Releases 外链（06 文档 §4.9.3「关于」行；设计文档 §14.4 分发渠道） */
const GITHUB_RELEASES_URL = 'https://github.com/renym/stream-isle-app/releases';

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const t = useTheme();
  const preferredSubtitleLang = useSettingsStore((state) => state.preferredSubtitleLang);
  const themeMode = useSettingsStore((state) => state.themeMode);
  const [subtitleSheetOpen, setSubtitleSheetOpen] = useState(false);
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);

  /** 当前选中 key：null → "default"（04 §4.5 UI 单选 key 约定） */
  const selectedSubtitleKey: SubtitleOptionKey = preferredSubtitleLang ?? 'default';
  const selectedOption: SubtitleLangOption | undefined = SUBTITLE_LANG_OPTION_LIST.find(
    (option) => (option.code ?? 'default') === selectedSubtitleKey
  );
  const selectedThemeOption = THEME_MODE_OPTIONS.find((option) => option.key === themeMode);

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
    <ScrollView style={[styles.container, { backgroundColor: t.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: t.textPrimary }]}>设置</Text>
      {/* 播放分区：M3 PlaybackSettingsSection 原样收编（行为零改动，04 §4.5）+ M4 字幕语言行 */}
      <View style={styles.playGroup}>
        <PlaybackSettingsSection />
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <SettingRow
            label="默认字幕语言"
            description="播放时按该语言自动选轨（仅外挂文本轨）"
            value={selectedOption?.label ?? '跟随默认（中文）'}
            onPress={() => setSubtitleSheetOpen(true)}
          />
        </View>
      </View>
      {/* M6 外观分区（06 §4.4.5/§4.6.1）：浅色主题三态 */}
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Text style={[styles.groupTitle, { color: t.textPrimary }]}>外观</Text>
        <SettingRow
          label="浅色主题"
          description="媒体沉浸页（播放器/照片查看器/正在播放）固定深色"
          value={selectedThemeOption?.label ?? '跟随系统'}
          onPress={() => setThemeSheetOpen(true)}
        />
      </View>
      {/* 收录类型二级页入口：继续观看/观看历史分别设置（类型集不同） */}
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <SettingRow
          label="收录类型"
          description="继续观看与观看历史分别设置"
          showArrow
          onPress={() => navigation.navigate(ROUTES.MEDIA_TYPE_SETTINGS)}
        />
      </View>
      {/* 库页配置入口：服务器类型直接列在设置页，进入后配置 Tab 分类/排序项 */}
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Text style={[styles.groupTitle, { color: t.textPrimary }]}>同类型服务器配置</Text>
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
          label="下载管理"
          description="离线任务进度/暂停/删除，断网可播"
          showArrow
          onPress={() => navigation.navigate(ROUTES.DOWNLOADS)}
        />
        <SettingRow
          label="观看历史"
          description="服务端已看条目，按观看时间倒序"
          showArrow
          onPress={() => navigation.navigate(ROUTES.HISTORY)}
        />
      </View>
      {/* 关于分区（04 §4.5 容器；M6 增补版本 Code 与 GitHub Releases 外链，06 §4.9.3） */}
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Text style={[styles.groupTitle, { color: t.textPrimary }]}>关于</Text>
        <SettingRow label="应用名" value={CLIENT_NAME} />
        <SettingRow label="版本号" value={`${APP_VERSION} (${versionCode})`} />
        <SettingRow
          label="GitHub Releases"
          description="查看更新与历史版本"
          showArrow
          onPress={() => {
            void Linking.openURL(GITHUB_RELEASES_URL).catch(() => {
              // 外链失败静默（无浏览器场景）
            });
          }}
        />
      </View>
      <RadioOptionSheet
        title="默认字幕语言"
        visible={subtitleSheetOpen}
        selectedKey={selectedSubtitleKey}
        optionList={SUBTITLE_LANG_OPTION_LIST.map((option) => ({
          key: option.code ?? 'default',
          label: option.label,
        }))}
        onSelect={handleSelectSubtitle}
        onClose={() => setSubtitleSheetOpen(false)}
      />
      {/* M6 主题三态弹层（06 §4.6.1） */}
      <RadioOptionSheet
        title="浅色主题"
        visible={themeSheetOpen}
        selectedKey={themeMode}
        optionList={THEME_MODE_OPTIONS.map((option) => ({ key: option.key, label: option.label }))}
        onSelect={(key) => useSettingsStore.getState().actions.setThemeMode(key)}
        onClose={() => setThemeSheetOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.l, gap: SPACING.l },
  title: { fontSize: FONT_SIZE.header, fontWeight: '700' },
  playGroup: { gap: SPACING.m },
  card: {
    borderRadius: POSTER_RADIUS,
    padding: SPACING.l,
    gap: SPACING.s,
  },
  groupTitle: { fontSize: FONT_SIZE.title, fontWeight: '700' },
});
