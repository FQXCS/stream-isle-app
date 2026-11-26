/**
 * TV 播放设置抽屉（TV-m3 §4.3，照抄手机 PlayerSettingsDrawer 契约的 TV 改造）：
 * 右侧半透面板，顶三页签 视频/音频/字幕。视频页宽高比五档 + 转码分辨率（仅转码会话）；
 * 音频页音轨芯片单选 + 音频延迟；字幕页主字幕芯片（含禁用置灰不可聚焦）+ 字幕延时。
 * TV 改造：① 页签/选项/芯片全 TvPressable 焦点化，选中态 accent 描边/文字（TvTabBar
 * 「焦点 row 背景 + 选中 accent」两维度语言，避 m1-S4 accent 底对比坑）；② 页签与内容
 * 同挂一个 ScrollView（页签为 header，m2-S3 子树结论：UP/DOWN 跨页签↔内容可达）；
 * ③ 面板 trapFocus 四向；④ BACK 关闭由页面 BackHandler 收口，无手机 scrim 点按 onClose；
 * ⑤ cellularForced 不移植（TV 无蜂窝）。纯 props 驱动不读 store（值由页面传入，同手机）。
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { AudioTrack, SubtitleTrack } from '@/adapter/model';
import type { ResolutionTierKey } from '@/constant/resolution';
import { VIDEO_ASPECT_LIST, type VideoAspectKey } from '@/constant/playback';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useImmersiveAccent } from '@/component/useTheme';
import { useT } from '@/i18n';
import { formatChannels } from '@/util/format';
import { availableResolutionTiers, normalizeResolutionTierForSource } from '@/util/resolution';

import { TvPressable } from '@tv/component/TvPressable';
import { TvDelayStepper } from '@tv/component/player/TvDelayStepper';

type DrawerTab = 'video' | 'audio' | 'subtitle';

interface TvSettingsDrawerProps {
  aspect: VideoAspectKey;
  onAspect: (aspect: VideoAspectKey) => void;
  /** 转码分辨率区可见性（仅服务器转码会话） */
  showResolution: boolean;
  activeTier: ResolutionTierKey;
  sourceHeight?: number;
  onResolution: (tier: ResolutionTierKey) => void;
  audioTracks: AudioTrack[];
  activeAudioIndex: number | null;
  onAudioSelect: (track: AudioTrack) => void;
  subtitleTracks: SubtitleTrack[];
  activeSubtitleIndex: number | null;
  onSubtitleSelect: (track: SubtitleTrack | null) => void;
  /** 音频延迟毫秒数（M8 音画同步延时） */
  audioDelayMs: number;
  onAudioDelay: (ms: number) => void;
  /** 字幕延时毫秒数（M8 音画同步延时） */
  subtitleDelayMs: number;
  onSubtitleDelay: (ms: number) => void;
  /** 字幕延时不可用（烧录/未开字幕） */
  subtitleDelayDisabled: boolean;
}

