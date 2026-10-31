/**
 * 音轨菜单（M3 文档 §4.8.1）：各轨（title + codec + 声道）。点选回调由页面分发：
 * 直连走 ExoPlayer selectedAudioTrack（即时生效）；转码走 switchAudioTrack（会话重启）。
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AudioTrack } from '@/adapter/model';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { formatChannels } from '@/util/format';

interface AudioTrackMenuProps {
  tracks: AudioTrack[];
  /** 当前激活轨 streamIndex */
  activeStreamIndex: number | null;
  onSelect: (track: AudioTrack) => void;
  onClose: () => void;
}

export function AudioTrackMenu({ tracks, activeStreamIndex, onSelect, onClose }: AudioTrackMenuProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>音轨</Text>
      <ScrollView style={styles.list} nestedScrollEnabled>
        {tracks.map((track) => {
          const active = track.streamIndex === activeStreamIndex;
          const channelText = formatChannels(track.channels);
          return (
            <Pressable
              key={track.streamIndex}
              style={[styles.row, active && styles.rowActive]}
              onPress={() => onSelect(track)}
            >
              <Text style={styles.rowText} numberOfLines={1}>
                {track.title ?? `音轨 ${track.streamIndex + 1}`}
              </Text>
              <View style={styles.badges}>
                {track.codec ? <Text style={styles.badgeMuted}>{track.codec}</Text> : null}
                {channelText ? <Text style={styles.badgeMuted}>{channelText}</Text> : null}
                {track.isDefault ? <Text style={styles.badge}>默认</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeText}>收起</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    right: SPACING.l,
    bottom: 72,
    width: 300,
    maxHeight: 320,
    backgroundColor: 'rgba(15,20,26,0.95)',
    borderRadius: COLORS.posterRadius,
    padding: SPACING.m,
    gap: SPACING.s,
  },
  panelTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '700' },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.s,
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.s,
    borderRadius: 8,
  },
  rowActive: { backgroundColor: 'rgba(76,141,255,0.25)' },
  rowText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body, flexShrink: 1 },
  badges: { flexDirection: 'row', gap: SPACING.xs, flexShrink: 0 },
  badge: { color: COLORS.accent, fontSize: FONT_SIZE.body - 3 },
  badgeMuted: { color: COLORS.textSecondary, fontSize: FONT_SIZE.body - 3 },
  closeButton: {
    alignItems: 'center',
    paddingVertical: SPACING.s,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  closeText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
});
