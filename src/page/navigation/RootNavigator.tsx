/**
 * 根导航器（M1 文档 §4.9）：导航树 + 登录态导航 gate（zustand 响应式）。
 * RootStack（native-stack）
 * ├─ OnboardingStack 组：OnboardingConnect → OnboardingLogin（登录前只挂此组）
 * ├─ Tabs（bottom-tabs）：Tabs.Home · Tabs.Libraries · Tabs.Search · Tabs.Settings
 * └─ Library / Item / Person / Player（M2+）→ M5 追加 AlbumDetail / NowPlaying / PhotoViewer
 *    → M6 追加 History / Downloads（设计文档 §10.2 已预留，06 §4.10 注册）
 * 根布局浮层：MiniPlayer（全局迷你播放条，NavigationContainer 同级，M5 §4.10）+
 * SharedPosterOverlay（M6 海报 → 详情共享元素转场浮层）+
 * AudioPermissionGuide（电池引导，非路由，M5 §4.14）。
 * M6 主题（06 §4.6.1）：NavigationContainer theme 由 token 映射（深/浅两套）。
 */
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useEffect, useMemo } from 'react';
import { StyleSheet, ToastAndroid, View } from 'react-native';

import { ROUTES } from '@/constant/navigation';
import { LIBRARY_TYPE_LABELS, TAB_CATALOG } from '@/constant/libraryTabs';
import { errorMessageOf } from '@/infra/error';
import { apiEvents } from '@/infra/api/apiEvents';
import { AppIcon } from '@/component/AppIcon';
import { MiniPlayer } from '@/component/MiniPlayer';
import { SharedPosterOverlay } from '@/component/SharedPosterOverlay';
import { ToastHost } from '@/component/Toast';
import { useResolvedScheme, useTheme } from '@/component/useTheme';
import { AlbumDetailScreen } from '@/page/album/AlbumDetailScreen';
import { PlaylistDetailScreen } from '@/page/album/PlaylistDetailScreen';
import { BookReaderScreen } from '@/page/reader/BookReaderScreen';
import { DownloadsScreen } from '@/page/downloads/DownloadsScreen';
import { HistoryScreen } from '@/page/history/HistoryScreen';
import { ItemDetailScreen } from '@/page/item/ItemDetailScreen';
import { ItemListScreen } from '@/page/library/ItemListScreen';
import { LibraryFolderScreen } from '@/page/library/LibraryFolderScreen';
import { LibraryScreen } from '@/page/library/LibraryScreen';
import { LibraryDisplaySettingsScreen } from '@/page/settings/LibraryDisplaySettingsScreen';
import { LibrarySortEditorScreen } from '@/page/settings/LibrarySortEditorScreen';
import { LibrarySortSettingsScreen } from '@/page/settings/LibrarySortSettingsScreen';
import { LibrarySortTabsScreen } from '@/page/settings/LibrarySortTabsScreen';
import { LibraryTabEditorScreen } from '@/page/settings/LibraryTabEditorScreen';
import { LibraryTabSettingsScreen } from '@/page/settings/LibraryTabSettingsScreen';
import { MediaTypeSettingsScreen } from '@/page/settings/MediaTypeSettingsScreen';
import { navigationRef } from '@/page/navigation/navigationRef';
import type { RootStackParamList, TabsParamList } from '@/page/navigation/types';
import { NowPlayingScreen } from '@/page/nowplaying/NowPlayingScreen';
import { PersonScreen } from '@/page/person/PersonScreen';
import { PlayerScreen } from '@/page/player/PlayerScreen';
import { OnboardingConnectScreen } from '@/page/onboarding/OnboardingConnectScreen';
import { OnboardingLoginScreen } from '@/page/onboarding/OnboardingLoginScreen';
import { PhotoViewerScreen } from '@/page/photo/PhotoViewerScreen';
import { AudioPermissionGuide } from '@/page/root/AudioPermissionGuide';
import { HomeScreen } from '@/page/tabs/HomeScreen';
import { LibrariesScreen } from '@/page/tabs/LibrariesScreen';
import { SearchScreen } from '@/page/tabs/SearchScreen';
import { SettingsScreen } from '@/page/tabs/SettingsScreen';
import { useAccountStore } from '@/store/accountStore';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabsParamList>();

