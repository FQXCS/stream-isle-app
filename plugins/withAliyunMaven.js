/**
 * 国内 Maven 镜像注入插件：prebuild 会整目录重建 android/，手改 android/build.gradle
 * 里的阿里云仓库会被模板覆盖（CI 的 prebuild 漂移断言会拦截），故由 plugin 在 prebuild
 * 时注入 buildscript 与 allprojects 的 repositories（阿里云优先，Maven Central 兜底）。
 * 注：以 CJS .js 落位（expo 配置加载器只转译 app.config.ts 入口本身，require 的模块须为 js）。
 */
const { withProjectBuildGradle } = require('@expo/config-plugins');

const MIRROR_COMMENT =
  '// 国内网络镜像：阿里云优先（Central 实测仅 ~7KB/s 会超时），Maven Central 兜底';
const MIRROR_LINE = "maven { url 'https://maven.aliyun.com/repository/public' }";

const withAliyunMaven = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    const { contents } = cfg.modResults;
    if (!contents.includes(MIRROR_LINE)) {
      cfg.modResults.contents = contents.replace(
        /^([ \t]*)mavenCentral\(\)[ \t]*\r?$/gm,
        `$1${MIRROR_COMMENT}\n$1${MIRROR_LINE}\n$1mavenCentral()`,
      );
    }
    return cfg;
  });

module.exports = withAliyunMaven;
