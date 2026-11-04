/**
 * 图书阅读页（M7）：全屏沉浸 WebView + PDF.js 阅读器。
 * 流程：ensureLocalPdf 取本地缓存（未命中带进度下载）→ WebView 加载 android_asset/pdf/reader.html
 * → onLoadEnd 注入 init(fileUri, mode) → HTML postMessage 上报 ready/page/tap/error。
 * 两种阅读方向（底部控制条切换，偏好存 MMKV）：上下连续滚动（垂直虚拟化、双击 1x/2x 缩放）
 * 与左右整页翻页（一屏一页横向吸附）。页码条复用 SeekBar（page 当时长语义，比例换算即页码，
 * 点击/拖动注入 goToPage 跳页）；断点经 BookReaderService 存 MMKV；读至末页自动 markRead（幂等一次）。
 * PDF 渲染、滚动、缩放手势均在 reader.html 内实现，本页只做编排与控制层 UI
 * （页面薄编排、逻辑在服务，M2 模式）。
 */
import { useCallback, useRef, useState, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebViewBase, { type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';

import { AppIcon } from '@/component/AppIcon';
import { ErrorView } from '@/component/ErrorView';
import { LoadingView } from '@/component/LoadingView';
import { useTheme } from '@/component/useTheme';
import { FONT_SIZE, SPACING } from '@/constant/theme';
import { AppError } from '@/infra/error';
import { SeekBar } from '@/page/player/components/SeekBar';
import type { RootStackParamList } from '@/page/navigation/types';
import { bookReaderService, type BookReadingMode } from '@/service/BookReaderService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 页面阶段：取文件（含下载）→ WebView 就绪渲染中 → 失败 */
type ReaderPhase = 'loadingFile' | 'rendering' | 'error';

/** 阅读方向选项（底部控制条二选一，取值与 reader.html 的 mode 一致） */
const READING_MODE_OPTIONS: { mode: BookReadingMode; label: string }[] = [
  { mode: 'vertical', label: '上下滑动' },
  { mode: 'horizontal', label: '左右翻页' },
];

/** reader.html → RN 的消息形态（桥协议见 reader.html 头注释） */
interface ReaderMessage {
  type: 'ready' | 'rendered' | 'tap' | 'page' | 'error';
  page?: number;
  pageCount?: number;
  message?: string;
}

/** reader.html 加载入口（plugin 拷至 android/app/src/main/assets/pdf/，见 withPdfAssets） */
const READER_HTML_URI = 'file:///android_asset/pdf/reader.html';

/** WebView 实例类型（goBack/reload/injectJavaScript 等实例方法） */
type WebViewHandle = InstanceType<typeof WebViewBase>;
// react-native-webview 14.0.1 的 class 泛型默认参数（P=undefined）与 TS 6 JSX class 检查组合
// 使 props 交叉类型落 never（WebViewProps & undefined），此处以函数组件形态重新声明
const WebView = WebViewBase as unknown as ForwardRefExoticComponent<
  WebViewProps & RefAttributes<WebViewHandle>
>;

export function BookReaderScreen() {
  const route = useRoute<{ key: string; name: string; params: { itemId: string; name: string } }>();
  const { itemId, name } = route.params;
  const navigation = useNavigation<NavigationProp>();
  const t = useTheme();
  const insets = useSafeAreaInsets();

  // 断点初值同步读 MMKV（mount 时确定，ready 后 HTML 从第 1 页跳至该页）
  const [resumePage] = useState(() => bookReaderService.getResumePage(itemId));
  // 阅读方向初值同步读 MMKV（底部控制条切换即持久化，下次进入沿用）
  const [readingMode, setReadingMode] = useState<BookReadingMode>(() =>
    bookReaderService.getReadingMode()
  );
  const [phase, setPhase] = useState<ReaderPhase>('loadingFile');
  const [error, setError] = useState<AppError | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(resumePage);
  const [controlsVisible, setControlsVisible] = useState(true);

  const webViewRef = useRef<WebViewHandle>(null);
  const fileUriRef = useRef<string | null>(null);
  const initSentRef = useRef(false);
  const readyRef = useRef(false);
  // 末页自动已看幂等（一次会话仅报一次；失败静默，不打断阅读）
  const markReadSentRef = useRef(false);

  // 锁竖屏（阅读基准方向；返回恢复系统设置，PlayerScreen 同款时序）
  useFocusEffect(
    useCallback(() => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {
        // 锁定失败不阻塞阅读（平板分屏等场景）
      });
      return () => {
        void ScreenOrientation.unlockAsync().catch(() => {
          // 静默
        });
      };
    }, [])
  );

  // 页码统一收口：状态 + 断点 + 末页自动已看（滑条跳页与 HTML 横滑翻页共用）
  const handlePageChange = useCallback(
    (nextPage: number) => {
      setPage(nextPage);
      bookReaderService.saveResumePage(itemId, nextPage);
      if (nextPage >= pageCount && pageCount > 0 && !markReadSentRef.current) {
        markReadSentRef.current = true;
        bookReaderService.markRead(itemId).catch(() => {
          // 已看上报失败静默（用户可从详情页手动标记）
        });
      }
    },
    [itemId, pageCount]
  );

  // 取文件编排（缓存命中直通；setState 均在 await 之后——聚焦路径不得同步 setState）
  const ensureFile = useCallback(async () => {
    try {
      const uri = await bookReaderService.ensureLocalPdf(itemId, (progress) => {
        setDownloadPercent(progress.percent);
      });
      fileUriRef.current = uri;
      setPhase('rendering');
    } catch (err) {
      setError(err instanceof AppError ? err : new AppError('UNKNOWN', { cause: err }));
      setPhase('error');
    }
  }, [itemId]);

  // 聚焦即加载（mount 初值即干净态；返回重进为全新 mount，重新走 ensureLocalPdf 缓存判定）
  useFocusEffect(
    useCallback(() => {
      void ensureFile();
    }, [ensureFile])
  );

  // 错误态重试（事件处理器路径：先复位状态再重载）
  const retryLoad = useCallback(() => {
    setPhase('loadingFile');
    setDownloadPercent(null);
    setError(null);
    readyRef.current = false;
    initSentRef.current = false;
    void ensureFile();
  }, [ensureFile]);

  const injectInit = useCallback(() => {
    const uri = fileUriRef.current;
    if (initSentRef.current || uri === null) {
      return;
    }
    initSentRef.current = true;
    // init 固定从第 1 页起渲染（附阅读方向初值）；有断点时随即跳转（goToPage 内部重渲染）
    webViewRef.current?.injectJavaScript(
      `window.__reader.init(${JSON.stringify(uri)}, ${JSON.stringify(readingMode)}); true;`
    );
    if (resumePage > 1) {
      webViewRef.current?.injectJavaScript(`window.__reader.goToPage(${resumePage}); true;`);
    }
  }, [resumePage, readingMode]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: ReaderMessage;
      try {
        msg = JSON.parse(event.nativeEvent.data) as ReaderMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'ready':
          readyRef.current = true;
          if (msg.pageCount !== undefined) {
            setPageCount(msg.pageCount);
          }
          break;
        case 'page':
          if (msg.page !== undefined) {
            handlePageChange(msg.page);
          }
          break;
        case 'tap':
          setControlsVisible((visible) => !visible);
          break;
        case 'error':
          if (!readyRef.current) {
            // 打开失败（文件损坏/读取失败）：整页错误态（重试走 loadFile）
            setError(new AppError('UNKNOWN'));
            setPhase('error');
          } else {
            console.warn(`[BookReader] ${msg.message ?? '页面渲染失败'}`);
          }
          break;
        default:
          break;
      }
    },
    [handlePageChange]
  );

  /** 滑条/页码条跳页：注入 goToPage（HTML 内 notify=false，RN 侧就地更新页码与断点） */
  const goToPage = useCallback(
    (targetPage: number) => {
      const nextPage = Math.min(pageCount, Math.max(1, Math.round(targetPage)));
      if (nextPage === page) {
        return;
      }
      webViewRef.current?.injectJavaScript(`window.__reader.goToPage(${nextPage}); true;`);
      handlePageChange(nextPage);
    },
    [pageCount, page, handlePageChange]
  );

  /** 切换阅读方向：偏好落盘 + 注入 setMode（HTML 内重建槽位并锚定当前页） */
  const changeReadingMode = useCallback(
    (nextMode: BookReadingMode) => {
      if (nextMode === readingMode) {
        return;
      }
      setReadingMode(nextMode);
      bookReaderService.saveReadingMode(nextMode);
      webViewRef.current?.injectJavaScript(`window.__reader.setMode(${JSON.stringify(nextMode)}); true;`);
    },
    [readingMode]
  );

  if (phase === 'error' && error !== null) {
    return (
      <View style={[styles.fill, { backgroundColor: t.bg }]}>
        <ErrorView error={error} onRetry={retryLoad} />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: '#141414' }]}>
      {phase === 'loadingFile' && (
        <LoadingView
          label={
            downloadPercent !== null ? `正在加载 ${downloadPercent}%` : '正在加载'
          }
        />
      )}
      {phase === 'rendering' && (
        <WebView
          ref={webViewRef}
          source={{ uri: READER_HTML_URI }}
          originWhitelist={['*']}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          onLoadEnd={injectInit}
          onMessage={handleMessage}
          containerStyle={styles.webview}
        />
      )}
      {/* 控制层（顶部信息条 + 底部页码条）：HTML 上报 tap 切换显隐 */}
      {controlsVisible && (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + SPACING.s }]}>
            <Pressable
              hitSlop={12}
              onPress={() => navigation.goBack()}
              accessibilityLabel="关闭"
            >
              <AppIcon name="close" size={16} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {name}
            </Text>
            {pageCount > 0 && (
              <Text style={styles.pageLabel}>
                {page} / {pageCount}
              </Text>
            )}
          </View>
          {pageCount > 0 && (
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + SPACING.s }]}>
              {/* 阅读方向二选一：切换即注入 setMode，偏好持久化到 MMKV */}
              <View style={styles.modeRow}>
                {READING_MODE_OPTIONS.map((option) => {
                  const selected = readingMode === option.mode;
                  return (
                    <Pressable
                      key={option.mode}
                      onPress={() => changeReadingMode(option.mode)}
                      style={[styles.modeChip, selected && styles.modeChipSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`翻页方式：${option.label}`}
                    >
                      <Text
                        style={[styles.modeChipText, selected && styles.modeChipTextSelected]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <SeekBar
                positionMs={page}
                bufferedMs={0}
                durationMs={pageCount}
                onPreview={() => {
                  // 阅读器无气泡 HUD（页码已实时显示于顶栏），预览留空
                }}
                onSeek={goToPage}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  webview: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    paddingHorizontal: SPACING.l,
    paddingBottom: SPACING.s,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  title: { flex: 1, color: '#fff', fontSize: FONT_SIZE.body },
  pageLabel: { color: '#fff', fontSize: FONT_SIZE.body },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.s,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.s,
    paddingBottom: SPACING.xs,
  },
  modeChip: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xs,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  modeChipSelected: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  modeChipText: { color: '#FFFFFF', fontSize: FONT_SIZE.body },
  modeChipTextSelected: { color: '#141414' },
});
