/**
 * 页面加载状态约定（M4 §4.2）：各页面持有 status + error?: AppError。
 * 渲染规则：页面级失败 → ErrorView；操作级失败（收藏/已看/设置保存）→ Toast，不整页替换；
 * 分区级空 → 隐藏分区，页面级空 → EmptyView。
 */
export type PageLoadStatus = 'loading' | 'ready' | 'error' | 'empty';
