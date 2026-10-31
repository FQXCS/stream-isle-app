// ESLint 扁平配置（eslint-config-expo 官方 flat 形态，SDK 58 搭配 eslint 9）。
// android/ 为 prebuild 产物目录，不参与 lint。
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'node_modules/*'],
  },
]);
