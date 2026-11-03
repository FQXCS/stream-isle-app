/**
 * Emby / Jellyfin 官方品牌图标（按官网品牌图形绘制，react-native-svg 内联，无外部图片依赖）。
 * Emby：绿色渐变菱形 + 播放三角形（官方品牌色 #52B54B）；
 * Jellyfin：紫 → 蓝渐变「播放山脉」标志（官方 logo.svg 图形，渐变 #AA5CC3 → #00A4DC）。
 */
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import type { ServerFlavor } from '@/adapter/model';

/** Jellyfin 官方标志（logo.svg 中图标部分的两个路径） */
const JELLYFIN_INNER_PATH =
  'M24.711 49.158c-1.552-3.116 8.626-21.57 11.788-21.57 3.167.002 13.323 18.488 11.788 21.57-1.535 3.081-22.025 3.115-23.577 0z';
const JELLYFIN_OUTER_PATH =
  'M.98 64.996C-3.695 55.606 26.977.001 36.5.001c9.533 0 40.153 55.713 35.527 64.995s-66.368 9.391-71.045 0m12.255-8.148c3.065 6.152 43.518 6.084 46.548 0 3.03-6.086-17.033-42.587-23.275-42.587S10.17 50.695 13.234 56.848z';

/** Emby 官方标志（绿色菱形 + 播放键，官方品牌色 #52B54B） */
const EMBY_PATH =
  'M11.041 0c-.007 0-1.456 1.43-3.219 3.176L4.615 6.352l.512.513.512.512-2.819 2.791L0 12.961l1.83 1.848c1.006 1.016 2.438 2.46 3.182 3.209l1.351 1.359.508-.496c.28-.273.515-.498.524-.498.008 0 1.266 1.264 2.794 2.808L12.97 24l.187-.182c.23-.225 5.007-4.95 5.717-5.656l.52-.516-.502-.513c-.276-.282-.5-.52-.496-.53.003-.009 1.264-1.26 2.802-2.783 1.538-1.522 2.8-2.776 2.803-2.785.005-.012-3.617-3.684-6.107-6.193L17.65 4.6l-.505.505c-.279.278-.517.501-.53.497-.013-.005-1.27-1.267-2.793-2.805A449.655 449.655 0 0011.041 0zM9.223 7.367c.091.038 7.951 4.608 7.957 4.627.003.013-1.781 1.056-3.965 2.32a999.898 999.898 0 01-3.996 2.307c-.019.006-.026-1.266-.026-4.629 0-3.7.007-4.634.03-4.625Z';

interface ServerFlavorLogoProps {
  flavor: ServerFlavor;
  size?: number;
}

export function ServerFlavorLogo({ flavor, size = 32 }: ServerFlavorLogoProps) {
  if (flavor === 'EMBY') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <LinearGradient id="embyLogoGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#8ED97A" />
            <Stop offset="1" stopColor="#3F9E3A" />
          </LinearGradient>
        </Defs>
        <Path d={EMBY_PATH} fill="url(#embyLogoGradient)" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72">
      <Defs>
        <LinearGradient id="jellyfinLogoGradient" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#AA5CC3" />
          <Stop offset="1" stopColor="#00A4DC" />
        </LinearGradient>
      </Defs>
      <Path d={JELLYFIN_INNER_PATH} fill="url(#jellyfinLogoGradient)" />
      <Path
        d={JELLYFIN_OUTER_PATH}
        fill="url(#jellyfinLogoGradient)"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </Svg>
  );
}
