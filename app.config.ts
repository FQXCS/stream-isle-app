/**
 * Expo 应用配置（M1 文档 §4.1：其余字段用默认，仅此处列出的关键项显式声明）。
 * 应用名 / 图标 / 包名均为占位（设计文档 §14.3 开放问题，M6 打包前评审定稿）。
 */
import type { ConfigPlugin } from '@expo/config-plugins';
import { withAndroidManifest } from '@expo/config-plugins';

// CJS .js 插件（expo 配置加载器只转译 app.config.ts 入口本身，require 的模块须为 js）
import withStreamIsleNetwork from './plugins/withStreamIsleNetwork.js';

/**
 * 为 AndroidManifest 的 <application> 补 android:usesCleartextTraffic="true"。
 * M1 文档 §4.1 原本依赖 android.usesCleartextTraffic 配置字段，但 SDK 58 工具链已无任何
 * 内置插件应用该字段（manifest 模板也不含对应占位符），明文 http 服务器将连不上（§7 风险 3），
 * 故以本地 plugin 由 app.config.ts 驱动——重新 prebuild 自动恢复（§4.11 同款要求）。
 */
const withCleartextTraffic: ConfigPlugin = (config) =>
  withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application?.$) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });

/**
 * M2：MainActivity 方向落 fullSensor（播放页运行时锁横屏的前提）。
 * SDK 58 prebuild 对 android.screenOrientation: "all" 不再映射 fullSensor（重放后落
 * portrait，M5 第 1 步实测），故以 manifest plugin 显式保证——重新 prebuild 自动恢复。
 */
const withFullSensorOrientation: ConfigPlugin = (config) =>
  withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    const activity = application?.activity?.[0];
    if (activity?.$) {
      activity.$['android:screenOrientation'] = 'fullSensor';
    }
    return cfg;
  });

export default {
  expo: {
    // 应用名未定稿（设计文档 §14.3），M1 占位
    name: "Stream Isle Mobile",
    slug: "stream-isle-mobile",
    // 认证头 Version 字段取值来源：expo-constants nativeApplicationVersion
    version: "0.1.0",
    orientation: "portrait", // 播放页横屏由 Player 页运行时锁定（M2）
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark", // 深色默认（设计文档 §10.1）；需 expo-system-ui 支持
    // 说明：M1 文档 §4.1 要求 newArchEnabled: false（RN 0.76 时代第三方原生模块兼容性优先），
    // 但本工程按文档「SDK 52+ 以 npx expo install 配套为准」落在 SDK 58 / RN 0.88，
    // RN 0.80+ 已移除旧架构（旧架构开关不再存在），该字段已无意义，故不写。
    // 第三方原生模块当前版本均已支持新架构（音频引擎已由 track-player v4 迁至 @rntp/player v5，
    // v4 官方标注不支持新架构且无修复计划，v5 为新架构重写版）。
    android: {
      package: "com.streamisle.mobile", // 包名随应用名一并在 M1 §8.2 评审确认
      // minSdkVersion: 26 的实际生效见 plugins 内 expo-build-properties（SDK 58 该配置字段
      // 不进 gradle 体系，裸配置经构建日志验证落的是版本目录默认 24）
      usesCleartextTraffic: true, // 字段保留作意图声明；SDK 58 实际生效靠上方 withCleartextTraffic 插件
      // M2：播放页需运行时锁横屏（expo-screen-orientation），manifest activity 须为 fullSensor
      // （expo "all" 的映射值）；竖屏浏览基准由各页面行为保证
      screenOrientation: "all",
      permissions: [
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        // M5（05 文档 §4.9）：Android 13+ 通知栏/锁屏媒体控制可见性
        "POST_NOTIFICATIONS",
        // M5（05 文档 §4.14）：电池优化白名单引导直达弹窗
        "REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
      ],
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      withCleartextTraffic, // 明文 http 支持（见函数注释）
      withFullSensorOrientation, // M2 播放页运行时锁横屏前提（见函数注释）
      // M1 classic module（TLS 白名单/probe）装配：拷 Kotlin 源 + MainApplication 幂等补丁
      // （prebuild 整目录重建 android/，手写源必须由 plugin 驱动恢复，05 里程碑重放实测）
      withStreamIsleNetwork,
      // minSdk 显式落 26（设计文档文档属性表 Android 8+ / M1 §4.1）：SDK 58 版本目录默认 24，
      // 必须经 expo-build-properties 写 gradle.properties 的 android.minSdkVersion=26
      ["expo-build-properties", { android: { minSdkVersion: 26 } }],
      "react-native-video", // 基础 plugin；M3 按需追加解码器扩展参数
      // M2：横屏锁定（Android 生效靠上方 screenOrientation: "all" → fullSensor；本 plugin 配置 iOS Info.plist）
      "expo-screen-orientation",
      // M5：保存到系统相册的写权限声明（05 文档 §4.9/§4.14）
      ["expo-media-library", { savePhotosPermission: "保存照片到相册" }],
      // M6：离线下载 SQLite（下载快照 + 离线进度队列表，06 文档 §3.3/§4.4.1）
      "expo-sqlite",
      // 注意：M1 文档 §4.1 的 plugins 清单含 "react-native-track-player"（自动注入前台 Service），
      // 但 track-player v4 / @rntp/player v5 包内均不存在 Expo config plugin（无 app.plugin.js），
      // prebuild 无法解析该条目，故不写。
      // M5 落地核实（05 §4.9）+ v5 迁移复核：@rntp/player 库自带 AndroidManifest 已声明
      // TrackPlayerPlaybackService（foregroundServiceType="mediaPlayback"，Media3 MediaLibraryService）
      // + FOREGROUND_SERVICE(_MEDIA_PLAYBACK)/WAKE_LOCK 权限，gradle manifest merger 构建期合入
      // app 清单，无需本地 plugin 重复声明（见 docs/07 M5 决策）。
    ],
  },
} as const;
