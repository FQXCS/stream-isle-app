/**
 * 详情页「音视频字幕信息」与「文件信息」卡（M8 参考稿增量）：
 * 数据取自详情 MediaSources[0].MediaStreams（adapter 已翻译为 video/audio/subtitleStreamList）；
 * 横向滚动信息卡，逐行展示服务器下发的技术字段，缺失字段不渲染。
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type {
  AudioStreamInfo,
  MediaDetail,
  SubtitleStreamInfo,
  VideoStreamInfo,
} from '@/adapter/model';
import { AppIcon, type AppIconName } from '@/component/AppIcon';
import { useTheme } from '@/component/useTheme';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import { useT, type MessageKey, type TFunction } from '@/i18n';

interface InfoRow {
  /** 字段名文案 key（渲染时经 useT 翻译，语言切换即时生效） */
  label: MessageKey;
  value: string;
}

/** 追加一行（undefined/空串跳过，避免信息卡出现空值行） */
function pushRow(
  rowList: InfoRow[],
  label: MessageKey,
  value: string | number | undefined
): void {
  if (value === undefined || value === '') {
    return;
  }
  rowList.push({ label, value: String(value) });
}

/** 比特率 → "280 kbps" */
function formatBitrate(bitrateBps: number | undefined): string | undefined {
  return bitrateBps === undefined ? undefined : `${Math.round(bitrateBps / 1000)} kbps`;
}

function yesNo(value: boolean | undefined, tr: TFunction): string | undefined {
  return value === undefined ? undefined : value ? tr('mediaInfo.yes') : tr('mediaInfo.no');
}

function videoRowList(stream: VideoStreamInfo, tr: TFunction): InfoRow[] {
  const rowList: InfoRow[] = [];
  pushRow(rowList, 'mediaInfo.streamTitle', stream.title);
  pushRow(rowList, 'mediaInfo.codec', stream.codec);
  pushRow(rowList, 'mediaInfo.profile', stream.profile);
  pushRow(rowList, 'mediaInfo.level', stream.level);
  pushRow(
    rowList,
    'mediaInfo.resolution',
    stream.width !== undefined && stream.height !== undefined
      ? `${stream.width}x${stream.height}`
      : undefined
  );
  pushRow(rowList, 'mediaInfo.aspectRatio', stream.aspectRatio);
  pushRow(rowList, 'mediaInfo.interlaced', yesNo(stream.isInterlaced, tr));
  pushRow(
    rowList,
    'mediaInfo.frameRate',
    stream.frameRate === undefined ? undefined : stream.frameRate.toFixed(3)
  );
  pushRow(rowList, 'mediaInfo.bitrate', formatBitrate(stream.bitrateBps));
  pushRow(rowList, 'mediaInfo.videoRange', stream.videoRange);
  pushRow(rowList, 'mediaInfo.colorSpace', stream.colorSpace);
  pushRow(
    rowList,
    'mediaInfo.bitDepth',
    stream.bitDepth === undefined ? undefined : `${stream.bitDepth} bit`
  );
  pushRow(rowList, 'mediaInfo.pixelFormat', stream.pixelFormat);
  pushRow(rowList, 'mediaInfo.refFrames', stream.refFrames);
  return rowList;
}

function audioRowList(stream: AudioStreamInfo, tr: TFunction): InfoRow[] {
  const rowList: InfoRow[] = [];
  pushRow(rowList, 'mediaInfo.streamTitle', stream.title);
  pushRow(rowList, 'mediaInfo.codec', stream.codec);
  pushRow(rowList, 'mediaInfo.profile', stream.profile);
  pushRow(rowList, 'mediaInfo.channelLayout', stream.channelLayout);
  pushRow(
    rowList,
    'mediaInfo.channels',
    stream.channels === undefined ? undefined : `${stream.channels} ch`
  );
  pushRow(rowList, 'mediaInfo.sampleRate', stream.sampleRate);
  pushRow(rowList, 'mediaInfo.bitrate', formatBitrate(stream.bitrateBps));
  pushRow(rowList, 'mediaInfo.default', yesNo(stream.isDefault, tr));
  return rowList;
}

