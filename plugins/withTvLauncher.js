/**
 * TV 启动器装配插件（TV-m0 §4.5，TV 设计 §4.1）：TV 工程（tv/app.config.ts）专用。
 * ① MainActivity 增加第二个 intent-filter（LEANBACK_LAUNCHER，原 LAUNCHER 保留）；
 * ② <uses-feature> 声明 leanback / touchscreen required=false（不声明则 TV 商店/设备不显示，
 *    touchscreen 声明 required=false 才能在无触屏的电视设备安装）；
 * ③ <application android:banner> + tv/assets/tv-banner.png（320×180 占位，m4 换正式美术）
 *    拷入 res/mipmap-xhdpi/。
 * 重新 prebuild 自动恢复（与 withStreamIsleNetwork 同款机制）。
 * 注：以 CJS .js 落位（expo 配置加载器只转译 app.config.ts 入口本身，require 的模块须为 js）。
 * 依赖 @expo/config-plugins 由仓库根 package.json 显式声明（TV-m0 平移定案，见决策记录）。
 */
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const BANNER_SOURCE = path.join(__dirname, '..', 'tv', 'assets', 'tv-banner.png');
const BANNER_RES_DIR = ['app', 'src', 'main', 'res', 'mipmap-xhdpi'];

const withTvLauncher = (config) => {
  // manifest 修改：leanback intent-filter + uses-feature + banner 属性
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const application = manifest.application?.[0];
    const activity = application?.activity?.[0];

    // <uses-feature android:name="android.software.leanback" android:required="false" />
    manifest['uses-feature'] = manifest['uses-feature'] ?? [];
    manifest['uses-feature'].push(
      {
        $: {
          'android:name': 'android.software.leanback',
          'android:required': 'false',
        },
      },
      {
        $: {
          'android:name': 'android.hardware.touchscreen',
          'android:required': 'false',
        },
      }
    );

    // <application android:banner="@mipmap/tv_banner" />
    if (application?.$) {
      application.$['android:banner'] = '@mipmap/tv_banner';
    }

    // MainActivity 第二个 intent-filter：MAIN + LEANBACK_LAUNCHER（电视桌面入口）
    if (activity) {
      activity['intent-filter'] = activity['intent-filter'] ?? [];
      activity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
        category: [{ $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } }],
      });
    }

    return cfg;
  });

  // banner 资源拷入（withDangerousMod，幂等覆盖）
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const targetDir = path.join(cfg.modRequest.projectRoot, 'android', ...BANNER_RES_DIR);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(BANNER_SOURCE, path.join(targetDir, 'tv_banner.png'));
      return cfg;
    },
  ]);

  return config;
};

module.exports = withTvLauncher;
