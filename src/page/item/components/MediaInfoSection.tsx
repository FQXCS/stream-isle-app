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

interface InfoRow {
  label: string;
  value: string;
}

/** 追加一行（undefined/空串跳过，避免信息卡出现空值行） */
function pushRow(rowList: InfoRow[], label: string, value: string | number | undefined): void {
  if (value === undefined || value === '') {
    return;
  }
  rowList.push({ label, value: String(value) });
}

/** 比特率 → "280 kbps" */
function formatBitrate(bitrateBps: number | undefined): string | undefined {
  return bitrateBps === undefined ? undefined : `${Math.round(bitrateBps / 1000)} kbps`;
}

function yesNo(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : value ? '是' : '否';
}

function videoRowList(stream: VideoStreamInfo): InfoRow[] {
  const rowList: InfoRow[] = [];
  pushRow(rowList, '标题', stream.title);
  pushRow(rowList, '编码', stream.codec);
  pushRow(rowList, '配置文件', stream.profile);
  pushRow(rowList, '等级', stream.level);
  pushRow(
    rowList,
    '分辨率',
    stream.width !== undefined && stream.height !== undefined
      ? `${stream.width}x${stream.height}`
      : undefined
  );
  pushRow(rowList, '宽高比', stream.aspectRatio);
  pushRow(rowList, '隔行扫描', yesNo(stream.isInterlaced));
  pushRow(rowList, '帧率', stream.frameRate === undefined ? undefined : stream.frameRate.toFixed(3));
  pushRow(rowList, '比特率', formatBitrate(stream.bitrateBps));
  pushRow(rowList, '视频范围', stream.videoRange);
  pushRow(rowList, '色域', stream.colorSpace);
  pushRow(rowList, '位深度', stream.bitDepth === undefined ? undefined : `${stream.bitDepth} bit`);
  pushRow(rowList, '像素格式', stream.pixelFormat);
  pushRow(rowList, '参考帧', stream.refFrames);
  return rowList;
}

function audioRowList(stream: AudioStreamInfo): InfoRow[] {
  const rowList: InfoRow[] = [];
  pushRow(rowList, '标题', stream.title);
  pushRow(rowList, '编码', stream.codec);
  pushRow(rowList, '配置文件', stream.profile);
  pushRow(rowList, '声道布局', stream.channelLayout);
  pushRow(rowList, '声道数', stream.channels === undefined ? undefined : `${stream.channels} ch`);
  pushRow(rowList, '采样率', stream.sampleRate);
  pushRow(rowList, '比特率', formatBitrate(stream.bitrateBps));
  pushRow(rowList, '默认', yesNo(stream.isDefault));
  return rowList;
}

function subtitleRowList(stream: SubtitleStreamInfo): InfoRow[] {
  const rowList: InfoRow[] = [];
  pushRow(rowList, '标题', stream.title);
  pushRow(rowList, '语言', stream.language);
  pushRow(rowList, '格式', stream.format);
  pushRow(rowList, '类型', stream.isExternal === undefined ? undefined : stream.isExternal ? '外挂' : '内嵌');
  pushRow(rowList, '默认', yesNo(stream.isDefault));
  pushRow(rowList, '强制', yesNo(stream.isForced));
  return rowList;
}

interface StreamCardProps {
  icon: AppIconName;
  title: string;
  rowList: InfoRow[];
}

function StreamCard({ icon, title, rowList }: StreamCardProps) {
  const t = useTheme();
  const styles = createStyles(t);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <AppIcon name={icon} size={16} color={t.textSecondary} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {rowList.map((row) => (
        <Text key={row.label} style={styles.rowText}>
          <Text style={styles.rowLabel}>{row.label}: </Text>
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
      <Text style={styles.sectionTitle}>音视频字幕信息</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardRow}
      >
        {videoList.map((stream) => (
          <StreamCard
            key={`video-${stream.index}`}
            icon="video"
            title="视频"
            rowList={videoRowList(stream)}
          />
        ))}
        {audioList.map((stream) => (
          <StreamCard
            key={`audio-${stream.index}`}
            icon="audio"
            title="音频"
            rowList={audioRowList(stream)}
          />
        ))}
        {subtitleList.map((stream) => (
          <StreamCard
            key={`subtitle-${stream.index}`}
            icon="subtitle"
            title="字幕"
            rowList={subtitleRowList(stream)}
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
      fontSize: FONT_SIZE.title,
      fontWeight: '600',
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
