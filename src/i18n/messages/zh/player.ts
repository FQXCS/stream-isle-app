/**
 * 播放器/正在播放/照片/阅读器与音频服务领域文案（zh 真源）。
 * 维护范围：page/player、page/nowplaying、page/photo、page/reader、service 音频播放、util/format。
 */
import type { Message } from '@/i18n/types';

export const zhPlayer = {
  // —— 播放器控制层 ——
  'player.lockScreen': '锁定屏幕',
  'player.unlock': '解锁',
  'player.play': '播放',
  'player.pause': '暂停',
  'player.subtitleMenu': '字幕',
  'player.audioMenu': '音轨',
  'player.resolutionMenu': '转码分辨率',
  'player.playQueue': '播放队列',
  'player.subtitleOff': '关闭',
  'player.subtitleFallback': '字幕 {index}',
  'player.audioFallback': '音轨 {index}',
  'player.defaultBadge': '默认',
  'player.forcedBadge': '强制',
  'player.transcodeBadge': '需转码',
  'player.notEmbeddableBadge': '不可外挂',
  'player.currentBadge': '当前',
  'player.collapse': '收起',
  'player.cellularForced': '蜂窝网络 · 已自动降至 480p',

  // —— 播放器状态、错误与提示 ——
  'player.errorTranscode': '转码播放失败，请重试',
  'player.errorPlayback': '播放出错，请重试',
  'player.exitPlayback': '退出播放',
  'player.switchFailed': '切换失败，请重新播放',
  'player.directResolutionNotice': '直连播放不受分辨率限制，设置将在下次会话生效',
  'player.hudSeek': '{delta}（{position}）',
  'player.episodeTitle': '第 {index} 集 {name}',

  // —— 播放模式 ——
  'player.mode.queue': '列表循环',
  'player.mode.shuffle': '随机播放',
  'player.mode.track': '单曲循环',

  // —— 正在播放页 ——
  'nowPlaying.title': '正在播放',
  'nowPlaying.collapse': '收起播放页',
  'nowPlaying.more': '更多操作',
  'nowPlaying.empty': '当前没有播放中的歌曲',
  'nowPlaying.previousTrack': '上一首',
  'nowPlaying.nextTrack': '下一首',
  'nowPlaying.download': '下载',
  'nowPlaying.delete': '删除',
  'nowPlaying.detail': '详情',
  'nowPlaying.downloadQueued': '已加入下载队列：{name}',
  'nowPlaying.deleteTitle': '删除媒体',
  'nowPlaying.deleteMessage': '确定从服务器删除「{name}」吗？此操作不可撤销。',
  'nowPlaying.deleted': '已删除',
  'nowPlaying.lyricsLoading': '歌词加载中…',
  'nowPlaying.noLyrics': '暂无歌词',
  'nowPlaying.collapseQueue': '收起队列',

  // —— 播放队列面板 ——
  'queue.title': '{mode}（{count} 首）',
  'queue.modeA11y': '播放模式：{mode}，点击切换',
  'queue.clear': '清空队列',
  'queue.clearTitle': '清空队列',
  'queue.clearMessage': '将移除当前歌曲以外的队列歌曲，当前播放不中断。',
  'queue.clearAction': '清空',
  'queue.empty': '队列为空',
  'queue.removeA11y': '从队列移除{title}',
  'queue.collapseSheet': '收起播放队列',

  // —— 迷你播放条 ——
  'mini.openNowPlaying': '打开正在播放',
  'mini.a11y': '{title}，打开正在播放；左滑下一首，右滑上一首',
  'mini.a11yWithArtist': '{title}，{artist}，打开正在播放；左滑下一首，右滑上一首',
  'mini.stop': '停止播放并关闭迷你条',

  // —— 音频服务 ——
  'audio.alreadyInQueue': '歌曲已在播放队列中',
  'audio.addedToQueue': '已添加至播放队列',

  // —— 照片查看器 ——
  'photo.saved': '已保存到 Stream Isle 相册',
  'photo.viewOriginal': '查看原图',
  'photo.viewScaled': '看缩放图',
  'photo.save': '保存到本地相册',
  'photo.originalBadge': '原图',
  'photo.pageLoaded': '{index} / 已加载 {loaded}',
  'photo.loadingMore': ' · 加载中…',
  'photo.empty': '暂无照片',
  'photo.folderEmpty': '文件夹为空',
  'photo.videoEmpty': '暂无视频',

  // —— 阅读器 ——
  'reader.modeVertical': '上下滑动',
  'reader.modeHorizontal': '左右翻页',
  'reader.modeA11y': '翻页方式：{mode}',
  'reader.loading': '正在加载',
  'reader.loadingPercent': '正在加载 {percent}%',

  // —— 时长与相对时间格式化 ——
  'format.runtimeHoursMinutes': ({ hours, minutes }) => `${hours}小时${minutes}分钟`,
  'format.runtimeHours': ({ hours }) => `${hours}小时`,
  'format.runtimeMinutes': ({ minutes }) => `${minutes}分钟`,
  'format.justNow': '刚刚',
  'format.minutesAgo': ({ count }) => `${count}分钟前`,
  'format.hoursAgo': ({ count }) => `${count}小时前`,
  'format.daysAgo': ({ count }) => `${count}天前`,
} as const satisfies Record<string, Message>;

export type PlayerMessageKey = keyof typeof zhPlayer;
