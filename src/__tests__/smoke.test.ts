/**
 * 工程冒烟测试：验证 jest-expo 工具链可用（TS 转译、RN 组件模块可加载）。
 * M1 业务单测按 M1 文档 §6.1 落位（src/util、src/infra、src/adapter 等），本文件仅作门禁哨兵。
 * 注：不加载完整 App 组件树——播放页含 reanimated worklet 指令（babel 转换产物依赖
 * worklets 原生运行时），jest 环境不执行原生代码；含 worklet 的页面由真机手测覆盖（M2 §6.2）。
 */
import { LoadingView } from '@/component/LoadingView';

describe('工程脚手架冒烟', () => {
  it('RN 组件模块可加载', () => {
    expect(LoadingView).toBeDefined();
    expect(typeof LoadingView).toBe('function');
  });
});
