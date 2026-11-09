/**
 * Release 正式签名注入插件：RN 模板的 android/app/build.gradle 里 release 构建类型默认
 * 复用 debug 签名（仓库内公开的 debug.keystore），对外分发存在被同密钥仿冒覆盖安装的风险。
 * 本插件在 prebuild 时注入 release signingConfig，读取 CI 工作流提供的四个环境变量
 * （ANDROID_KEYSTORE_FILE / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD）。
 * 关键：签名决策放在 gradle 构建期（System.getenv + file.exists），而非 prebuild 期——
 * 注入文本恒定，本地无 keystore 时构建期回退 debug，CI 有 keystore 时用正式签名；
 * 如此 prebuild 产物不随环境变化，避免 mobile-ci 的「prebuild 重放无 diff」断言漂移。
 * 注：以 CJS .js 落位（expo 配置加载器只转译 app.config.ts 入口本身，require 的模块须为 js）。
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const RELEASE_SIGNING_CONFIG = [
  '        release {',
  "            if (System.getenv('ANDROID_KEYSTORE_FILE') && file(System.getenv('ANDROID_KEYSTORE_FILE')).exists()) {",
  "                storeFile file(System.getenv('ANDROID_KEYSTORE_FILE'))",
  "                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')",
  "                keyAlias System.getenv('ANDROID_KEY_ALIAS')",
  "                keyPassword System.getenv('ANDROID_KEY_PASSWORD')",
  '            }',
  '        }',
].join('\n');

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let { contents } = cfg.modResults;
    if (contents.includes('signingConfigs.release')) {
      return cfg;
    }
    // 在 signingConfigs { 之后插入 release 签名配置（保留模板原有 debug 配置）
    contents = contents.replace(
      /signingConfigs \{\n/,
      `signingConfigs {\n${RELEASE_SIGNING_CONFIG}\n`,
    );
    // 仅 release 构建类型改引用 release 签名（由构建期 file.exists 决定正式/debug 回退）；
    // 模板 release 块带固定 Caution 注释，锚定该注释定位 buildTypes 的 release 块，
    // 避免误匹配 signingConfigs 内新插入的 release 块或 buildTypes 的 debug 块
    contents = contents.replace(
      /(\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\n[ \t]*)signingConfig signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release',
    );
    cfg.modResults.contents = contents;
    return cfg;
  });

module.exports = withReleaseSigning;