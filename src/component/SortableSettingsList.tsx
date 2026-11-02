/**
 * 可拖动设置列表（已启用区）：基于 react-native-reorderable-list（Reanimated 4 兼容），
 * 行内长按 DragHandle 触发拖动；提供 header/footer/onReorder。
 */
import type { ReactNode } from 'react';
import ReorderableList, {
  reorderItems,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import { StyleSheet } from 'react-native';

import { SPACING } from '@/constant/theme';

interface SortableSettingsListProps<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, drag: () => void, index: number) => ReactNode;
  onReorder: (ordered: T[]) => void;
  header?: ReactNode;
  footer?: ReactNode;
  empty?: ReactNode;
}

/** 列表项包装：useReorderableDrag 必须在 ReorderableList 的 cell 内调用 */
function DraggableRow<T>({
  item,
  index,
  renderItem,
}: {
  item: T;
  index: number;
  renderItem: (item: T, drag: () => void, index: number) => ReactNode;
}) {
  const drag = useReorderableDrag();
  return <>{renderItem(item, drag, index)}</>;
}

export function SortableSettingsList<T>({
  data,
  keyExtractor,
  renderItem,
  onReorder,
  header,
  footer,
  empty,
}: SortableSettingsListProps<T>) {
  const handleReorder = ({ from, to }: ReorderableListReorderEvent) => {
    onReorder(reorderItems(data, from, to));
  };

  return (
    <ReorderableList
      style={styles.fill}
      data={data}
      keyExtractor={keyExtractor}
      onReorder={handleReorder}
      renderItem={({ item, index }) => (
        <DraggableRow item={item} index={index} renderItem={renderItem} />
      )}
      ListHeaderComponent={header === undefined ? undefined : <>{header}</>}
      ListFooterComponent={footer === undefined ? undefined : <>{footer}</>}
      ListEmptyComponent={empty === undefined ? undefined : <>{empty}</>}
      contentContainerStyle={styles.content}
      // 长按 DragHandle 才启动拖动，避免与 Switch/返回手势冲突
      panActivateAfterLongPress={200}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: SPACING.l, paddingBottom: SPACING.xl },
});
