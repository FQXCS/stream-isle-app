/**
 * Metro 配置（TV-m0 平移新增）：modules/ 本地原生模块留仓库根共享（TV 设计 §3.1），
 * 平移后位于工程根之外，须加进 watchFolders Metro 才能访问（PlayerScreen 引
 * expo-playback-gestures / infra 引 expo-media-caps）。其余保持 Expo 内置默认——
 * 依赖解析仍走 mobile/node_modules（官方 react-native）；expo-modules-core 等粘性依赖
 * 由 @expo/cli 的 autolinking 解析器重定向，不受 watchFolders 影响。
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname; // mobile/
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(repoRoot, 'modules')];

module.exports = config;
