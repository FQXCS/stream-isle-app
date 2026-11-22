/**
 * UUID 生成（M5 文档 §4.1/§3.4：playSessionId 的 UUID 来源；M1 已有同形实现于
 * infra/deviceId.ts 的兜底分支，本工具为共享出口，不再新增 expo-crypto 依赖）。
 * 仅作会话标识用，无密码学强度要求。
 */

/** 生成 UUID v4 形态随机串（RN 环境无 crypto.randomUUID 保证，自行实现最简形态） */
export function newUid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
