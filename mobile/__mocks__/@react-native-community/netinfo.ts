/**
 * @react-native-community/netinfo 的 jest mock（native 模块在 jest 环境不可用；
 * root __mocks__ 对 node_modules 包自动生效）。业务侧离线判定在单测以注入 isOffline
 * 消费，本 mock 仅保证 import 链可解析、addEventListener/fetch 不触原生。
 */

/** 网络状态 mock 值（在线 Wi-Fi；离线场景由业务注入覆盖） */
const currentState = {
  type: 'wifi',
  isConnected: true,
  isInternetReachable: true,
  details: {},
};

const netInfo = {
  addEventListener: jest.fn().mockReturnValue(jest.fn()),
  fetch: jest.fn().mockResolvedValue(currentState),
  configure: jest.fn(),
  useNetInfo: jest.fn().mockReturnValue(currentState),
  getCurrentState: jest.fn().mockResolvedValue(currentState),
};

export default netInfo;
export const addEventListener = netInfo.addEventListener;
export const fetch = netInfo.fetch;
export const useNetInfo = netInfo.useNetInfo;
