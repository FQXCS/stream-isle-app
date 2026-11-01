/**
 * 照片库布局（M5 文档 §4.12/§4.13；M7 调整）：家庭视频/照片混合库（homevideos/photos）
 * 顶部视图段：视频 / 图片 / 文件夹——
 * - 视频：库内 Video 条目平铺网格，点封面直接起播；
 * - 图片：库内全部照片（平铺，不按相册分组），点开全屏查看器；
 * - 文件夹：目录逐级浏览，子目录与相册都在本段内下钻（不跳转其他段），返回键回上一级。
 * 排序入口在导航栏右上角 SortMenu，选择按「服务器 + 库」持久化（libraryViewStore），重进默认沿用。
 * PhotoViewer 为独立全屏路由（05 §4.15）。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BackHandler, StyleSheet, View } from 'react-native';

import type { MediaLibraryItem, SortByEnum } from '@/adapter/model';
import { SegmentedControl } from '@/component/SegmentedControl';
import { SortMenu, SortMenuButton } from '@/component/SortMenu';
import {
  FOLDER_SORT_OPTIONS,
  PHOTO_SORT_OPTIONS,
  PHOTO_VIEW_OPTIONS,
  SORT_OPTIONS,
  type PhotoViewEnum,
} from '@/constant/browse';
import { type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { useAccountStore } from '@/store/accountStore';
import {
  DEFAULT_LIBRARY_SORT,
  librarySortKeyOf,
  useLibraryViewStore,
  type LibrarySortState,
} from '@/store/libraryViewStore';
import { PhotoFolderView } from '@/page/photo/PhotoFolderView';
import { PhotoGridScreen } from '@/page/photo/PhotoGridScreen';
import { PhotoVideoGrid } from '@/page/photo/PhotoVideoGrid';
import type { RootStackParamList } from '@/page/navigation/types';

type PhotoNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface PhotoLibraryScreenProps {
  libraryId: string;
}

/** 文件夹浏览路径元素（末端为当前容器）：相册层在段内用照片网格展示 */
interface PhotoFolderRef {
  id: string;
  name: string;
  kind: 'folder' | 'album';
}

