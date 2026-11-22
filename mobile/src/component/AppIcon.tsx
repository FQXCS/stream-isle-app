/**
 * 应用图标统一入口：语义名 → Phosphor 图标（线性 + 可切 fill 权重）。
 * 业务组件不要直接 import 图标族；新增图标扩展 AppIconName 与 GLYPH_MAP。
 * 图标按模块按需引入（Phosphor 全量 1500+，避免 Metro 把整包打进 bundle）。
 */
import type { Icon, IconProps, IconWeight } from 'phosphor-react-native';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { ArrowClockwise } from 'phosphor-react-native/src/icons/ArrowClockwise';
import { ArrowDown } from 'phosphor-react-native/src/icons/ArrowDown';
import { ArrowLeft } from 'phosphor-react-native/src/icons/ArrowLeft';
import { ArrowUp } from 'phosphor-react-native/src/icons/ArrowUp';
import { ArrowsDownUp } from 'phosphor-react-native/src/icons/ArrowsDownUp';
import { ArrowsLeftRight } from 'phosphor-react-native/src/icons/ArrowsLeftRight';
import { BookOpen } from 'phosphor-react-native/src/icons/BookOpen';
import { Books } from 'phosphor-react-native/src/icons/Books';
import { Broadcast } from 'phosphor-react-native/src/icons/Broadcast';
import { Broom } from 'phosphor-react-native/src/icons/Broom';
import { CaretDown } from 'phosphor-react-native/src/icons/CaretDown';
import { CaretLeft } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRight } from 'phosphor-react-native/src/icons/CaretRight';
import { CaretUp } from 'phosphor-react-native/src/icons/CaretUp';
import { Check } from 'phosphor-react-native/src/icons/Check';
import { CheckSquare } from 'phosphor-react-native/src/icons/CheckSquare';
import { CircleIcon } from 'phosphor-react-native/src/icons/Circle';
import { ClockCounterClockwise } from 'phosphor-react-native/src/icons/ClockCounterClockwise';
import { DotsSixVertical } from 'phosphor-react-native/src/icons/DotsSixVertical';
import { DotsThree } from 'phosphor-react-native/src/icons/DotsThree';
import { DownloadSimple } from 'phosphor-react-native/src/icons/DownloadSimple';
import { Equalizer } from 'phosphor-react-native/src/icons/Equalizer';
import { Eye } from 'phosphor-react-native/src/icons/Eye';
import { EyeSlash } from 'phosphor-react-native/src/icons/EyeSlash';
import { FileText } from 'phosphor-react-native/src/icons/FileText';
import { FilmReel } from 'phosphor-react-native/src/icons/FilmReel';
import { FilmSlate } from 'phosphor-react-native/src/icons/FilmSlate';
import { Flag } from 'phosphor-react-native/src/icons/Flag';
import { Folder } from 'phosphor-react-native/src/icons/Folder';
import { Folders } from 'phosphor-react-native/src/icons/Folders';
import { GameController } from 'phosphor-react-native/src/icons/GameController';
import { Gauge } from 'phosphor-react-native/src/icons/Gauge';
import { GearSix } from 'phosphor-react-native/src/icons/GearSix';
import { HardDrives } from 'phosphor-react-native/src/icons/HardDrives';
import { Headphones } from 'phosphor-react-native/src/icons/Headphones';
import { Heart } from 'phosphor-react-native/src/icons/Heart';
import { House } from 'phosphor-react-native/src/icons/House';
import { Image } from 'phosphor-react-native/src/icons/Image';
import { ImageSquare } from 'phosphor-react-native/src/icons/ImageSquare';
import { Images } from 'phosphor-react-native/src/icons/Images';
import { Info } from 'phosphor-react-native/src/icons/Info';
import { ListPlus } from 'phosphor-react-native/src/icons/ListPlus';
import { LockSimple } from 'phosphor-react-native/src/icons/LockSimple';
import { LockSimpleOpen } from 'phosphor-react-native/src/icons/LockSimpleOpen';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { Monitor } from 'phosphor-react-native/src/icons/Monitor';
import { MusicNotes } from 'phosphor-react-native/src/icons/MusicNotes';
import { Package } from 'phosphor-react-native/src/icons/Package';
import { Pause } from 'phosphor-react-native/src/icons/Pause';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { PictureInPicture } from 'phosphor-react-native/src/icons/PictureInPicture';
import { Play } from 'phosphor-react-native/src/icons/Play';
import { Plus } from 'phosphor-react-native/src/icons/Plus';
import { Queue } from 'phosphor-react-native/src/icons/Queue';
import { Radio } from 'phosphor-react-native/src/icons/Radio';
import { RadioButton } from 'phosphor-react-native/src/icons/RadioButton';
import { Repeat } from 'phosphor-react-native/src/icons/Repeat';
import { RepeatOnce } from 'phosphor-react-native/src/icons/RepeatOnce';
import { Shuffle } from 'phosphor-react-native/src/icons/Shuffle';
import { SkipBack } from 'phosphor-react-native/src/icons/SkipBack';
import { SkipForward } from 'phosphor-react-native/src/icons/SkipForward';
import { SpeakerHigh } from 'phosphor-react-native/src/icons/SpeakerHigh';
import { Square } from 'phosphor-react-native/src/icons/Square';
import { Star } from 'phosphor-react-native/src/icons/Star';
import { Stop } from 'phosphor-react-native/src/icons/Stop';
import { Subtitles } from 'phosphor-react-native/src/icons/Subtitles';
import { Sun } from 'phosphor-react-native/src/icons/Sun';
import { Television } from 'phosphor-react-native/src/icons/Television';
import { TextAa } from 'phosphor-react-native/src/icons/TextAa';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { Tray } from 'phosphor-react-native/src/icons/Tray';
import { User } from 'phosphor-react-native/src/icons/User';
import { Video } from 'phosphor-react-native/src/icons/Video';
import { VideoCamera } from 'phosphor-react-native/src/icons/VideoCamera';
import { X } from 'phosphor-react-native/src/icons/X';

