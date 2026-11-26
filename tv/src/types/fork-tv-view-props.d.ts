/**
 * react-native-tvos fork ViewProps 类型补全（TV-m3）：fork 原生 ReactViewManager 已支持
 * 四向焦点陷阱属性 trapFocusUp/Down/Left/Right（ReactViewGroup.focusSearch 按方向拦截
 * 焦点搜索，使焦点留在容器子树内），但 types_generated 的 TVViewProps 未跟上（仅
 * types_DEPRECATED/public/ReactNativeTVTypes.d.ts 有声明，tv tsconfig 指向 types_generated）。
 * 此处模块增强补全四个属性；运行时 props 原样透传原生，抽屉/倍速菜单 trapFocus 消费。
 */
import 'react-native';

declare module 'react-native' {
  interface ViewProps {
    /** 焦点陷阱：UP 方向键焦点搜索限制在本容器子树内 */
    trapFocusUp?: boolean;
    /** 焦点陷阱：DOWN 方向键焦点搜索限制在本容器子树内 */
    trapFocusDown?: boolean;
    /** 焦点陷阱：LEFT 方向键焦点搜索限制在本容器子树内 */
    trapFocusLeft?: boolean;
    /** 焦点陷阱：RIGHT 方向键焦点搜索限制在本容器子树内 */
    trapFocusRight?: boolean;
  }
}