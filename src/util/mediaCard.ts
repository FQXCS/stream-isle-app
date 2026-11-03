/**
 * 条目卡片图幅与占位图标（媒体库融合页每库行）：
 * 图幅参照 Emby Web 口径——卡片宽高比跟随条目类型的主图比例：
 * 电影/剧集/图书/合集等为 2:3 海报；单集/家庭视频/预告片/音乐视频等为 16:9 视频帧；
 * 专辑/歌曲/相册/照片/游戏等为 1:1 方形封面。未知类型按海报（2:3）处理。
 * 无封面时按同一类型映射到图标库占位（不写死文件名）。
 */
import type { MediaItemTypeEnum } from '@/adapter/model';
import type { AppIconName } from '@/component/AppIcon';

/** 海报宽高比（2:3） */
const POSTER_ASPECT_RATIO = 2 / 3;

/** 视频帧宽高比（16:9） */
const VIDEO_ASPECT_RATIO = 16 / 9;

/** 方形封面宽高比（1:1） */
const SQUARE_ASPECT_RATIO = 1;

/** 条目类型 → 卡片宽高比（width / height） */
export function cardAspectRatioOf(type: MediaItemTypeEnum): number {
  switch (type) {
    case 'Episode':
    case 'Video':
    case 'MusicVideo':
    case 'Trailer':
    case 'Program':
      return VIDEO_ASPECT_RATIO;
    case 'MusicAlbum':
    case 'MusicArtist':
    case 'Audio':
    case 'PhotoAlbum':
    case 'Photo':
    case 'Game':
    case 'Channel':
    case 'TvChannel':
      return SQUARE_ASPECT_RATIO;
    default:
      return POSTER_ASPECT_RATIO;
  }
}

/** 条目类型 → 无封面时的占位图标（语义名走 AppIcon） */
const MEDIA_ICON_MAP: Record<MediaItemTypeEnum, AppIconName> = {
  Movie: 'movie',
  Series: 'tv',
  Season: 'tv',
  Episode: 'tv',
  Person: 'account',
  MusicAlbum: 'audio',
  MusicArtist: 'account',
  Audio: 'audio',
  Playlist: 'playlist',
  PhotoAlbum: 'photo',
  Photo: 'photo',
  Video: 'video',
  Book: 'book',
  Folder: 'folder',
  Trailer: 'trailer',
  MusicVideo: 'musicVideo',
  BoxSet: 'boxset',
  Game: 'game',
  GameSystem: 'game',
  Channel: 'channel',
  Program: 'liveTv',
  TvChannel: 'liveTv',
  Recording: 'liveTv',
  Timer: 'liveTv',
  SeriesTimer: 'liveTv',
  Genre: 'file',
  Studio: 'file',
};

/** 条目类型 → 占位图标（无封面时使用，右侧/居中显示） */
export function mediaIconOf(type: MediaItemTypeEnum): AppIconName {
  return MEDIA_ICON_MAP[type];
}
