/**
 * 照片宽度策略单测（M5 文档 §6.1：getPhotoCellMaxWidth 390dp/3dpr/3 列 → 390；
 * getPhotoViewerMaxWidth 390dp/3dpr → 1170）。
 */
import { getPhotoCellMaxWidth, getPhotoViewerMaxWidth } from '@/util/photo';

describe('getPhotoCellMaxWidth（网格格子请求宽，物理像素）', () => {
  it('390dp / dpr 3 / 3 列 → 390', () => {
    expect(getPhotoCellMaxWidth(390, 3, 3)).toBe(390);
  });

  it('412dp / dpr 2.75 / 3 列 → 378（向上取整）', () => {
    expect(getPhotoCellMaxWidth(412, 2.75, 3)).toBe(378);
  });

  it('2 列相册网格：390/3/2 → 585', () => {
    expect(getPhotoCellMaxWidth(390, 3, 2)).toBe(585);
  });
});

describe('getPhotoViewerMaxWidth（查看器请求宽 = 屏幕宽×dpr）', () => {
  it('390dp / dpr 3 → 1170', () => {
    expect(getPhotoViewerMaxWidth(390, 3)).toBe(1170);
  });

  it('412dp / dpr 2.75 → 1133（向上取整）', () => {
    expect(getPhotoViewerMaxWidth(412, 2.75)).toBe(1133);
  });
});