export type AppIconName =
  // 导航 / 通用
  | 'back'
  | 'more'
  | 'plus'
  | 'edit'
  | 'eye'
  | 'eyeOff'
  | 'routes'
  | 'close'
  | 'check'
  | 'checkboxChecked'
  | 'checkboxUnchecked'
  | 'radioChecked'
  | 'radioUnchecked'
  | 'chevronRight'
  | 'chevronUp'
  | 'chevronDown'
  | 'arrowLeft'
  | 'arrowUp'
  | 'arrowDown'
  | 'sort'
  | 'dragHandle'
  | 'history'
  | 'account'
  | 'star'
  | 'refresh'
  | 'info'
  | 'empty'
  // 底部 Tab
  | 'home'
  | 'library'
  | 'search'
  | 'server'
  | 'settings'
  // 播放控制 / 手势
  | 'play'
  | 'pause'
  | 'stop'
  | 'skipPrevious'
  | 'skipNext'
  | 'repeat'
  | 'repeatOne'
  | 'shuffle'
  | 'playlist'
  | 'playlistPlus'
  | 'lyrics'
  | 'bitrate'
  | 'resolution'
  | 'brightness'
  | 'volume'
  | 'lock'
  | 'unlock'
  | 'pip'
  | 'rotateToLandscape'
  | 'rotateToPortrait'
  | 'snapshot'
  | 'moreGrid'
  | 'abLoop'
  | 'abLoopA'
  // 媒体 / 操作
  | 'heart'
  | 'heartOutline'
  | 'flag'
  | 'flagOutline'
  | 'download'
  | 'image'
  | 'trash'
  | 'broom'
  | 'equalizer'
  | 'video'
  | 'audio'
  | 'subtitle'
  | 'file'
  // 库类型占位
  | 'movie'
  | 'tv'
  | 'audiobook'
  | 'musicVideo'
  | 'photo'
  | 'book'
  | 'boxset'
  | 'game'
  | 'liveTv'
  | 'channel'
  | 'trailer'
  | 'folder'
  | 'mixed';

