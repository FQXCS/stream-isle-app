/**
 * 收藏按钮（音频迷你条 / Now Playing 共用）：空心=未收藏、实心红=已收藏，点击切换。
 * 挂载时查询收藏态（调用方以 trackId 作 key 即可切歌重取）；切换乐观更新，失败回滚并 Toast。
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { AppIcon } from '@/component/AppIcon';
import { showToast } from '@/component/Toast';
import { useTheme } from '@/component/useTheme';
import { AppError, errorMessageOf } from '@/infra/error';
import { markService } from '@/service/MarkService';

interface FavoriteButtonProps {
  trackId: string;
  /** 未收藏时的图标颜色（默认主题 accent） */
  inactiveColor?: string;
  /** 图标尺寸 */
  size?: number;
  /** 按钮容器样式 */
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
}

export function FavoriteButton({
  trackId,
  inactiveColor,
  size = 22,
  style,
  hitSlop = 8,
}: FavoriteButtonProps) {
  const t = useTheme();
  const [favorite, setFavorite] = useState(false);
  const [pending, setPending] = useState(false);
  /** 用户已手动切换过：初始查询晚到时不覆盖乐观结果 */
  const touchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    touchedRef.current = false;
    void markService
      .isFavorite(trackId)
      .then((value) => {
        if (!cancelled && !touchedRef.current) {
          setFavorite(value);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const toggleFavorite = () => {
    if (pending) {
      return;
    }
    touchedRef.current = true;
    const next = !favorite;
    setFavorite(next);
    setPending(true);
    void markService
      .setFavorite(trackId, next)
      .catch((err: unknown) => {
        setFavorite(!next);
        const code = err instanceof AppError ? err.code : 'UNKNOWN';
        showToast(errorMessageOf(code), 'error');
      })
      .finally(() => {
        setPending(false);
      });
  };

  return (
    <Pressable
      hitSlop={hitSlop}
      style={style}
      onPress={toggleFavorite}
      accessibilityLabel={favorite ? '取消收藏' : '收藏'}
    >
      <AppIcon
        name={favorite ? 'heart' : 'heartOutline'}
        size={size}
        color={favorite ? t.danger : (inactiveColor ?? t.accent)}
      />
    </Pressable>
  );
}
