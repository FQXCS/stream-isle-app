/**
 * expo-playback-gestures TS 出口（M2 文档 §4.8）：Promise 化四个方法。
 * 亮度调 Activity 窗口亮度（0..1；传负值恢复跟随系统 BRIGHTNESS_OVERRIDE_NONE）；
 * 音量调媒体流（STREAM_MUSIC，0..1 折算）。
 */
import { requireNativeModule } from 'expo-modules-core';

/** 原生模块方法形态（与 PlaybackGesturesModule.kt 定义一致） */
interface PlaybackGesturesModuleType {
  /** 设置窗口亮度（0..1；传负值恢复跟随系统） */
  setWindowBrightness(value: number): Promise<void>;
  /** 读窗口亮度（0..1；-1 表示跟随系统） */
  getWindowBrightness(): Promise<number>;
  /** 设置媒体音量（0..1，内部按 maxStreamVolume 折算，不带 FLAG_SHOW_UI） */
  setMusicVolume(volume: number): Promise<void>;
  /** 读媒体音量（0..1） */
  getMusicVolume(): Promise<number>;
}

export default requireNativeModule<PlaybackGesturesModuleType>('ExpoPlaybackGestures');
