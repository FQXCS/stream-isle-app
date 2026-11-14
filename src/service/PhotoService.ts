/**
 * 照片服务（M5 文档 §4.6/§4.14）：相册/照片分页 + 保存到系统相册。
 * 保存链路为本节唯一实现契约（M6 文档 :481 的 saveToLibraryAsync 口径按 M5 §4.14 回改为
 * 回归验证）：requestPermissionsAsync(writeOnly) → FileSystem.downloadAsync 原图到 cacheDirectory
 * → createAssetAsync → getAlbumAsync/createAlbumAsync「Stream Isle」→ addAssetsToAlbumAsync。
 * 照片浏览全程零播放会话、零进度上报（设计文档 §7.6，A21）。
 * SDK 58 口径：组合式资产/相册 API 在 expo-media-library/legacy 导出（根导出运行时抛错）；
 * requestPermissionsAsync 签名为 (writeOnly?: boolean)（M5 文档的对象参数按锁定 SDK 修正）。
 */
import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';

import type { Paged, PhotoItem, SortByEnum } from '@/adapter/model';
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
  /**
   * 照片分页（widths 由页面经 util/photo 计算后传入，adapter 预拼三个 URL）：
   * parentId 可传相册 id（相册内）或库 id（「图片」段的全部图片，Recursive=true）。
   */
  async loadPhotos(
    parentId: string,
    page: number,
    widths: { gridMaxWidth: number; viewerMaxWidth: number },
    sort?: { sortBy: SortByEnum; sortOrder: 'ASC' | 'DESC' }
  ): Promise<Paged<PhotoItem>> {
    const adapter = getActiveAdapter();
    return adapter.getPhotos(requireUserId(), parentId, page, widths, sort);
  }

  /**
   * 保存原图到系统相册「Stream Isle」（M5 文档 §4.14 流程）。
   * GIF 下载保存后仍为动图（downloadAsync 原字节落盘）；任一步失败抛
   * PHOTO_SAVE_PERMISSION_DENIED / PHOTO_SAVE_FAILED，调用方 toast。
   */
  async saveToGallery(photo: PhotoItem): Promise<void> {
    // 原图下载到 cacheDirectory（系统可回收；保存走原图，网格/查看器缩放图不落盘）
    const fileName = photo.fileName ?? 'photo';
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    try {
      await FileSystem.downloadAsync(photo.originalImageUrl, fileUri);
    } catch (error) {
      throw new AppError('PHOTO_SAVE_FAILED', { cause: error });
    }
    await this.saveFileToGallery(fileUri);
  }

  /**
   * 本地文件保存到系统相册（照片原图与播放截图共用权限与建资产链路）：
   * 权限 → createAssetAsync；withAlbum 时再取/建「Stream Isle」相册入相册。
   * 截图传 false：入相册的 move 在 Android R+ 每次弹系统「修改此照片」确认，逐次截图不可接受。
   * 失败抛 PHOTO_SAVE_* 由调用方 toast。
   */
  async saveFileToGallery(fileUri: string, withAlbum = true): Promise<void> {
    // 1) 相册权限：取/建相册（getAlbumAsync）需读权限，writeOnly 在新版 Android 会被拒，
    //    故请求完整权限（Android 音画同步延时+ 弹系统授权框；SDK 58 签名 = 布尔参）
    let permission: MediaLibrary.PermissionResponse;
    try {
      permission = await MediaLibrary.requestPermissionsAsync(false);
    } catch (error) {
      throw new AppError('PHOTO_SAVE_FAILED', { cause: error });
    }
    if (!permission.granted) {
      throw new AppError('PHOTO_SAVE_PERMISSION_DENIED');
    }
    // 2) 建立系统媒体库资产；照片再取/建「Stream Isle」相册入相册
    try {
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      if (withAlbum) {
        let album = await MediaLibrary.getAlbumAsync(SAVE_ALBUM_NAME);
        if (album === null) {
          album = await MediaLibrary.createAlbumAsync(SAVE_ALBUM_NAME, asset, false);
        }
        await MediaLibrary.addAssetsToAlbumAsync([asset.id], album.id, false);
      }
    } catch (error) {
      throw new AppError('PHOTO_SAVE_FAILED', { cause: error });
    }
  }
}

/** 全局单例 */
export const photoService = new PhotoService();
