/**
 * 应用图标统一入口：语义名 → Phosphor 图标（线性 + 可切 fill 权重）。
 * 业务组件不要直接 import 图标族；新增图标扩展 AppIconName 与 GLYPH_MAP。
 * 图标按模块按需引入（Phosphor 全量 1500+，避免 Metro 把整包打进 bundle）。
 */
import type { Icon, IconWeight } from 'phosphor-react-native';
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
  // 媒体 / 操作
  | 'heart'
  | 'heartOutline'
  | 'flag'
  | 'flagOutline'
  | 'download'
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

const GLYPH_MAP: Record<AppIconName, GlyphSpec> = {
  back: { Glyph: CaretLeft },
  more: { Glyph: DotsThree, weight: 'bold' },
  close: { Glyph: X },
  check: { Glyph: Check, weight: 'bold' },
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
  heart: { Glyph: Heart, weight: 'fill' },
  heartOutline: { Glyph: Heart },
  flag: { Glyph: Flag, weight: 'fill' },
  flagOutline: { Glyph: Flag },
  download: { Glyph: DownloadSimple },
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
