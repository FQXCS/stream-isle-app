/**
 * 键盘感知滚动容器（服务器添加 / 编辑等表单页）：
 * Android edge-to-edge 下 windowSoftInputMode=adjustResize 不再收缩窗口，
 * 普通 ScrollView 底部内容会被输入法遮挡。键盘弹起时在内容末尾补等高占位，
 * 使全部表单项可滚动到键盘上方；聚焦输入框时自动把它滚到键盘上方。
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  ScrollView,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ScrollViewProps,
} from 'react-native';

/** 聚焦输入框底部与键盘顶部保留的间距（dp） */
const FOCUS_MARGIN = 24;

export interface KeyboardAwareScrollViewHandle {
  /** 把当前聚焦的输入框滚到键盘上方（供 TextInput onFocus 调用） */
  scrollToFocusedInput: () => void;
}

export const KeyboardAwareScrollView = forwardRef<KeyboardAwareScrollViewHandle, ScrollViewProps>(
  function KeyboardAwareScrollView({ children, onScroll, onContentSizeChange, ...rest }, ref) {
    const scrollRef = useRef<ScrollViewInstance>(null);
    const offsetY = useRef(0);
    /** 键盘顶部 y（窗口坐标）；null 表示键盘收起 */
    const keyboardTop = useRef<number | null>(null);
    /** 键盘刚弹起：等内容末尾占位插入后再滚动一次，避免内容后续变化时反复滚动 */
    const pendingScroll = useRef(false);
    const [keyboardInset, setKeyboardInset] = useState(0);

    const scrollToFocusedInput = useCallback(() => {
      const top = keyboardTop.current;
      const input = TextInput.State.currentlyFocusedInput();
      if (top === null || input === undefined) {
        return;
      }
      // measureInWindow 与键盘顶部同为窗口坐标，可直接比较
      input.measureInWindow((_x, y, _width, height) => {
        const delta = y + height + FOCUS_MARGIN - top;
        if (delta > 0) {
          scrollRef.current?.scrollTo({ y: offsetY.current + delta, animated: true });
        }
      });
    }, []);

    useEffect(() => {
      const show = Keyboard.addListener('keyboardDidShow', ({ endCoordinates }) => {
        keyboardTop.current = endCoordinates.screenY;
        pendingScroll.current = true;
        setKeyboardInset(Math.max(Dimensions.get('window').height - endCoordinates.screenY, 0));
      });
      const hide = Keyboard.addListener('keyboardDidHide', () => {
        keyboardTop.current = null;
        pendingScroll.current = false;
        setKeyboardInset(0);
      });
      return () => {
        show.remove();
        hide.remove();
      };
    }, []);

    useImperativeHandle(ref, () => ({ scrollToFocusedInput }), [scrollToFocusedInput]);

    return (
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        {...rest}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          offsetY.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
        onContentSizeChange={(width, height) => {
          onContentSizeChange?.(width, height);
          // 占位插入后内容尺寸变化，此时才有足够的滚动区间，补一次聚焦滚动
          if (pendingScroll.current) {
            pendingScroll.current = false;
            scrollToFocusedInput();
          }
        }}
      >
        {children}
        {keyboardInset > 0 && <View style={{ height: keyboardInset }} />}
      </ScrollView>
    );
  }
);
