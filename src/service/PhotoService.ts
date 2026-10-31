/**
 * 照片服务（M5 文档 §4.6/§4.14）：相册/照片分页 + 保存到系统相册。
 * 保存链路为本节唯一实现契约（06 文档 :481 的 saveToLibraryAsync 口径按 05 §4.14 回改为
 * 回归验证）：requestPermissionsAsync(writeOnly) → FileSystem.downloadAsync 原图到 cacheDirectory
 * → createAssetAsync → getAlbumAsync/createAlbumAsync「Stream Isle」→ addAssetsToAlbumAsync。
 * 照片浏览全程零播放会话、零进度上报（设计文档 §7.6，A21）。
 * SDK 58 口径：组合式资产/相册 API 在 expo-media-library/legacy 导出（根导出运行时抛错）；
 * requestPermissionsAsync 签名为 (writeOnly?: boolean)（05 文档的对象参数按锁定 SDK 修正）。
 */
import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';

import type { Paged, PhotoAlbumSummary, PhotoItem } from '@/adapter/model';
import { SAVE_ALBUM_NAME } from '@/constant/photo';
import { AppError } from '@/infra/error';
import { getActiveAdapter } from '@/service/adapterProvider';
import { useAccountStore } from '@/store/accountStore';

function requireUserId(): string {
  const active = useAccountStore.getState().active;
  if (!active) {
    throw new Error('时序错误：无活跃账号时不应调用 PhotoService');
  }
  return active.userId;
}

export class PhotoService {
  /** 相册网格分页（封面 = 相册 Primary 服务器自动取首图，名称/数量随条目） */
  async loadAlbums(libraryId: string, page: number): Promise<Paged<PhotoAlbumSummary>> {
    const adapter = getActiveAdapter();
    return adapter.getPhotoAlbums(requireUserId(), libraryId, page);
  }

  /** 相册内照片分页（widths 由页面经 util/photo 计算后传入，adapter 预拼三个 URL） */
  async loadPhotos(
    albumId: string,
    page: number,
    widths: { gridMaxWidth: number; viewerMaxWidth: number }
  ): Promise<Paged<PhotoItem>> {
    const adapter = getActiveAdapter();
    return adapter.getPhotos(requireUserId(), albumId, page, widths);
  }

  /**
   * 保存原图到系统相册「Stream Isle」（05 文档 §4.14 流程）。
   * GIF 下载保存后仍为动图（downloadAsync 原字节落盘）；任一步失败抛
   * PHOTO_SAVE_PERMISSION_DENIED / PHOTO_SAVE_FAILED，调用方 toast。
   */
  async saveToGallery(photo: PhotoItem): Promise<void> {
    // 1) 相册写入权限（Android 10+ 系统自动放行，API 26–28 弹运行时权限；SDK 58 签名 = 布尔参）
    let permission: MediaLibrary.PermissionResponse;
    try {
      permission = await MediaLibrary.requestPermissionsAsync(true);
    } catch (error) {
      throw new AppError('PHOTO_SAVE_FAILED', { cause: error });
    }
    if (!permission.granted) {
      throw new AppError('PHOTO_SAVE_PERMISSION_DENIED');
    }
    // 2) 原图下载到 cacheDirectory（系统可回收；保存走原图，网格/查看器缩放图不落盘）
    const fileName = photo.fileName ?? 'photo';
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    try {
      await FileSystem.downloadAsync(photo.originalImageUrl, fileUri);
      // 3) 建立系统媒体库资产 → 取/建「Stream Isle」相册 → 资产入相册
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      let album = await MediaLibrary.getAlbumAsync(SAVE_ALBUM_NAME);
      if (album === null) {
        album = await MediaLibrary.createAlbumAsync(SAVE_ALBUM_NAME, asset, false);
      }
      await MediaLibrary.addAssetsToAlbumAsync([asset.id], album.id, false);
    } catch (error) {
      throw new AppError('PHOTO_SAVE_FAILED', { cause: error });
    }
  }
}

/** 全局单例 */
export const photoService = new PhotoService();
