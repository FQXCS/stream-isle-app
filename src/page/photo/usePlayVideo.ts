/**
 * 照片库视频快捷播放（M7）：resolve 播放源后直接进播放页（视频条目可不进详情页）。
 * 家庭视频库的条目无元数据页价值，点封面即播；失败按统一错误文案 Toast。
 */
import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MediaLibraryItem } from '@/adapter/model';
import { showToast } from '@/component/Toast';
import { ROUTES } from '@/constant/navigation';
import { AppError, errorMessageOf } from '@/infra/error';
import { playbackService } from '@/service/PlaybackService';
import type { RootStackParamList } from '@/page/navigation/types';

type VideoPlaybackNavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 返回 play(item)：解析并进入播放页（positionMs 有断点时从断点起播） */
export function usePlayVideo(): (item: MediaLibraryItem) => Promise<void> {
  const navigation = useNavigation<VideoPlaybackNavigationProp>();
  return useCallback(
    async (item: MediaLibraryItem) => {
      try {
        const session = await playbackService.resolve(item.id, {
          startPositionMs:
            item.userData.playbackPositionMs > 0 ? item.userData.playbackPositionMs : undefined,
        });
        navigation.navigate(ROUTES.PLAYER, {
          session: { ...session, name: item.name, itemType: item.type },
        });
      } catch (err) {
        showToast(errorMessageOf(err instanceof AppError ? err.code : 'UNKNOWN'), 'error');
      }
    },
    [navigation]
  );
}