export function TvSettingsDrawer({
  aspect,
  onAspect,
  showResolution,
  activeTier,
  sourceHeight,
  onResolution,
  audioTracks,
  activeAudioIndex,
  onAudioSelect,
  subtitleTracks,
  activeSubtitleIndex,
  onSubtitleSelect,
  audioDelayMs,
  onAudioDelay,
  subtitleDelayMs,
  onSubtitleDelay,
  subtitleDelayDisabled,
}: TvSettingsDrawerProps) {
  const tr = useT();
  const { accent } = useImmersiveAccent();
  const [tab, setTab] = useState<DrawerTab>('video');
  const { width: screenWidth } = useWindowDimensions();
  const panelWidth = Math.min(640, Math.max(320, Math.round(screenWidth * 0.42)));

  const aspectLabel = (key: VideoAspectKey): string => {
    if (key === 'default') {
      return tr('player.aspectDefault');
    }
    if (key === 'stretch') {
      return tr('player.aspectStretch');
    }
    if (key === 'fill') {
      return tr('player.aspectFill');
    }
    return key;
  };

  const tierList = availableResolutionTiers(sourceHeight);
  const shownActiveTier = normalizeResolutionTierForSource(activeTier, sourceHeight);

  const tabList: { key: DrawerTab; label: string }[] = [
    { key: 'video', label: tr('player.tabVideo') },
    { key: 'audio', label: tr('player.audioMenu') },
    { key: 'subtitle', label: tr('player.subtitleMenu') },
  ];

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* 遮罩压暗（TV 无点按关闭，纯视觉；BACK 由页面收口） */}
      <View style={styles.backdrop} pointerEvents="none" />
      <View
        style={[styles.panel, { width: panelWidth }]}
        trapFocusUp
        trapFocusDown
        trapFocusLeft
        trapFocusRight
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {/* 页签行（ScrollView header，与内容同子树——m2-S3 UP/DOWN 可达结论） */}
          <View style={styles.tabs}>
            {tabList.map((item, index) => {
              const selected = tab === item.key;
              return (
                <TvPressable
                  key={item.key}
                  focusKind="row"
                  focusable
                  hasTVPreferredFocus={index === 0}
                  style={styles.tab}
                  onPress={() => setTab(item.key)}
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.tabText, selected && { color: accent }]}>{item.label}</Text>
                  <View style={[styles.tabUnderline, selected && { backgroundColor: accent }]} />
                </TvPressable>
              );
            })}
          </View>
          {tab === 'video' && (
            <>
              <Text style={styles.label}>{tr('player.aspectTitle')}</Text>
              <View style={styles.optionRow}>
                {VIDEO_ASPECT_LIST.map((key) => (
                  <TvPressable
                    key={key}
                    focusKind="row"
                    focusable
                    style={styles.option}
                    onPress={() => onAspect(key)}
                    accessibilityLabel={aspectLabel(key)}
                    accessibilityState={{ selected: aspect === key }}
                  >
                    <Text style={[styles.optionText, aspect === key && { color: accent }]}>
                      {aspectLabel(key)}
                    </Text>
                  </TvPressable>
                ))}
              </View>
              {showResolution && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.label}>{tr('player.resolutionMenu')}</Text>
                  <View style={styles.optionRow}>
                    {tierList.map((tier) => {
                      const active = tier.key === shownActiveTier;
                      return (
                        <TvPressable
                          key={tier.key}
                          focusKind="row"
                          focusable
                          style={styles.option}
                          onPress={() => onResolution(tier.key)}
                          accessibilityLabel={tr(tier.labelKey)}
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={[styles.optionText, active && { color: accent }]}>
                            {tr(tier.labelKey)}
                          </Text>
                        </TvPressable>
                      );
                    })}
                  </View>
                </>
              )}
            </>
          )}
          {tab === 'audio' && (
            <>
              <Text style={styles.label}>{tr('player.audioMenu')}</Text>
              <View style={styles.chipColumn}>
                {audioTracks.map((track) => {
                  const active = track.streamIndex === activeAudioIndex;
                  const channelText = formatChannels(track.channels);
                  const title = track.title ?? tr('player.audioFallback', { index: track.streamIndex + 1 });
                  const suffix = [track.codec, channelText].filter(Boolean).join(', ');
                  return (
                    <TvPressable
                      key={track.streamIndex}
                      focusKind="row"
                      focusable
                      style={[styles.chip, active && { borderColor: accent }]}
                      onPress={() => onAudioSelect(track)}
                      accessibilityLabel={title}
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[styles.chipText, active && { color: accent, fontWeight: '700' }]}
                        numberOfLines={1}
                      >
                        {suffix.length > 0 ? `${title}, ${suffix}` : title}
                      </Text>
                    </TvPressable>
                  );
                })}
              </View>
              <View style={styles.divider} />
              <Text style={styles.label}>{tr('player.audioDelay')}</Text>
              <TvDelayStepper
                valueMs={audioDelayMs}
                onChange={onAudioDelay}
                label={tr('player.audioDelay')}
              />
            </>
          )}
          {tab === 'subtitle' && (
            <>
              <Text style={styles.label}>{tr('player.primarySubtitle')}</Text>
              <View style={styles.chipColumn}>
                <TvPressable
                  focusKind="row"
                  focusable
                  style={[styles.chip, activeSubtitleIndex === null && { borderColor: accent }]}
                  onPress={() => onSubtitleSelect(null)}
                  accessibilityLabel={tr('player.subtitleOff')}
                  accessibilityState={{ selected: activeSubtitleIndex === null }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      activeSubtitleIndex === null && { color: accent, fontWeight: '700' },
                    ]}
                  >
                    {tr('player.subtitleOff')}
                  </Text>
                </TvPressable>
                {subtitleTracks.map((track) => {
                  const active = track.streamIndex === activeSubtitleIndex;
                  const unavailable = !track.burnIn && track.vttUrl === undefined;
                  const badgeList = [
                    track.isDefault ? tr('player.defaultBadge') : null,
                    track.isForced ? tr('player.forcedBadge') : null,
                    track.burnIn ? tr('player.transcodeBadge') : null,
                    unavailable ? tr('player.notEmbeddableBadge') : null,
                  ].filter(Boolean);
                  const title = track.title ?? tr('player.subtitleFallback', { index: track.streamIndex + 1 });
                  return (
                    <TvPressable
                      key={track.streamIndex}
                      focusKind="row"
                      focusable={!unavailable}
                      style={[
                        styles.chip,
                        active && { borderColor: accent },
                        unavailable && styles.chipDisabled,
                      ]}
                      onPress={() => onSubtitleSelect(track)}
                      accessibilityLabel={title}
                      accessibilityState={{ selected: active, disabled: unavailable }}
                    >
                      <Text
                        style={[styles.chipText, active && { color: accent, fontWeight: '700' }]}
                        numberOfLines={1}
                      >
                        {title}
                        {badgeList.length > 0 ? ` · ${badgeList.join(' / ')}` : ''}
                      </Text>
                    </TvPressable>
                  );
                })}
              </View>
              <View style={styles.divider} />
              <Text style={styles.label}>{tr('player.subtitleDelay')}</Text>
              {subtitleDelayDisabled ? (
                <Text style={styles.notice}>{tr('player.delayUnavailable')}</Text>
              ) : null}
              <TvDelayStepper
                valueMs={subtitleDelayMs}
                onChange={onSubtitleDelay}
                disabled={subtitleDelayDisabled}
                label={tr('player.subtitleDelay')}
              />
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(18,18,18,0.92)',
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.l, paddingBottom: SPACING.xl },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: SPACING.l,
    paddingBottom: SPACING.m,
  },
  tab: { paddingHorizontal: SPACING.m, paddingVertical: SPACING.s, alignItems: 'center' },
  tabText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '600' },
  tabUnderline: { height: 3, width: '100%', borderRadius: 2, marginTop: 4 },
  label: { color: COLORS.textSecondary, fontSize: FONT_SIZE.body, marginBottom: SPACING.m },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.l },
  option: { paddingVertical: SPACING.s, paddingHorizontal: SPACING.xs, borderRadius: 6 },
  optionText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.title },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: SPACING.l },
  notice: { color: COLORS.warning, fontSize: FONT_SIZE.body - 2, marginBottom: SPACING.s },
  chipColumn: { gap: SPACING.s },
  chip: {
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.m,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  chipDisabled: { opacity: 0.45 },
  chipText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
});