/**
 * 中文文案汇总：base（通用/设置/导航/错误/播放设置）+ 各领域文件。
 * MessageKey 取各领域 key 的并集，en/index.ts 据此做编译期对齐。
 */
import { zhBase } from './base';
import { zhLibrary } from './library';
import { zhPlayer } from './player';
import { zhServer } from './server';

export const zh = { ...zhBase, ...zhServer, ...zhLibrary, ...zhPlayer };

export type MessageKey =
  | keyof typeof zhBase
  | keyof typeof zhServer
  | keyof typeof zhLibrary
  | keyof typeof zhPlayer;
