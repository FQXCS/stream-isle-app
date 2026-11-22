/**
 * TV 工程 Metro 配置（TV-m0 §4.4，TV 设计 §4.1 第一技术验证点）。
 * 共享层：Metro 编译 mobile/src 下的共享代码（adapter/service/infra/store/…），
 * 依赖解析显式收敛进 tv/node_modules——其中 react-native 为 react-native-tvos fork。
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname; // tv/
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 共享层：mobile/src + 仓库根 modules/（本地原生模块的 TS 出口被共享层引用：
// infra/mediaCaps → modules/expo-media-caps，不在 watchFolders 内 Metro 无法访问）
config.watchFolders = [
  path.resolve(repoRoot, 'mobile/src'),
  path.resolve(repoRoot, 'modules'),
];

// 关键：禁用层级查找——否则 mobile/src 里 import 的包会向上爬到仓库根 node_modules
// （根上只有共享插件的 @expo/config-plugins）与兄弟工程 mobile/node_modules（官方
// react-native），与 tv/node_modules 的 fork 冲突
config.resolver.disableHierarchicalLookup = true;

// 所有依赖解析显式指向 tv/node_modules（fork 版）；共享层若 import 了 tv 未安装的包，
// 构建直接失败——依赖闭包核对（TV-m0 §4.7）的机械化兜底
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
