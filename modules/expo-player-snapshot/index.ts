/**
 * expo-player-snapshot TS 出口：播放页截图（PixelCopy 抓 ExoPlayer SurfaceView 当前帧）。
 * 返回 cacheDir 下 PNG 绝对路径，JS 侧经 PhotoService.saveFileToGallery 入系统相册后删除。
 */
import { requireNativeModule } from 'expo-modules-core';

/** 原生模块方法形态（与 PlayerSnapshotModule.kt 定义一致） */
interface PlayerSnapshotModuleType {
  /** 抓取当前播放帧，resolve PNG 文件绝对路径；无播放画面/抓帧失败 reject */
  capture(): Promise<string>;
}

export default requireNativeModule<PlayerSnapshotModuleType>('ExpoPlayerSnapshot');