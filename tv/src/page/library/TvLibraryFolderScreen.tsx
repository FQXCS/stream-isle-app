/**
 * TV 库内文件夹下钻页（TV-m2 §4.2）：由文件夹 Tab 或上一层文件夹 push 进入，
 * 参数形状对齐手机 LIBRARY_FOLDER 路由；内容 TvWallGrid（containerId=folderId，
 * Recursive=false 只列当前层），文件夹卡 Enter 逐级 push、BACK 逐级回退（native-stack）。
 * 排序沿用入口传入值（TV-m2 排序编辑菜单顺延，m2 只读）。
 */
import { useMemo } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { StyleSheet, Text } from 'react-native';

import type { ItemQuery } from '@/adapter/model';
import { PAGE_SIZE } from '@/constant/browse';
import { ROUTES } from '@/constant/navigation';
import { useT } from '@/i18n';
import { useAccountStore } from '@/store/accountStore';
import { wallKeyOf } from '@/store/browseStore';

import { TvWallGrid } from '@tv/component/TvWallGrid';
import { TvScreenFrame } from '@tv/component/TvScreenFrame';
import { useTvTheme } from '@tv/component/useTvTheme';
import { tvNavigateMediaItem } from '@tv/page/library/navigation';
import type { TvStackParamList } from '@tv/navigation/types';

type TvNavigation = NativeStackNavigationProp<TvStackParamList>;

export function TvLibraryFolderScreen() {
  const route = useRoute<RouteProp<TvStackParamList, typeof ROUTES.LIBRARY_FOLDER>>();
  const { libraryId, libraryType, folderId, folderName, tabId, sortBy, sortOrder } = route.params;
  const navigation = useNavigation<TvNavigation>();
  const t = useTvTheme();
  const tr = useT();
  const active = useAccountStore((state) => state.active);
  const serverId = active?.serverId ?? '';
  const userId = active?.userId ?? '';

  // 目录墙查询（手机 PosterFolderBrowser 同构：Recursive=false 非递归当前层）
  const query = useMemo<ItemQuery>(
    () => ({
      userId,
      parentId: folderId,
      sortBy,
      sortOrder,
      recursive: false,
      startIndex: 0,
      limit: PAGE_SIZE,
    }),
    [userId, folderId, sortBy, sortOrder]
  );
  const wallKey = useMemo(
    () => wallKeyOf(serverId, userId, folderId, query, tabId),
    [serverId, userId, folderId, query, tabId]
  );

  return (
    <TvScreenFrame>
      <TvWallGrid
        wallKey={wallKey}
        query={query}
        listHeader={
          <Text style={[styles.title, { color: t.textPrimary }]} numberOfLines={1}>
            {folderName}
          </Text>
        }
        emptyTitle={tr('library.emptyFolder')}
        onPressItem={(item) => tvNavigateMediaItem(navigation, item)}
        onPressFolder={(item) =>
          // 逐级下钻：同参数 push 新层（BACK 由 native-stack 逐级回退）
          navigation.navigate(ROUTES.LIBRARY_FOLDER, {
            libraryId,
            libraryType,
            folderId: item.id,
            folderName: item.name,
            tabId,
            sortBy,
            sortOrder,
            kind: 'folder',
          })
        }
        hideEmptyFolders
      />
    </TvScreenFrame>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
});
