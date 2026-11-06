/**
 * 消息字典完整性：zh/en key 一一对齐、无空文案、跨领域无重复 key。
 * en/index.ts 的 `satisfies Record<MessageKey, Message>` 已在编译期兜底，这里补运行期与重复 key 检查。
 */
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { zhBase } from '@/i18n/messages/zh/base';
import { zhLibrary } from '@/i18n/messages/zh/library';
import { zhPlayer } from '@/i18n/messages/zh/player';
import { zhServer } from '@/i18n/messages/zh/server';

describe('i18n messages', () => {
  it('zh 与 en 的 key 集合完全一致', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it('所有文案非空（函数消息视为有效）', () => {
    for (const [key, message] of Object.entries(zh)) {
      expect(message).toBeDefined();
      if (typeof message === 'string') {
        expect(message.trim()).not.toBe('');
      }
      expect(key.trim()).not.toBe('');
    }
    for (const [key, message] of Object.entries(en)) {
      expect(message).toBeDefined();
      if (typeof message === 'string') {
        expect(message.trim()).not.toBe('');
      }
      expect(key.trim()).not.toBe('');
    }
  });

  it('领域字典之间无重复 key（spread 合并不会静默覆盖）', () => {
    const domainList = [zhBase, zhServer, zhLibrary, zhPlayer];
    const allKeys = domainList.flatMap((domain) => Object.keys(domain));
    expect(new Set(allKeys).size).toBe(allKeys.length);
    expect(allKeys.sort()).toEqual(Object.keys(zh).sort());
  });
});