/** 语义名 → 图标组件 + 默认权重（未标注为 regular 线性） */
interface GlyphSpec {
  Glyph: Icon;
  weight?: IconWeight;
}

/** 图标库无匹配（Phosphor 无 2x2 四点），自绘注册 AppIcon：播放页右上「更多」 */
function MoreGridGlyph({ size = 24, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="7.5" cy="7.5" r="2.5" fill={color} />
      <Circle cx="16.5" cy="7.5" r="2.5" fill={color} />
      <Circle cx="7.5" cy="16.5" r="2.5" fill={color} />
      <Circle cx="16.5" cy="16.5" r="2.5" fill={color} />
    </Svg>
  );
}

/** 图标库无匹配（Phosphor 无 AB 循环），自绘注册 AppIcon：AB 字母 + 上下循环箭头 */
function AbLoopGlyph({ size = 24, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 9a8 8 0 0 1 14-3" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="M18 2.5v4h-4" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 15a8 8 0 0 1-14 3" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="M6 21.5v-4h4" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <SvgText x="12" y="14.5" textAnchor="middle" fontSize="8" fontWeight="700" fill={color}>
        AB
      </SvgText>
    </Svg>
  );
}

/** 图标库无匹配，自绘注册 AppIcon：仅设 A 点态（循环箭头 + 单 A 字母） */
function AbLoopAGlyph({ size = 24, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 9a8 8 0 0 1 14-3" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="M18 2.5v4h-4" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 15a8 8 0 0 1-14 3" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="M6 21.5v-4h4" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <SvgText x="12" y="15" textAnchor="middle" fontSize="9" fontWeight="700" fill={color}>
        A
      </SvgText>
    </Svg>
  );
}

