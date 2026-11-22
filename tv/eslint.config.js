// ESLint 扁平配置（eslint-config-expo 官方 flat 形态，SDK 58 搭配 eslint 9）。
// android/ 为 prebuild 产物目录，不参与 lint。
// TV 层边界规则（TV 设计 §3.3，TV-m0 §4.8）：tv/src 禁 import 手机 UI（@/page 全部、
// @/component 除白名单三件），违反即 CI 红。regex 形态实现白名单例外（group 无取反语义）。
// TV-m1 增量（TV 设计 §7.1 / TV-m1 §2.1）：tv/src 禁裸 <Pressable——可点击件一律 TvPressable
// 收口焦点视觉（useTvFocusStyle 唯一出处）。
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'node_modules/*'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@/page(/|$)',
              message:
                'TV 层禁止 import 手机 page（TV 设计 §3.3；TV 页面一律 @tv/page 新写）',
            },
            {
              regex: '^@/component/(?!AppIcon$|useTheme$|Toast$)',
              message:
                'TV 层禁止 import 手机 component；白名单 AppIcon/useTheme/Toast 三件例外（TV 设计 §3.3）',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="Pressable"]',
          message:
            'TV 层禁用裸 Pressable：可点击件一律 TvPressable（@tv/component）收口焦点视觉（TV 设计 §7.1）',
        },
      ],
    },
  },
]);
