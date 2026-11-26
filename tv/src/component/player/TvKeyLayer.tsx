/**
 * TV 遥控按键层（TV-m3 §4.2，TV 设计 §8.1 按键映射表落地）：useTVEventHandler 收
 * fork onHWKeyEvent 设备事件（select/up/down/left/right/menu），按控制层显隐与焦点
 * 上下文分发。单通道原则（风险 3）：BACK 不在本层处理——fork 遥控 BACK 走 BackHandler
 * （页面统一收口抽屉→控制层→退出层级），本层不重复消费。
 * 单击语义（TV-m3-S3）：仅响应 eventKeyAction=1（ACTION_UP）——长按连发为 ACTION_DOWN
 * 重复事件，首版不做连发 seek，松手一次提交 ±10s。
 * 上下文判定：SeekBar 聚焦（seekBarFocused）时 ←→ 步进；顶栏聚焦（topBarFocused）
 * 时 DOWN 隐藏控制层；其余方向键/OK 交原生焦点搜索与聚焦按钮 click（本层不拦截）。
 * 注：fork 0.88.1-0 的 onHWKeyEvent.tag 恒 undefined（原生 lastFocusedViewId 未维护），
 * 故焦点上下文一律经 JS onFocus/onBlur 追踪的布尔态判定，不依赖事件 tag（TV-m3-S4）。
 * 重启中（isRestartingSession）与非播放态（active=false）屏蔽全部按键。
 */
import { useCallback } from 'react';
import { useTVEventHandler } from 'react-native';
import type { TVRemoteEvent } from 'react-native';

import { TV_SEEK_STEP_MS } from '@tv/constant/player';

interface TvKeyLayerProps {
  /** 播放态门控（playing/paused 才响应；loading/error 屏蔽） */
  active: boolean;
  controlsVisible: boolean;
  /** 抽屉/倍速菜单打开（方向键/OK 交菜单焦点，MENU 切抽屉） */
  menuOpen: boolean;
  isRestartingSession: boolean;
  /** SeekBar 焦点态（聚焦步进上下文判定；JS 焦点事件追踪） */
  seekBarFocused: boolean;
  /** 顶栏焦点态（DOWN 隐藏控制层判定） */
  topBarFocused: boolean;
  /** 呼出控制层（OK/UP，焦点落播放键由页面 preferredFocus 驱动） */
  onShowControls: () => void;
  /** 隐藏控制层（顶栏 DOWN） */
  onHideControls: () => void;
  /** seek 步进（控制层隐藏 ←→ / SeekBar 聚焦 ←→） */
  onSeekBy: (deltaMs: number) => void;
  /** MENU 直达设置抽屉 */
  onOpenMoreMenu: () => void;
}

export function TvKeyLayer({
  active,
  controlsVisible,
  menuOpen,
  isRestartingSession,
  seekBarFocused,
  topBarFocused,
  onShowControls,
  onHideControls,
  onSeekBy,
  onOpenMoreMenu,
}: TvKeyLayerProps) {
  const handleEvent = useCallback(
    (evt: TVRemoteEvent) => {
      if (!active || isRestartingSession) {
        return;
      }
      // 仅松手提交（eventKeyAction 运行时为 number：0=DOWN 1=UP；fork 类型标注 string，
      // Number() 归一兼容——长按连发的 DOWN 重复事件在此过滤，TV-m3-S3）
      if (Number(evt.eventKeyAction) !== 1) {
        return;
      }
      const type = evt.eventType;
      // 菜单打开：方向键/OK 交菜单内焦点导航（trapFocus），MENU 切设置抽屉
      if (menuOpen) {
        if (type === 'menu') {
          onOpenMoreMenu();
        }
        return;
      }
      if (!controlsVisible) {
        if (type === 'select' || type === 'up') {
          onShowControls();
        } else if (type === 'left') {
          onSeekBy(-TV_SEEK_STEP_MS);
        } else if (type === 'right') {
          onSeekBy(TV_SEEK_STEP_MS);
        } else if (type === 'menu') {
          onOpenMoreMenu();
        }
        return;
      }
      // 控制层可见：SeekBar 聚焦 ←→ 步进（nextFocus 自环留焦），其余 ←→ 交原生焦点移动
      if (type === 'left' || type === 'right') {
        if (seekBarFocused) {
          onSeekBy(type === 'left' ? -TV_SEEK_STEP_MS : TV_SEEK_STEP_MS);
        }
        return;
      }
      // 顶栏聚焦 DOWN 隐藏控制层；其余 DOWN 交原生焦点移动
      if (type === 'down' && topBarFocused) {
        onHideControls();
        return;
      }
      if (type === 'menu') {
        onOpenMoreMenu();
      }
      // select/up 及其余键：交原生聚焦按钮 click / 焦点搜索
    },
    [
      active,
      isRestartingSession,
      menuOpen,
      controlsVisible,
      seekBarFocused,
      topBarFocused,
      onShowControls,
      onHideControls,
      onSeekBy,
      onOpenMoreMenu,
    ]
  );
  useTVEventHandler(handleEvent);
  return null;
}