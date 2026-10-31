/**
 * react-native-mmkv v4 的内存实现（M1 文档 §4.1：jest-expo 环境无原生 MMKV，供单测替换）。
 * 位于根 __mocks__/ 时，jest 对 node_modules 包无需 jest.mock() 即自动启用；
 * 同一 id 的实例共享存储，模拟真实 MMKV 的多实例语义。
 * API 对齐 v4：createMMKV(configuration) 创建实例（new MMKV() 为 v3 形态，已废弃）。
 */
const instances = new Map<string, Map<string, string | number | boolean>>();

export interface MMKVConfiguration {
  id?: string;
  path?: string;
  encryptionKey?: string;
}

/** 内存 MMKV 实例（与 v4 的 MMKV 类型在所用方法面上同构） */
export interface MemoryMMKV {
  getString(key: string): string | undefined;
  set(key: string, value: string | number | boolean): void;
  remove(key: string): boolean;
  getAllKeys(): string[];
  contains(key: string): boolean;
  clearAll(): void;
}

export function createMMKV(configuration?: MMKVConfiguration): MemoryMMKV {
  const id = configuration?.id ?? 'mmkv.default';
  let map = instances.get(id);
  if (!map) {
    map = new Map<string, string | number | boolean>();
    instances.set(id, map);
  }
  return {
    getString(key: string): string | undefined {
      const value = map!.get(key);
      return typeof value === 'string' ? value : undefined;
    },
    set(key: string, value: string | number | boolean): void {
      map!.set(key, value);
    },
    remove(key: string): boolean {
      return map!.delete(key);
    },
    getAllKeys(): string[] {
      return Array.from(map!.keys());
    },
    contains(key: string): boolean {
      return map!.has(key);
    },
    clearAll(): void {
      map!.clear();
    },
  };
}
