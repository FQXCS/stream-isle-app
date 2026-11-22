/**
 * Jest 配置（M1 文档 §4.1：jest-expo preset）。
 * moduleNameMapper 使 jest 与 tsconfig 的 @/* 路径别名保持一致。
 * M2：reanimated 映射到官方 mock（冒烟测试经 RootNavigator→PlayerScreen 引入，
 * 真实包在 jest 环境下报 loadUnpackersWithCode 未定义；业务单测不依赖动画细节）。
 */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-native-reanimated$': 'react-native-reanimated/mock',
  },
};
