/**
 * TV 全局导航引用（TV-m1 §4.1）：命令式导航使用（m1 内 Shell 单路由暂无 push 场景，
 * m2 详情/播放栈 push 启用）；与手机 navigationRef 同构，TV 自持实例不共享容器。
 */
import { createNavigationContainerRef } from '@react-navigation/native';

import type { TvStackParamList } from '@tv/navigation/types';

/** 全局单例引用 */
export const navigationRef = createNavigationContainerRef<TvStackParamList>();
