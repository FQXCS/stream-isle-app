/**
 * 条目长按菜单：库海报墙与照片库视频网格共用。
 * 菜单项按条目状态生成：可播条目提供播放/下载，其余提供标记已看/收藏/删除；
 * 标记与收藏先回调父级做乐观更新，失败回调相反值回滚；删除需二次确认。
 */
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MediaLibraryItem } from '@/adapter/model';
import { AnchorMenu, type AnchorMenuItem, type AnchorRect } from '@/component/AnchorMenu';
import { showToast } from '@/component/Toast';
import { ROUTES } from '@/constant/navigation';
import { useT } from '@/i18n';
import { AppError, errorMessageOf } from '@/infra/error';
import { downloadService } from '@/service/DownloadService';
import { itemActionService } from '@/service/ItemActionService';
import { markService } from '@/service/MarkService';
import { playbackService } from '@/service/PlaybackService';
import type { RootStackParamList } from '@/page/navigation/types';
import { useSettingsStore } from '@/store/settingsStore';

type ItemActionNavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 长按菜单「播放/下载」可用的单文件条目类型 */
function isPlayableItem(item: MediaLibraryItem): boolean {
  return (
    item.type === 'Movie' ||
    item.type === 'Episode' ||
    item.type === 'Video' ||
    item.type === 'Trailer' ||
    item.type === 'MusicVideo'
  );
}

/** 操作失败 Toast（文案取 ERROR_MESSAGE_MAP 唯一出处） */
function toastError(err: unknown): void {
  const code = err instanceof AppError ? err.code : 'UNKNOWN';
  showToast(errorMessageOf(code), 'error');
}

interface ItemActionMenuProps {
  /** 长按目标条目（null=关闭） */
  item: MediaLibraryItem | null;
  /** 长按卡片矩形（null=关闭） */
  anchor: AnchorRect | null;
  onClose: () => void;
  /** 已看态乐观更新；服务失败时组件会以相反值再回调一次回滚 */
  onPlayedChange?: (item: MediaLibraryItem, played: boolean) => void;
  /** 收藏态乐观更新；服务失败时组件会以相反值再回调一次回滚 */
  onFavoriteChange?: (item: MediaLibraryItem, favorite: boolean) => void;
  /** 删除成功（父级摘除列表条目） */
  onDeleted?: (item: MediaLibraryItem) => void;
}

export function ItemActionMenu({
  item,
  anchor,
  onClose,
  onPlayedChange,
  onFavoriteChange,
  onDeleted,
}: ItemActionMenuProps) {
  const navigation = useNavigation<ItemActionNavigationProp>();
  const tr = useT();

  if (item === null || anchor === null) {
    return null;
  }

  /** 直接起播：断点续播开启时有断点从断点续播，否则（关闭/已看完）从头播 */
  const handlePlay = () => {
    void (async () => {
      try {
        const resumeEnabled = useSettingsStore.getState().resumePlaybackEnabled;
        const session = await playbackService.resolve(item.id, {
          startPositionMs:
            resumeEnabled && !item.userData.played ? item.userData.playbackPositionMs : 0,
        });
        navigation.navigate(ROUTES.PLAYER, {
          session: { ...session, name: item.name, itemType: item.type },
        });
      } catch (err) {
        toastError(err);
      }
    })();
  };

  const handleDownload = () => {
    void downloadService
      .startDownload(item)
      .then(() => showToast(tr('item.downloadQueued', { name: item.name })))
      .catch(toastError);
  };

  const handleTogglePlayed = () => {
    const nextPlayed = !item.userData.played;
    onPlayedChange?.(item, nextPlayed);
    markService.setPlayed(item.id, nextPlayed).catch((err: unknown) => {
      onPlayedChange?.(item, !nextPlayed);
      toastError(err);
    });
  };

  const handleToggleFavorite = () => {
    const nextFavorite = !item.userData.favorite;
    onFavoriteChange?.(item, nextFavorite);
    markService.setFavorite(item.id, nextFavorite).catch((err: unknown) => {
      onFavoriteChange?.(item, !nextFavorite);
      toastError(err);
    });
  };

  /** 删除服务器条目（二次确认；需要服务器删除权限，失败 Toast） */
  const handleDelete = () => {
    Alert.alert(
      tr('item.deleteTitle'),
      tr('item.deleteMessage', { name: item.name }),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('common.delete'),
          style: 'destructive',
          onPress: () => {
            void itemActionService
              .deleteItem(item.id)
              .then(() => {
                onDeleted?.(item);
                showToast(tr('item.deleted'));
              })
              .catch(toastError);
          },
        },
      ]
    );
  };

  const menuItemList: AnchorMenuItem[] = [];
  if (isPlayableItem(item)) {
    menuItemList.push(
      { key: 'play', label: tr('action.play'), icon: 'play', onPress: handlePlay },
      { key: 'download', label: tr('action.download'), icon: 'download', onPress: handleDownload }
    );
  }
  menuItemList.push(
    {
      key: 'played',
      label: item.userData.played ? tr('item.markUnplayed') : tr('item.markPlayed'),
      icon: item.userData.played ? 'flagOutline' : 'flag',
      onPress: handleTogglePlayed,
    },
    {
      key: 'favorite',
      label: item.userData.favorite ? tr('action.unfavorite') : tr('item.addFavorite'),
      icon: item.userData.favorite ? 'heart' : 'heartOutline',
      onPress: handleToggleFavorite,
    },
    {
      key: 'delete',
      label: tr('common.delete'),
      icon: 'trash',
      tone: 'danger',
      onPress: handleDelete,
    }
  );

  return <AnchorMenu anchor={anchor} itemList={menuItemList} onClose={onClose} />;
}
