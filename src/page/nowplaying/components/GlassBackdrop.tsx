/**
 * NowPlaying 玻璃背景（05 文档 §4.10）：有封面时取当前曲封面模糊铺满全屏，形成随曲变化的
 * 玻璃底；无封面时回退「当前主题」的默认玻璃渐变（浅色主题暖白、深色主题冷蓝），
 * 与页面文字/控件配色同源（NowPlaying 按有无封面切换 tone）。
 * 封面 URL 与页面大图同源（AUDIO_ARTWORK_MAX_WIDTH），命中 expo-image 缓存；
 * Android 侧为软件模糊（expo-image 内部半径 clamp 25），只在解码时做一次，刷新不重复计算。
 */
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useResolvedScheme } from '@/component/useTheme';

/** 模糊半径（expo-image Android 侧上限 25，取满值尽量抹平封面细节） */
const BLUR_RADIUS = 25;
/** 压暗罩：模糊封面亮度不可控，压到白字可读又不失封面色彩（仅封面态） */
const SCRIM_COLOR = 'rgba(8, 11, 15, 0.34)';
/** 无封面兜底：深色主题冷蓝玻璃 */
const FALLBACK_GRADIENT_DARK =
  'linear-gradient(180deg, #33475C 0%, #1B2733 45%, #0B0F14 100%)';
/** 无封面兜底：浅色主题暖白玻璃（与浅色 token 同色系） */
const FALLBACK_GRADIENT_LIGHT =
  'linear-gradient(180deg, #FFFFFF 0%, #F0F4F9 50%, #DFE6EF 100%)';

interface GlassBackdropProps {
  coverImageUrl?: string;
}

export function GlassBackdrop({ coverImageUrl }: GlassBackdropProps) {
  const scheme = useResolvedScheme();

  return (
    <View style={styles.fill} pointerEvents="none">
      {coverImageUrl !== undefined ? (
        <>
          <Image
            source={{ uri: coverImageUrl }}
            style={styles.fill}
            contentFit="cover"
            blurRadius={BLUR_RADIUS}
            transition={300}
          />
          <View style={[styles.fill, styles.scrim]} />
        </>
      ) : (
        <View
          style={[
            styles.fill,
            {
              backgroundImage:
                scheme === 'light' ? FALLBACK_GRADIENT_LIGHT : FALLBACK_GRADIENT_DARK,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  scrim: { backgroundColor: SCRIM_COLOR },
});
