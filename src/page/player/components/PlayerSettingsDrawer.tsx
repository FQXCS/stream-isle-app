/**
 * 播放设置抽屉（参考图口径）：右上「更多」打开右侧半透面板，顶三页签 视频/音频/字幕。
 * 视频页：屏幕宽高比五档 + 转码分辨率（仅转码会话）+ 自动跳过片头片尾开关与秒数步进；
 * 音频页：音轨芯片单选；字幕页：主字幕芯片（含禁用与不可外挂置灰）。
 * 点面板外 scrim 关闭；选择芯片不关闭面板（连续调整）。
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useImmersiveAccent } from '@/component/useTheme';
import type { AudioTrack, SubtitleTrack } from '@/adapter/model';
import type { ResolutionTierKey } from '@/constant/resolution';
import { VIDEO_ASPECT_LIST, type VideoAspectKey } from '@/constant/playback';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useT } from '@/i18n';
import { formatChannels } from '@/util/format';
import { availableResolutionTiers, normalizeResolutionTierForSource } from '@/util/resolution';

type DrawerTab = 'video' | 'audio' | 'subtitle';

interface PlayerSettingsDrawerProps {
  onClose: () => void;
  aspect: VideoAspectKey;
  onAspect: (aspect: VideoAspectKey) => void;
  /** 转码分辨率区可见性（仅服务器转码会话） */
  showResolution: boolean;
  activeTier: ResolutionTierKey;
  sourceHeight?: number;
  cellularForced: boolean;
  onResolution: (tier: ResolutionTierKey) => void;
  audioTracks: AudioTrack[];
  activeAudioIndex: number | null;
  onAudioSelect: (track: AudioTrack) => void;
  subtitleTracks: SubtitleTrack[];
  activeSubtitleIndex: number | null;
  onSubtitleSelect: (track: SubtitleTrack | null) => void;
}

export function PlayerSettingsDrawer({
  onClose,
  aspect,
  onAspect,
  showResolution,
  activeTier,
  sourceHeight,
  cellularForced,
  onResolution,
  audioTracks,
  activeAudioIndex,
  onAudioSelect,
  subtitleTracks,
  activeSubtitleIndex,
  onSubtitleSelect,
}: PlayerSettingsDrawerProps) {
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
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={tr('player.collapse')} />
      <View style={[styles.panel, { width: panelWidth }]}>
        <View style={styles.tabs}>
          {tabList.map((item) => (
            <Pressable
              key={item.key}
              style={styles.tab}
              onPress={() => setTab(item.key)}
              accessibilityLabel={item.label}
            >
              <Text style={[styles.tabText, tab === item.key && { color: accent }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {tab === 'video' && (
            <>
              <Text style={styles.label}>{tr('player.aspectTitle')}</Text>
              <View style={styles.optionRow}>
                {VIDEO_ASPECT_LIST.map((key) => (
                  <Pressable
                    key={key}
                    style={styles.option}
                    onPress={() => onAspect(key)}
                    accessibilityLabel={aspectLabel(key)}
                  >
                    <Text style={[styles.optionText, aspect === key && { color: accent }]}>
                      {aspectLabel(key)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {showResolution && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.label}>{tr('player.resolutionMenu')}</Text>
                  {cellularForced ? <Text style={styles.notice}>{tr('player.cellularForced')}</Text> : null}
                  {/* 与宽高比同款横排文字选项（选中主题色），不用芯片块 */}
                  <View style={styles.optionRow}>
                    {tierList.map((tier) => {
                      const active = tier.key === shownActiveTier;
                      return (
                        <Pressable
                          key={tier.key}
                          style={styles.option}
                          onPress={() => onResolution(tier.key)}
                          accessibilityLabel={tr(tier.labelKey)}
                        >
                          <Text style={[styles.optionText, active && { color: accent }]}>
                            {tr(tier.labelKey)}
                          </Text>
                        </Pressable>
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
                    <Pressable
                      key={track.streamIndex}
                      style={[styles.chip, active && { backgroundColor: accent }]}
                      onPress={() => onAudioSelect(track)}
                      accessibilityLabel={title}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                        {suffix.length > 0 ? `${title}, ${suffix}` : title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          {tab === 'subtitle' && (
            <>
              <Text style={styles.label}>{tr('player.primarySubtitle')}</Text>
              <View style={styles.chipColumn}>
                <Pressable
                  style={[styles.chip, activeSubtitleIndex === null && { backgroundColor: accent }]}
                  onPress={() => onSubtitleSelect(null)}
                  accessibilityLabel={tr('player.subtitleOff')}
                >
                  <Text
                    style={[
                      styles.chipText,
                      activeSubtitleIndex === null && styles.chipTextActive,
                    ]}
                  >
                    {tr('player.subtitleOff')}
                  </Text>
                </Pressable>
                {subtitleTracks.map((track) => {
                  const active = track.streamIndex === activeSubtitleIndex;
                  const unavailable = !track.burnIn && track.vttUrl === undefined;
                  const badgeList = [
                    track.isDefault ? tr('player.defaultBadge') : null,
                    track.isForced ? tr('player.forcedBadge') : null,
                    track.burnIn ? tr('player.transcodeBadge') : null,
                    unavailable ? tr('player.notEmbeddableBadge') : null,
                  ].filter(Boolean);
                  return (
                    <Pressable
                      key={track.streamIndex}
                      style={[
                        styles.chip,
                        active && { backgroundColor: accent },
                        unavailable && styles.chipDisabled,
                      ]}
                      disabled={unavailable}
                      onPress={() => onSubtitleSelect(track)}
                      accessibilityLabel={track.title ?? tr('player.subtitleFallback', { index: track.streamIndex + 1 })}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                        {track.title ?? tr('player.subtitleFallback', { index: track.streamIndex + 1 })}
                        {badgeList.length > 0 ? ` · ${badgeList.join(' / ')}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
    backgroundColor: 'rgba(18,18,18,0.88)',
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: SPACING.l,
    paddingBottom: SPACING.m,
  },
  tab: { paddingHorizontal: SPACING.m, paddingVertical: SPACING.s },
  tabText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.l, paddingBottom: SPACING.xl },
  label: { color: COLORS.textSecondary, fontSize: FONT_SIZE.body, marginBottom: SPACING.m },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.l },
  option: { paddingVertical: SPACING.s },
  optionText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.title },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: SPACING.l },
  notice: { color: COLORS.warning, fontSize: FONT_SIZE.body - 2, marginBottom: SPACING.s },
  chipColumn: { gap: SPACING.s },
  chip: {
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.m,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  chipDisabled: { opacity: 0.45 },
  chipText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
  chipTextActive: { color: '#FFFFFF', fontWeight: '700' },
});