/** 图标库无匹配（Phosphor 无「竖屏 + 横屏 + 弧形箭头」），自绘注册 AppIcon：竖屏→横屏（顺时针） */
function RotateToLandscapeGlyph({ size = 24, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 17.65H4.7A1.5 1.5 0 0 1 3.2 16.15V5.35A1.5 1.5 0 0 1 4.7 3.85H9.7A1.5 1.5 0 0 1 11.2 5.35V10.85"
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x={7.1} y={11.95} width={13.5} height={8.2} rx={1.5} stroke={color} strokeWidth={1.5} fill="none" />
      <Path d="M12.6 5.4A5.6 5.6 0 0 1 18.2 11" stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Path
        d="M16.9 8.9 18.2 11 19.5 8.9"
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 同上，横屏→竖屏（逆时针，箭头与顺时针版镜像） */
function RotateToPortraitGlyph({ size = 24, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 17.65H4.7A1.5 1.5 0 0 1 3.2 16.15V5.35A1.5 1.5 0 0 1 4.7 3.85H9.7A1.5 1.5 0 0 1 11.2 5.35V10.85"
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x={7.1} y={11.95} width={13.5} height={8.2} rx={1.5} stroke={color} strokeWidth={1.5} fill="none" />
      <Path d="M18.2 11A5.6 5.6 0 0 0 12.6 5.4" stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Path
        d="M14.4 3.9 12.6 5.4 14.4 6.9"
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const GLYPH_MAP: Record<AppIconName, GlyphSpec> = {
  back: { Glyph: CaretLeft },
  more: { Glyph: DotsThree, weight: 'bold' },
  close: { Glyph: X },
  check: { Glyph: Check, weight: 'bold' },
  checkboxChecked: { Glyph: CheckSquare, weight: 'fill' },
  checkboxUnchecked: { Glyph: Square },
  plus: { Glyph: Plus },
  edit: { Glyph: PencilSimple },
  eye: { Glyph: Eye },
  eyeOff: { Glyph: EyeSlash },
  routes: { Glyph: ArrowsLeftRight },
  radioChecked: { Glyph: RadioButton },
  radioUnchecked: { Glyph: CircleIcon },
  chevronRight: { Glyph: CaretRight },
  chevronUp: { Glyph: CaretUp },
  chevronDown: { Glyph: CaretDown },
  arrowLeft: { Glyph: ArrowLeft },
  arrowUp: { Glyph: ArrowUp },
  arrowDown: { Glyph: ArrowDown },
  sort: { Glyph: ArrowsDownUp },
  dragHandle: { Glyph: DotsSixVertical },
  history: { Glyph: ClockCounterClockwise },
  account: { Glyph: User },
  star: { Glyph: Star, weight: 'fill' },
  refresh: { Glyph: ArrowClockwise },
  info: { Glyph: Info },
  empty: { Glyph: Tray },
  home: { Glyph: House },
  library: { Glyph: Books },
  search: { Glyph: MagnifyingGlass },
  server: { Glyph: HardDrives },
  settings: { Glyph: GearSix },
  play: { Glyph: Play, weight: 'fill' },
  pause: { Glyph: Pause, weight: 'fill' },
  stop: { Glyph: Stop, weight: 'fill' },
  skipPrevious: { Glyph: SkipBack, weight: 'fill' },
  skipNext: { Glyph: SkipForward, weight: 'fill' },
  repeat: { Glyph: Repeat },
  repeatOne: { Glyph: RepeatOnce },
  shuffle: { Glyph: Shuffle },
  playlist: { Glyph: Queue },
  playlistPlus: { Glyph: ListPlus },
  lyrics: { Glyph: TextAa },
  bitrate: { Glyph: Gauge },
  resolution: { Glyph: Monitor },
  brightness: { Glyph: Sun },
  volume: { Glyph: SpeakerHigh },
  lock: { Glyph: LockSimple },
  unlock: { Glyph: LockSimpleOpen },
  pip: { Glyph: PictureInPicture },
  rotateToLandscape: { Glyph: RotateToLandscapeGlyph },
  rotateToPortrait: { Glyph: RotateToPortraitGlyph },
  snapshot: { Glyph: Image },
  moreGrid: { Glyph: MoreGridGlyph },
  abLoop: { Glyph: AbLoopGlyph },
  abLoopA: { Glyph: AbLoopAGlyph },
  heart: { Glyph: Heart, weight: 'fill' },
  heartOutline: { Glyph: Heart },
  flag: { Glyph: Flag, weight: 'fill' },
  flagOutline: { Glyph: Flag },
  download: { Glyph: DownloadSimple },
  image: { Glyph: ImageSquare },
  trash: { Glyph: Trash },
  broom: { Glyph: Broom },
  equalizer: { Glyph: Equalizer },
  video: { Glyph: Video },
  audio: { Glyph: MusicNotes },
  subtitle: { Glyph: Subtitles },
  file: { Glyph: FileText },
  movie: { Glyph: FilmSlate },
  tv: { Glyph: Television },
  audiobook: { Glyph: Headphones },
  musicVideo: { Glyph: VideoCamera },
  photo: { Glyph: Images },
  book: { Glyph: BookOpen },
  boxset: { Glyph: Package },
  game: { Glyph: GameController },
  liveTv: { Glyph: Broadcast },
  channel: { Glyph: Radio },
  trailer: { Glyph: FilmReel },
  folder: { Glyph: Folder },
  mixed: { Glyph: Folders },
};

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
  /** 覆盖默认权重（如底部 Tab 选中态传 fill） */
  weight?: IconWeight;
}

export function AppIcon({ name, size = 24, color = '#FFFFFF', weight }: AppIconProps) {
  const { Glyph, weight: defaultWeight } = GLYPH_MAP[name];
  return <Glyph size={size} color={color} weight={weight ?? defaultWeight ?? 'regular'} />;
}
