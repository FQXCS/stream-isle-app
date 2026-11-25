/**
 * TV 网格等宽单元帧宽（TV-m2 §4.1）：内容区宽度（屏宽 − overscan 外框 2×32 −
 * 网格留白 2×16）按列数均分，单元内边距 8×2 充当列间隙（FlatList numColumns 无 columnGap）。
 * TvWallGrid / TvItemListScreen 网格共用，保证两处网格密度一致。
 */
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { TV_GRID_COLUMNS, TV_GRID_CONTENT_PADDING, TV_GRID_GAP } from '@tv/constant/library';
import { TV_OVERSCAN_PADDING } from '@tv/component/TvScreenFrame';

/** 下限保护：极端窄窗下网格单元不塌缩到不可读 */
const MIN_CELL_WIDTH = 96;

export function useTvGridCellWidth(): number {
  const window = useWindowDimensions();
  return useMemo(() => {
    const contentWidth = window.width - 2 * TV_OVERSCAN_PADDING - 2 * TV_GRID_CONTENT_PADDING;
    return Math.max(MIN_CELL_WIDTH, Math.floor(contentWidth / TV_GRID_COLUMNS) - TV_GRID_GAP);
  }, [window.width]);
}
