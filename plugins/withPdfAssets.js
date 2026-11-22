/**
 * PDF 阅读器静态资产的 prebuild 装配插件（M7）：prebuild 会整目录重建 android/，
 * assets/pdf/ 下的 pdf.js 构建与 reader.html 必须由 plugin 拷入
 * android/app/src/main/assets/pdf/，WebView 以 file:///android_asset/pdf/reader.html 加载。
 * 重新 prebuild 自动恢复（与 withStreamIsleNetwork 同款机制）。
 * 注：以 CJS .js 落位（expo 配置加载器只转译 app.config.ts 入口本身，require 的模块须为 js）。
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

// TV-m0 工程平移：手机 assets/ 已随工程移入 mobile/，插件留仓库根，源目录指回 mobile/
const SOURCE_DIR = path.join(__dirname, '..', 'mobile', 'assets', 'pdf');
const TARGET_DIR = ['app', 'src', 'main', 'assets', 'pdf'];

const withPdfAssets = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const target = path.join(cfg.modRequest.projectRoot, 'android', ...TARGET_DIR);
      fs.mkdirSync(target, { recursive: true });
      for (const file of fs.readdirSync(SOURCE_DIR)) {
        fs.copyFileSync(path.join(SOURCE_DIR, file), path.join(target, file));
      }
      return cfg;
    },
  ]);

module.exports = withPdfAssets;
