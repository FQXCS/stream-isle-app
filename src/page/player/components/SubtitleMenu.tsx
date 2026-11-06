/**
 * 字幕菜单（M3 文档 §4.8.1）：「关闭」+ 各轨（title + 「默认/强制」角标；burnIn 轨带
 * 「需转码」徽标）。点文本轨/关闭 → switchSubtitle 返回 null 纯客户端切换；点烧录轨 →
 * 重启流程（由页面的 onSelect 统一走 switchSubtitle）。当前激活高亮。
 * 非烧录且 vttUrl 缺失（DeliveryMethod 缺省/Embed）的轨禁用并标注「不可外挂」——
 * 服务器未判外挂、客户端无 URL 可注入播放器，点选会造成「高亮已选而画面无字幕」。
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useImmersiveAccent } from '@/component/useTheme';
import type { SubtitleTrack } from '@/adapter/model';
import { COLORS, FONT_SIZE, SPACING } from '@/constant/theme';
import { useT } from '@/i18n';

interface SubtitleMenuProps {
  /** session.subtitleList（全部轨，含烧录轨） */
  tracks: SubtitleTrack[];
  /** 当前激活轨 streamIndex（null=未开启） */
  activeStreamIndex: number | null;
  /** 选择回调；null=关闭字幕（烧录轨经页面 switchSubtitle 触发重启） */
  onSelect: (track: SubtitleTrack | null) => void;
  onClose: () => void;
}

export function SubtitleMenu({ tracks, activeStreamIndex, onSelect, onClose }: SubtitleMenuProps) {
  const { accent, accentSoft } = useImmersiveAccent();
  const tr = useT();
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{tr('player.subtitleMenu')}</Text>
      <ScrollView style={styles.list} nestedScrollEnabled>
        <Pressable
          style={[styles.row, activeStreamIndex === null && { backgroundColor: accentSoft }]}
          onPress={() => onSelect(null)}
        >
          <Text style={styles.rowText}>{tr('player.subtitleOff')}</Text>
        </Pressable>
        {tracks.map((track) => {
          const active = track.streamIndex === activeStreamIndex;
          // 非烧录且无 vttUrl：服务器未判外挂（DeliveryMethod 缺省/Embed），禁用防误选
          const unavailable = !track.burnIn && track.vttUrl === undefined;
          return (
            <Pressable
              key={track.streamIndex}
              style={[styles.row, active && { backgroundColor: accentSoft }, unavailable && styles.rowDisabled]}
              disabled={unavailable}
              onPress={() => onSelect(track)}
            >
              <Text
                style={[styles.rowText, unavailable && styles.rowTextDisabled]}
                numberOfLines={1}
              >
                {track.title ?? tr('player.subtitleFallback', { index: track.streamIndex + 1 })}
              </Text>
              <View style={styles.badges}>
                {track.isDefault ? (
                  <Text style={[styles.badge, { color: accent }]}>{tr('player.defaultBadge')}</Text>
                ) : null}
                {track.isForced ? (
                  <Text style={[styles.badge, { color: accent }]}>{tr('player.forcedBadge')}</Text>
                ) : null}
                {track.burnIn ? (
                  <Text style={[styles.badge, styles.badgeBurnIn]}>{tr('player.transcodeBadge')}</Text>
                ) : null}
                {track.format ? <Text style={styles.badgeMuted}>{track.format}</Text> : null}
                {unavailable ? (
                  <Text style={styles.badgeMuted}>{tr('player.notEmbeddableBadge')}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeText}>{tr('player.collapse')}</Text>
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
  rowDisabled: { opacity: 0.45 },
  rowText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body, flexShrink: 1 },
  rowTextDisabled: { color: COLORS.textSecondary },
  badges: { flexDirection: 'row', gap: SPACING.xs, flexShrink: 0 },
  badge: { fontSize: FONT_SIZE.body - 3 },
  badgeBurnIn: { color: COLORS.warning },
  badgeMuted: { color: COLORS.textSecondary, fontSize: FONT_SIZE.body - 3 },
  closeButton: {
    alignItems: 'center',
    paddingVertical: SPACING.s,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  closeText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.body },
});
