/**
 * 应用级常量（M1 文档 §4.2）。
 */
import Constants from 'expo-constants';

/** 客户端名：MediaBrowser 认证头 Client/Device 字段取值（§4.6.3 buildHeaders） */
export const CLIENT_NAME = 'Stream Isle';

/** 认证头 Version 字段取值：运行时取 expo-constants，fallback 1.1.2 */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.1.2';

/**
 * Android 应用包名（M5：电池优化引导 IntentLauncher data 的 package: 参数同源消费）。
 * 与 app.config.ts android.package 唯一同源约定——包名属 M1 §8.2 待评审项，
 * M6 定稿改包名时必须同步此处，否则电池优化直达弹窗静默指向错误包名。
 */
export const ANDROID_APPLICATION_ID = 'com.streamisle.mobile';

/** 应用发布仓库（版本检查与 Releases 外链同源；发布仓库需公开可匿名访问） */
const GITHUB_RELEASE_OWNER = 'FQXCS';
const GITHUB_RELEASE_REPO = 'stream-isle-app';

/** GitHub Releases 页面（设置页外链 + 更新页下载/兜底入口） */
export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_RELEASE_OWNER}/${GITHUB_RELEASE_REPO}/releases`;

/** 最新正式 Release API（更新页检查版本；不含草稿/预发布） */
export const GITHUB_LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_RELEASE_OWNER}/${GITHUB_RELEASE_REPO}/releases/latest`;
