/**
 * StreamIsleNetwork classic module 的 prebuild 装配插件（M1 §4.5.4）：
 * prebuild 会整目录重建 android/，手写 Kotlin 源文件必须由 plugin 从 plugins/ 源目录
 * 拷入 android/app/src/main/java/，并对 MainApplication.kt 做两处幂等补丁——
 * ① onCreate 调 StreamIsleNetworkInjection.install()；② PackageList 注册 StreamIsleNetworkPackage。
 * 重新 prebuild 自动恢复（与 withCleartextTraffic 同款机制，M5 里程碑重放实测）。
 * TV-m0：目标包名从 app.config 的 android.package 派生（手机 com.streamisle.mobile、
 * TV com.streamisle.mobile.tv），拷贝时同步重写 Kotlin 源的 package 声明。
 * 注：以 CJS .js 落位（expo 配置加载器只转译 app.config.ts 入口本身，require 的模块须为 js）。
 * 依赖 @expo/config-plugins 由仓库根 package.json 显式声明（TV-m0 平移定案，见决策记录）。
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE_DIR = path.join(__dirname, 'stream-isle-network', 'files');

const MAIN_APP_PACKAGE_INJECTION =
  '// M1：TLS 白名单/诊断 classic module（JS 侧 NativeModules.StreamIsleNetwork）\n          add(StreamIsleNetworkPackage())';
const MAIN_APP_ONCREATE_INJECTION =
  '// M1 §4.5.4：选择性证书校验注入（默认严格，仅白名单 host:port 豁免；决策记录 M1-S4/M4-S2）\n    StreamIsleNetworkInjection.install()';

/** 包名 → java 源目录片段（com.streamisle.mobile.tv → ['com','streamisle','mobile','tv']） */
function packageDirOf(androidPackage) {
  return (androidPackage ?? 'com.streamisle.mobile').split('.');
}

function patchMainApplication(androidRoot, targetDir) {
  const mainAppPath = path.join(androidRoot, ...targetDir, 'MainApplication.kt');
  let content = fs.readFileSync(mainAppPath, 'utf8');
  let changed = false;
  if (!content.includes('add(StreamIsleNetworkPackage())')) {
    content = content.replace(
      '// add(MyReactNativePackage())\n        }',
      `// add(MyReactNativePackage())\n          ${MAIN_APP_PACKAGE_INJECTION}\n        }`
    );
    changed = true;
  }
  if (!content.includes('StreamIsleNetworkInjection.install()')) {
    content = content.replace(
      '  override fun onCreate() {\n    super.onCreate()\n',
      `  override fun onCreate() {\n    super.onCreate()\n    ${MAIN_APP_ONCREATE_INJECTION}\n`
    );
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(mainAppPath, content, 'utf8');
  }
}

const withStreamIsleNetwork = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const androidRoot = path.join(cfg.modRequest.projectRoot, 'android');
      const targetDir = packageDirOf(cfg.android?.package);
      const target = path.join(androidRoot, 'app', 'src', 'main', 'java', ...targetDir);
      fs.mkdirSync(target, { recursive: true });
      const targetPackage = targetDir.join('.');
      for (const file of fs.readdirSync(SOURCE_DIR)) {
        let content = fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8');
        // 包名不同（TV 工程）时同步重写 Kotlin package 声明；相同（手机）时无操作
        if (targetPackage !== 'com.streamisle.mobile') {
          content = content.replace('package com.streamisle.mobile', `package ${targetPackage}`);
        }
        fs.writeFileSync(path.join(target, file), content, 'utf8');
      }
      patchMainApplication(androidRoot, ['app', 'src', 'main', 'java', ...targetDir]);
      return cfg;
    },
  ]);

module.exports = withStreamIsleNetwork;
