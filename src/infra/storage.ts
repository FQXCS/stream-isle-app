/**
 * MMKV 实例与 zustand persist 适配（M1 文档 §4.5.3；设计文档 §9）。
 * Token 不进 MMKV（仅 expo-secure-store）；MMKV 只持久化账号引用数据与设置。
 * 注：react-native-mmkv v4（Nitro）以 createMMKV() 创建实例（文档 §4.1 按 v3 写 new MMKV()，
 * 实装版本语义等价替换，登记于 docs/07）。
 */
import { createMMKV } from 'react-native-mmkv';
import { createJSONStorage } from 'zustand/middleware';

/** 全局唯一 MMKV 实例（默认 id） */
export const mmkv = createMMKV({ id: 'mmkv.default' });

/** zustand StateStorage 形态适配（getItem 返回 null 表示缺失，不含 undefined） */
export const mmkvStorage = {
  getItem: (key: string): string | null => mmkv.getString(key) ?? null,
  setItem: (key: string, value: string): void => {
    mmkv.set(key, value);
  },
  removeItem: (key: string): void => {
    // v4 实例方法名为 remove（v3 为 delete）
    mmkv.remove(key);
  },
};

/** zustand persist 的存储适配器工厂：persist + createJSONStorage(() => mmkvStorage) */
export const createMmkvJSONStorage = () => createJSONStorage(() => mmkvStorage);