function subtitleRowList(stream: SubtitleStreamInfo, tr: TFunction): InfoRow[] {
  const rowList: InfoRow[] = [];
  pushRow(rowList, 'mediaInfo.streamTitle', stream.title);
  pushRow(rowList, 'mediaInfo.language', stream.language);
  pushRow(rowList, 'mediaInfo.format', stream.format);
  pushRow(
    rowList,
    'mediaInfo.type',
    stream.isExternal === undefined
      ? undefined
      : stream.isExternal
        ? tr('mediaInfo.external')
        : tr('mediaInfo.embedded')
  );
  pushRow(rowList, 'mediaInfo.default', yesNo(stream.isDefault, tr));
  pushRow(rowList, 'mediaInfo.forced', yesNo(stream.isForced, tr));
  return rowList;
}

interface StreamCardProps {
  icon: AppIconName;
  title: string;
  rowList: InfoRow[];
}

function StreamCard({ icon, title, rowList }: StreamCardProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <AppIcon name={icon} size={16} color={t.textSecondary} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {rowList.map((row) => (
        <Text key={row.label} style={styles.rowText}>
          <Text style={styles.rowLabel}>{tr(row.label)}: </Text>
          {row.value}
        </Text>
      ))}
    </View>
  );
}

interface MediaInfoSectionProps {
  detail: MediaDetail;
}

export function MediaInfoSection({ detail }: MediaInfoSectionProps) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const source = detail.mediaSourceList[0];
  if (source === undefined) {
    return null;
  }
  const videoList = source.videoStreamList ?? [];
  const audioList = source.audioStreamList ?? [];
  const subtitleList = source.subtitleStreamList ?? [];
  if (videoList.length + audioList.length + subtitleList.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{tr('mediaInfo.title')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardRow}
      >
        {videoList.map((stream) => (
          <StreamCard
            key={`video-${stream.index}`}
            icon="video"
            title={tr('mediaInfo.videoStream')}
            rowList={videoRowList(stream, tr)}
          />
        ))}
        {audioList.map((stream) => (
          <StreamCard
            key={`audio-${stream.index}`}
            icon="audio"
            title={tr('mediaInfo.audioStream')}
            rowList={audioRowList(stream, tr)}
          />
        ))}
        {subtitleList.map((stream) => (
          <StreamCard
            key={`subtitle-${stream.index}`}
            icon="subtitle"
            title={tr('mediaInfo.subtitleStream')}
            rowList={subtitleRowList(stream, tr)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

interface MediaFileCardProps {
  path: string;
  metaText: string;
}

/** 文件信息卡（参考稿底部：服务器文件路径 + 时长/大小/规格） */
export function MediaFileCard({ path, metaText }: MediaFileCardProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <View style={styles.fileCard}>
      <Text style={styles.filePath} numberOfLines={2}>
        {path}
      </Text>
      {metaText !== '' && <Text style={styles.fileMeta}>{metaText}</Text>}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    section: { marginTop: SPACING.l },
    sectionTitle: {
      color: t.textPrimary,
      fontSize: FONT_SIZE.section,
      fontWeight: '700',
      letterSpacing: -0.2,
      paddingHorizontal: SPACING.l,
      marginBottom: SPACING.s,
    },
    cardRow: { paddingHorizontal: SPACING.l, gap: SPACING.m },
    card: {
      width: 236,
      borderRadius: POSTER_RADIUS,
      backgroundColor: t.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.separator,
      padding: SPACING.m,
      gap: SPACING.xs,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    cardTitle: { color: t.textPrimary, fontSize: FONT_SIZE.body, fontWeight: '600' },
    rowText: { color: t.textPrimary, fontSize: FONT_SIZE.body - 2, lineHeight: 20 },
    rowLabel: { color: t.textSecondary },
    fileCard: {
      marginHorizontal: SPACING.l,
      marginTop: SPACING.xl,
      padding: SPACING.l,
      borderRadius: POSTER_RADIUS,
      backgroundColor: t.surface,
      gap: SPACING.xs,
      alignItems: 'center',
    },
    filePath: {
      color: t.textSecondary,
      fontSize: FONT_SIZE.body - 1,
      lineHeight: 20,
      textAlign: 'center',
    },
    fileMeta: {
      color: t.textTertiary,
      fontSize: FONT_SIZE.body - 2,
      textAlign: 'center',
    },
  });
