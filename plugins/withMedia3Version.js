/**
 * media3 版本覆盖插件（M8 音画同步延时）：RNV safeExtGet 读 rootProject.ext.media3Version，
 * 库默认 1.8.0 无 SubtitleConfiguration.timeOffsetUs；1.12.0-beta01 提供外挂字幕偏移 API。
 * prebuild 会整目录重建 android/，手改 build.gradle 会被模板覆盖，故由 plugin 注入
 * （withAliyunMaven 同款理由）。注：以 CJS .js 落位（expo 配置加载器只转译 app.config.ts
 * 入口本身，require 的模块须为 js）。
 * 待办：media3 1.12 稳定版发布后回切正式版并更新本插件版本值（docs/todo/media3-稳定版回切.md）。
 */
const { withProjectBuildGradle } = require('@expo/config-plugins');

const EXT_BLOCK = [
  '// M8 音画同步延时：media3 1.12 提供 SubtitleConfiguration.timeOffsetUs（稳定版未发，见 docs/todo/media3-稳定版回切.md）',
  'ext {',
  "  media3Version = '1.12.0-beta01'",
  '}',
].join('\n');

const withMedia3Version = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    const { contents } = cfg.modResults;
    if (!contents.includes('media3Version')) {
      cfg.modResults.contents = contents.replace(
        /^apply plugin: "expo-root-project"[ \t]*\r?$/m,
        `${EXT_BLOCK}\n\napply plugin: "expo-root-project"`,
      );
    }
    return cfg;
  });

module.exports = withMedia3Version;