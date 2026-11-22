// ESLint 扁平配置（eslint-config-expo 官方 flat 形态，SDK 58 搭配 eslint 9）。
// android/ 为 prebuild 产物目录，不参与 lint。
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'node_modules/*'],
  },
  {
    // 共享层反向禁令（TV-m0 §4.8，TV 设计 §3.3 固化现状）：adapter/service/infra/store/
    // constant/util/i18n 禁 import 手机 UI（@/page 全部、@/component 除白名单三件）——
    // 共享层同时被 tv/ Metro 编译，混入手机 UI 会污染 TV 依赖闭包。
    // regex 形态实现白名单例外；与 tv/eslint.config.js 的正向规则互为镜像。
    files: [
      'src/adapter/**/*.{ts,tsx}',
      'src/service/**/*.{ts,tsx}',
      'src/infra/**/*.{ts,tsx}',
      'src/store/**/*.{ts,tsx}',
      'src/constant/**/*.{ts,tsx}',
      'src/util/**/*.{ts,tsx}',
      'src/i18n/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@/(page|component)(?!/AppIcon$|/useTheme$|/Toast$)(/|$)',
              message:
                '共享层禁止 import UI（@/page、@/component）；白名单 AppIcon/useTheme/Toast 例外（TV 设计 §3.3）',
            },
          ],
        },
      ],
    },
  },
]);