/** 底部四 Tab 容器（首页/搜索 M1 占位，媒体库/设置可用） */
function TabsNavigator() {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name={ROUTES.TAB_HOME}
        component={HomeScreen}
        options={{
          title: '首页',
          tabBarIcon: ({ color, size }) => <AppIcon name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name={ROUTES.TAB_LIBRARIES}
        component={LibrariesScreen}
        options={{
          title: '媒体库',
          tabBarIcon: ({ color, size }) => <AppIcon name="library" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name={ROUTES.TAB_SEARCH}
        component={SearchScreen}
        options={{
          title: '搜索',
          tabBarIcon: ({ color, size }) => <AppIcon name="search" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name={ROUTES.TAB_SETTINGS}
        component={SettingsScreen}
        options={{
          title: '设置',
          tabBarIcon: ({ color, size }) => <AppIcon name="settings" size={size} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}

/** 登录态导航 gate 组件：无账号 → Onboarding 组；有活跃账号 → Tabs + Library */
export function RootNavigator() {
  // gate 条件：hydrated && active 存在 → Tabs；否则 Onboarding（§4.9，zustand 响应式）
  const hydrated = useAccountStore((state) => state.hydrated);
  const active = useAccountStore((state) => state.active);
  // 401 重登路径：携带 serverId 进入 OnboardingLogin（§4.10 重登链路；瞬态存于 accountStore）
  const reloginServerId = useAccountStore((state) => state.reloginServerId);
  // M6 主题：NavigationContainer theme 由 token 映射（深/浅两套，06 §4.6.1）
  const t = useTheme();
  const scheme = useResolvedScheme();
  const navigationTheme = useMemo(
    () => ({
      ...(scheme === 'light' ? DefaultTheme : DarkTheme),
      colors: {
        ...(scheme === 'light' ? DefaultTheme : DarkTheme).colors,
        background: t.bg,
        card: t.surface,
        text: t.textPrimary,
        border: t.separator,
        primary: t.accent,
      },
    }),
    [scheme, t]
  );

  // 订阅 401 全局登出事件：expireActiveUser（幂等，04 §4.2 终态链路）→ gate 自动切回登录栈
  useEffect(() => {
    const unsubscribe = apiEvents.on('UNAUTHORIZED', () => {
      const serverId = useAccountStore.getState().active?.serverId ?? null;
      useAccountStore.getState().actions.expireActiveUser();
      // 并发 401 幂等：第二次事件读到的 active 已被第一次置空，不再提示也不覆盖
      // 先到事件留下的服务器上下文（验收「经 serverId 恢复」依赖它，04 §4.2 提示唯一性）
      if (serverId !== null) {
        // 提示文案取 ERROR_MESSAGE_MAP 唯一出处（「登录已失效，请重新输入密码」）
        ToastAndroid.show(errorMessageOf('UNAUTHORIZED'), ToastAndroid.SHORT);
      }
    });
    return unsubscribe;
  }, []);

  // rehydrate 未完成不渲染导航（gate 依赖 hydrated，避免误闪登录页）
  if (!hydrated) {
    return null;
  }

  const authed = active !== null;
  return (
    <>
      <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <RootStack.Navigator
        // 登录态切换即整体重建导航栈，initialRouteName 随 gate 走（§4.9：无需命令式跳转兜底）
        key={authed ? 'authed' : 'guest'}
        initialRouteName={
          authed
            ? ROUTES.TABS
            : reloginServerId
              ? ROUTES.ONBOARDING_LOGIN
              : ROUTES.ONBOARDING_CONNECT
        }
      >
        {authed ? (
          <>
            <RootStack.Screen
              name={ROUTES.TABS}
              component={TabsNavigator}
              options={{ headerShown: false }}
            />
            {/* 库页：库名居中标题（参考稿），右上角排序按钮由 LibraryScreen setOptions 注入 */}
            <RootStack.Screen
              name={ROUTES.LIBRARY}
              component={LibraryScreen}
              options={({ route }) => ({
                title: route.params.library.name,
                headerTitleAlign: 'center',
                headerBackTitle: '返回',
              })}
            />
            {/* 库内文件夹/相册下钻：原生 push 滑动转场，标题为目录名（不含库页 Tab 栏） */}
            <RootStack.Screen
              name={ROUTES.LIBRARY_FOLDER}
              component={LibraryFolderScreen}
              options={({ route }) => ({
                title: route.params.folderName,
                headerTitleAlign: 'center',
                headerBackTitle: '返回',
                animation: 'slide_from_right',
              })}
            />
            {/* M2 详情页：Hero 自绘头部，隐藏系统导航栏 */}
            <RootStack.Screen
              name={ROUTES.ITEM}
              component={ItemDetailScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name={ROUTES.PERSON}
              component={PersonScreen}
              options={{ headerBackTitle: '返回' }}
            />
            {/* M2 播放页：全屏黑底自绘控制层，隐藏系统导航栏（横屏由页内锁定） */}
            <RootStack.Screen
              name={ROUTES.PLAYER}
              component={PlayerScreen}
              options={{ headerShown: false }}
            />
            {/* M5：专辑/艺术家/歌单详情三态 */}
            <RootStack.Screen
              name={ROUTES.ALBUM_DETAIL}
              component={AlbumDetailScreen}
              options={{ headerBackTitle: '返回' }}
            />
            {/* M5：Now Playing 全屏页（大封面/进度/模式/队列面板） */}
            <RootStack.Screen
              name={ROUTES.NOW_PLAYING}
              component={NowPlayingScreen}
              options={{ headerShown: false }}
            />
            {/* M5：照片查看器（全屏沉浸黑底） */}
            <RootStack.Screen
              name={ROUTES.PHOTO_VIEWER}
              component={PhotoViewerScreen}
              options={{ headerShown: false }}
            />
            {/* M6：观看历史（服务端已看条目倒序分页，06 §4.10） */}
            <RootStack.Screen
              name={ROUTES.HISTORY}
              component={HistoryScreen}
              options={{ headerBackTitle: '返回' }}
            />
            {/* M6：下载管理（离线任务列表 + 本地播放入口，06 §4.10） */}
            <RootStack.Screen
              name={ROUTES.DOWNLOADS}
              component={DownloadsScreen}
              options={{ headerBackTitle: '返回' }}
            />
            {/* 收录类型二级页：继续观看/观看历史分别多选（类型集不同） */}
            <RootStack.Screen
              name={ROUTES.MEDIA_TYPE_SETTINGS}
              component={MediaTypeSettingsScreen}
              options={{ title: '收录类型', headerBackTitle: '返回' }}
            />
            {/* 库页配置：根设置页已选服务器类型，这里配置 Tab 分类/排序项 */}
            <RootStack.Screen
              name={ROUTES.LIBRARY_DISPLAY_SETTINGS}
              component={LibraryDisplaySettingsScreen}
              options={({ route }) => ({
                title: `库页配置 · ${route.params.flavor === 'JELLYFIN' ? 'Jellyfin' : 'Emby'}`,
                headerBackTitle: '返回',
              })}
            />
            {/* 库页 Tab 分类配置：指定 flavor → 库类型列表 */}
            <RootStack.Screen
              name={ROUTES.LIBRARY_TAB_SETTINGS}
              component={LibraryTabSettingsScreen}
              options={{ title: 'Tab 分类', headerBackTitle: '返回', animation: 'slide_from_right' }}
            />
            {/* 某库类型的 Tab 编辑器：原生 push 动画 + 动态标题 */}
            <RootStack.Screen
              name={ROUTES.LIBRARY_TAB_EDITOR}
              component={LibraryTabEditorScreen}
              options={({ route }) => ({
                title: `Tab 分类 · ${LIBRARY_TYPE_LABELS[route.params.libraryType]}`,
                headerBackTitle: '返回',
                animation: 'slide_from_right',
              })}
            />
            {/* 库页排序项配置：指定 flavor → 库类型列表 */}
            <RootStack.Screen
              name={ROUTES.LIBRARY_SORT_SETTINGS}
              component={LibrarySortSettingsScreen}
              options={{ title: '排序项', headerBackTitle: '返回', animation: 'slide_from_right' }}
            />
            {/* 某库类型的 Tab 列表：原生 push 动画 + 动态标题 */}
            <RootStack.Screen
              name={ROUTES.LIBRARY_SORT_TABS}
              component={LibrarySortTabsScreen}
              options={({ route }) => ({
                title: `排序项 · ${LIBRARY_TYPE_LABELS[route.params.libraryType]}`,
                headerBackTitle: '返回',
                animation: 'slide_from_right',
              })}
            />
            {/* 单 Tab 排序编辑器：原生 push 动画 + 动态标题 */}
            <RootStack.Screen
              name={ROUTES.LIBRARY_SORT_EDITOR}
              component={LibrarySortEditorScreen}
              options={({ route }) => {
                const tab = TAB_CATALOG[route.params.libraryType].find(
                  (item) => item.id === route.params.tabId
                );
                return {
                  title:
                    tab === undefined
                      ? '排序项'
                      : `排序项 · ${LIBRARY_TYPE_LABELS[route.params.libraryType]} · ${tab.label}`,
                  headerBackTitle: '返回',
                  animation: 'slide_from_right',
                };
              }}
            />
            {/* 通用条目列表：合集子项/类型/标签/工作室过滤/游戏系统/插件频道节目 */}
            <RootStack.Screen
              name={ROUTES.ITEM_LIST}
              component={ItemListScreen}
              options={({ route }) => ({
                title: route.params.title,
                headerBackTitle: '返回',
              })}
            />
            {/* 通用歌单详情（视频/混合歌单） */}
            <RootStack.Screen
              name={ROUTES.PLAYLIST_DETAIL}
              component={PlaylistDetailScreen}
              options={({ route }) => ({
                title: route.params.title ?? '播放列表',
                headerBackTitle: '返回',
              })}
            />
            {/* M7：图书阅读器（WebView+PDF.js 全屏沉浸） */}
            <RootStack.Screen
              name={ROUTES.BOOK_READER}
              component={BookReaderScreen}
              options={{ headerShown: false }}
            />
            {/* M4 设置页「添加用户/添加服务器」入口（04 §4.5）：复用 Onboarding 两屏，
                modal 呈现；登录成功后由页面就地 pop 返回设置页 */}
            <RootStack.Screen
              name={ROUTES.ONBOARDING_CONNECT}
              component={OnboardingConnectScreen}
              options={{ presentation: 'modal', headerBackTitle: '返回' }}
            />
            <RootStack.Screen
              name={ROUTES.ONBOARDING_LOGIN}
              component={OnboardingLoginScreen}
              options={{ presentation: 'modal', headerBackTitle: '返回' }}
            />
          </>
        ) : (
          <>
            <RootStack.Screen
              name={ROUTES.ONBOARDING_CONNECT}
              component={OnboardingConnectScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name={ROUTES.ONBOARDING_LOGIN}
              component={OnboardingLoginScreen}
              initialParams={reloginServerId ? { serverId: reloginServerId } : undefined}
              options={{ headerBackTitle: '返回' }}
            />
          </>
        )}
      </RootStack.Navigator>
      </NavigationContainer>
      {/* M5：全局迷你播放条（根布局浮层，四 Tab 与库/详情页上方常驻，05 §4.10） */}
      <View style={styles.overlay} pointerEvents="box-none">
        <MiniPlayer />
      </View>
      {/* M6：海报 → 详情共享元素转场浮层（根级，NavigationContainer 同层，06 §4.6.2） */}
      <SharedPosterOverlay />
      {/* M5：电池白名单引导（首次起播一次性，根布局组件非路由，05 §4.14） */}
      <AudioPermissionGuide />
      {/* 全局操作级反馈浮层（04 §4.2）：根组件挂载一次 */}
      <ToastHost />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
