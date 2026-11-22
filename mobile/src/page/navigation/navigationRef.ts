/**
 * 全局导航引用（M1 文档 §4.2/§4.9）：401 登出跳转等命令式导航使用。
 */
import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from '@/page/navigation/types';

/** 全局单例引用 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
