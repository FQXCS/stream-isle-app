/**
 * 转场协调 store（M6 文档 §4.6.2；设计文档 §10.1）：海报 → 详情共享元素转场专用。
 * 不持久化（无 persist 包装）：转场为瞬时内存态。
 * 流程：PosterCard 按下时 begin（海报 URI + 屏幕坐标 fromRect）→ 详情页 Hero 渲染后
 * markTarget（目标矩形）→ 根级 SharedPosterOverlay 读 active + target 播放 250ms 飞行 →
 * end() 清空。测量失败/快速连点/目标未就绪 → 不挂浮层退化为普通转场（兜底，06 §4.6.2）。
 */
import { create } from 'zustand';

/** 海报转场矩形（屏幕绝对坐标） */
export interface PosterTransitionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 一次转场上下文（起点海报 + 目标矩形） */
export interface PosterTransition {
  uri: string;
  fromRect: PosterTransitionRect;
  targetRect: PosterTransitionRect | null;
}

interface TransitionStore {
  active: PosterTransition | null;
  /** PosterCard 按下时调用（targetRect 先置 null，等 Hero 测量回填） */
  begin(t: { uri: string; fromRect: PosterTransitionRect }): void;
  /** ItemDetailScreen Hero 渲染后测量目标矩形并标记「目标就绪」 */
  markTarget(rect: PosterTransitionRect): void;
  /** 飞行完成后清空（overlay 播完或兜底路径调用） */
  end(): void;
}

export const useTransitionStore = create<TransitionStore>()((set, get) => ({
  active: null,

  begin: ({ uri, fromRect }) => {
    set({ active: { uri, fromRect, targetRect: null } });
  },

  markTarget: (rect) => {
    const active = get().active;
    if (active === null) {
      return;
    }
    set({ active: { ...active, targetRect: rect } });
  },

  end: () => {
    set({ active: null });
  },
}));
