/**
 * Expo 应用配置——TV 工程（TV-m0 §4.4）：恒 TV 形态，无环境变量切换（TV 设计 §4.1）。
 * 复用仓库根共享插件（相对路径引用，与 mobile/app.config.ts 平移后口径一致）；
 * 不带 withPdfAssets（阅读器禁用）/ withFullSensorOrientation（TV 恒横屏）/ withReleaseSigning
 * （签名注入 m4 发版时再加）。
 */
import type { ConfigPlugin } from '@expo/config-plugins';
import { withAndroidManifest } from '@expo/config-plugins';

// CJS .js 插件（expo 配置加载器只转译 app.config.ts 入口本身，require 的模块须为 js）
import withStreamIsleNetwork from '../plugins/withStreamIsleNetwork.js';
import withAliyunMaven from '../plugins/withAliyunMaven.js';
import withMedia3Version from '../plugins/withMedia3Version.js';
import withTvLauncher from '../plugins/withTvLauncher.js';

/**
 * 为 AndroidManifest 的 <application> 补 android:usesCleartextTraffic="true"（与 mobile 同款
 * 内联实现——SDK 58 工具链无内置插件应用该字段，明文 http 服务器必需，见 mobile/app.config.ts 注释）。
 */
const withCleartextTraffic: ConfigPlugin = (config) =>
  withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application?.$) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });

export default {
  expo: {
    name: 'Stream Isle TV',
    slug: 'stream-isle-tv',
    // 版本名两端同步策略（TV 设计 §4.2）：bump 时一次 commit 同改两端 app.config
    version: '1.1.2',
    orientation: 'landscape', // TV 恒横屏（替代手机的 fullSensor 体系）
    userInterfaceStyle: 'dark', // TV 强制深色
    android: {
      package: 'com.streamisle.mobile.tv',
      // 独立 versionCode 序列，起点 100（TV-m0 §4.4 定案；TV 设计 §15 开放问题 1）
      versionCode: 100,
      permissions: ['INTERNET', 'ACCESS_NETWORK_STATE'],
    },
    // IS_TV_BUILD 构建期判定来源（TV 设计 §5）
    extra: { tv: true },
    plugins: [
      withCleartextTraffic,
      // M1 classic module（TLS 白名单/probe）装配（与手机同款，Kotlin 源 + MainApplication 补丁）
      withStreamIsleNetwork,
      // 国内 Maven 镜像（阿里云优先、Central 兜底）：TV 工程同国内网络必须
      withAliyunMaven,
      // media3 1.12.0-beta01 覆盖（与手机同版本，音画延时同源）
      withMedia3Version,
      // leanback/banner 装配（TV-m0 §4.5）
      withTvLauncher,
      // minSdk 显式落 26（与手机同口径，SDK 58 版本目录默认 24 需覆盖）
      ['expo-build-properties', { android: { minSdkVersion: 26 } }],
      // react-native-video manifest plugin；TV 无 PiP 需求
      ['react-native-video', { enableAndroidPictureInPicture: false }],
    ],
  },
} as const;