export function PhotoLibraryScreen({ libraryId }: PhotoLibraryScreenProps) {
  const t = useTheme();
  const styles = createStyles(t);
  const navigation = useNavigation<PhotoNavigationProp>();
  const serverId = useAccountStore((state) => state.active?.serverId ?? '');
  // 排序持久化：每个库记住自己的排序（重进库页默认沿用）
  const sortKey = librarySortKeyOf(serverId, libraryId);
  const savedSort = useLibraryViewStore((state) => state.sortByKey[sortKey]);
  const [sortBy, setSortBy] = useState<SortByEnum>(
    () => savedSort?.sortBy ?? DEFAULT_LIBRARY_SORT.sortBy
  );
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>(
    () => savedSort?.sortOrder ?? DEFAULT_LIBRARY_SORT.sortOrder
  );
  // 视图段：视频 / 图片 / 文件夹
  const [view, setView] = useState<PhotoViewEnum>('photo');
  // 文件夹浏览路径（空=库根目录）
  const [folderPath, setFolderPath] = useState<PhotoFolderRef[]>([]);
  // 排序面板开合（页内浮层）
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const current = folderPath.length > 0 ? folderPath[folderPath.length - 1] : null;

  // 当前视图可用的排序项：视频=全量视频字段，图片/相册=照片字段，文件夹=目录字段
  const sortOptionList = useMemo(() => {
    if (view === 'video') {
      return SORT_OPTIONS;
    }
    if (view === 'photo') {
      return PHOTO_SORT_OPTIONS;
    }
    return current?.kind === 'album' ? PHOTO_SORT_OPTIONS : FOLDER_SORT_OPTIONS;
  }, [view, current]);

  // 当前字段不在可用集合（如视频视图的大小/时长切到图片或文件夹）时按默认标题升序，
  // 切回支持该字段的视图自动恢复；不写 state，避免视图切换产生连锁渲染
  const sortSupported = sortOptionList.some((option) => option.value === sortBy);
  const activeSortBy = sortSupported ? sortBy : DEFAULT_LIBRARY_SORT.sortBy;
  const activeSortOrder = sortSupported ? sortOrder : DEFAULT_LIBRARY_SORT.sortOrder;
  const sort: LibrarySortState = { sortBy: activeSortBy, sortOrder: activeSortOrder };

  /** 进入下一层（子目录或相册） */
  const handleOpenEntry = useCallback((entry: PhotoFolderRef) => {
    setFolderPath((path) => [...path, entry]);
  }, []);

  const handleOpenFolder = useCallback(
    (folder: MediaLibraryItem) =>
      handleOpenEntry({ id: folder.id, name: folder.name, kind: 'folder' }),
    [handleOpenEntry]
  );

  const handleOpenAlbum = useCallback(
    (album: MediaLibraryItem) => handleOpenEntry({ id: album.id, name: album.name, kind: 'album' }),
    [handleOpenEntry]
  );

  // 系统返回键：文件夹内（含相册层）→ 回上一级
  useEffect(() => {
    if (view !== 'folder' || folderPath.length === 0) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setFolderPath((path) => path.slice(0, -1));
      return true;
    });
    return () => subscription.remove();
  }, [view, folderPath.length]);

  /**
   * 排序切换（关闭面板）：选同一字段 = 切换升降序（随机无方向不切换），选其他字段 = 用其默认方向；
   * 结果写入 libraryViewStore 持久化。
   */
  const handleSelectSort = useCallback(
    (next: SortByEnum) => {
      setSortMenuOpen(false);
      const option = sortOptionList.find((item) => item.value === next);
      let nextOrder: 'ASC' | 'DESC';
      if (next === activeSortBy) {
        if (option?.defaultOrder === null) {
          return;
        }
        nextOrder = activeSortOrder === 'ASC' ? 'DESC' : 'ASC';
      } else {
        nextOrder = option?.defaultOrder ?? 'ASC';
      }
      setSortBy(next);
      setSortOrder(nextOrder);
      useLibraryViewStore.getState().actions.setLibrarySort(sortKey, {
        sortBy: next,
        sortOrder: nextOrder,
      });
    },
    [activeSortBy, activeSortOrder, sortKey, sortOptionList]
  );

  const handleToggleSortMenu = useCallback(() => setSortMenuOpen((open) => !open), []);
  const handleCloseSortMenu = useCallback(() => setSortMenuOpen(false), []);

  // 排序入口注入导航栏右上角（库名居中标题在 RootNavigator 的 LIBRARY options 中）
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <SortMenuButton onPress={handleToggleSortMenu} />,
    });
  }, [navigation, handleToggleSortMenu]);

  return (
    <View style={styles.fill}>
      <SegmentedControl
        optionList={PHOTO_VIEW_OPTIONS}
        value={view}
        onChange={(next) => {
          // 切换视图回到库根
          setView(next);
          setFolderPath([]);
        }}
      />
      {view === 'photo' && (
        <PhotoGridScreen parentId={libraryId} sort={sort} emptyTitle="暂无图片" />
      )}
      {view === 'video' && <PhotoVideoGrid libraryId={libraryId} sort={sort} />}
      {view === 'folder' &&
        (current === null ? (
          <PhotoFolderView
            parentId={libraryId}
            sort={sort}
            onOpenFolder={handleOpenFolder}
            onOpenAlbum={handleOpenAlbum}
          />
        ) : current.kind === 'album' ? (
          // 相册层：在本段内用照片网格展示（不再跳转「图片」段）
          <PhotoGridScreen
            key={current.id}
            parentId={current.id}
            title={current.name}
            sort={sort}
            emptyTitle="相册内暂无照片"
          />
        ) : (
          <PhotoFolderView
            key={current.id}
            parentId={current.id}
            sort={sort}
            onOpenFolder={handleOpenFolder}
            onOpenAlbum={handleOpenAlbum}
          />
        ))}
      {sortMenuOpen && (
        <SortMenu
          sortBy={activeSortBy}
          sortOrder={activeSortOrder}
          optionList={sortOptionList}
          onSelect={handleSelectSort}
          onClose={handleCloseSortMenu}
        />
      )}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bg },
  });
