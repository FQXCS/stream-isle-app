/**
 * 根导航器（M9 免登录体系）：导航树按「媒体库配置」组织，未登录也可进入 App。
 * RootStack（native-stack）
 * ├─ Tabs（bottom-tabs）：Tabs.Libraries · Tabs.MediaServer · Tabs.Settings
 * │  （搜索不再是 Tab：Search 页面由媒体库页头部搜索按钮推入）
 * ├─ 免登录：ServerAdd（添加/编辑服务器）、ServerRoutes、ServerRouteEdit
 * ├─ 登录页：OnboardingLogin（同服务器多账号 / 401 重登；modal）
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
import { useEffect, useMemo, useRef } from 'react';
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
import { LibraryListScreen } from '@/page/library/LibraryListScreen';
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
import { AddServerScreen } from '@/page/server/AddServerScreen';
import { ServerRouteEditScreen } from '@/page/server/ServerRouteEditScreen';
import { ServerRoutesScreen } from '@/page/server/ServerRoutesScreen';
import { ServerSortScreen } from '@/page/server/ServerSortScreen';
import { PhotoViewerScreen } from '@/page/photo/PhotoViewerScreen';
import { AudioPermissionGuide } from '@/page/root/AudioPermissionGuide';
import { LibrariesScreen } from '@/page/tabs/LibrariesScreen';
import { MediaServerScreen } from '@/page/tabs/MediaServerScreen';
import { SearchScreen } from '@/page/tabs/SearchScreen';
import { SettingsScreen } from '@/page/tabs/SettingsScreen';
import { useAccountStore } from '@/store/accountStore';
import { reloginWithStoredCredential } from '@/service/AuthService';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabsParamList>();

/** 底部三 Tab 容器（媒体库融合页/媒体服务器/设置；搜索改由媒体库页头部入口进入） */
function TabsNavigator() {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name={ROUTES.TAB_LIBRARIES}
        component={LibrariesScreen}
        options={{
          title: '媒体库',
          tabBarIcon: ({ color, size }) => <AppIcon name="library" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name={ROUTES.TAB_MEDIA_SERVER}
        component={MediaServerScreen}
        options={{
          title: '影视服务器',
          tabBarIcon: ({ color, size }) => <AppIcon name="server" size={size} color={color} />,
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

  // 订阅 401 全局登出事件（免登录体系）：先尝试用加密留存的账号密码自动重登；
  // 失败才清活跃账号并弹登录页（密码已在服务端修改 / 未保存密码时）
  const reloginRef = useRef(false);
  useEffect(() => {
    const unsubscribe = apiEvents.on('UNAUTHORIZED', () => {
      const state = useAccountStore.getState();
      const serverId = state.active?.serverId ?? null;
      const userId = state.active?.userId ?? null;
      state.actions.expireActiveUser();
      if (serverId === null || userId === null) {
        return;
      }
      ToastAndroid.show(errorMessageOf('UNAUTHORIZED'), ToastAndroid.SHORT);
      if (reloginRef.current) {
        return;
      }
      reloginRef.current = true;
      void (async () => {
        const relogged = await reloginWithStoredCredential(serverId, userId);
        reloginRef.current = false;
        if (!relogged && navigationRef.isReady()) {
          navigationRef.navigate(ROUTES.ONBOARDING_LOGIN, { serverId });
        }
      })();
    });
    return unsubscribe;
  }, []);

  // rehydrate 未完成不渲染导航（避免闪空态）
  if (!hydrated) {
    return null;
  }

  return (
    <>
      <NavigationContainer ref={navigationRef} theme={navigationTheme}>
        <RootStack.Navigator
          initialRouteName={ROUTES.TABS}
          // 全局顶部导航样式：标题居中（Android 默认左对齐）
          screenOptions={{ headerTitleAlign: 'center' }}
        >
          <RootStack.Screen
            name={ROUTES.TABS}
            component={TabsNavigator}
            options={{ headerShown: false }}
          />
            {/* 搜索页：媒体库页头部搜索按钮进入（原生返回，底部不再占 Tab） */}
            <RootStack.Screen
              name={ROUTES.SEARCH}
              component={SearchScreen}
              options={{ title: '搜索', headerBackTitle: '返回' }}
            />
            {/* 全部媒体库列表：融合页「我的媒体 · 查看全部」入口，沿用库卡片列表样式 */}
            <RootStack.Screen
              name={ROUTES.LIBRARY_LIST}
              component={LibraryListScreen}
              options={{ title: '媒体库', headerBackTitle: '返回' }}
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
            {/* 免登录体系：添加 / 编辑服务器表单（影视服务器页入口）、线路管理 */}
            <RootStack.Screen
              name={ROUTES.SERVER_ADD}
              component={AddServerScreen}
              options={{ headerBackTitle: '返回' }}
            />
            <RootStack.Screen
              name={ROUTES.SERVER_ROUTES}
              component={ServerRoutesScreen}
              options={{ headerBackTitle: '返回' }}
            />
            <RootStack.Screen
              name={ROUTES.SERVER_SORT}
              component={ServerSortScreen}
              options={{ headerBackTitle: '返回' }}
            />
            <RootStack.Screen
              name={ROUTES.SERVER_ROUTE_EDIT}
              component={ServerRouteEditScreen}
              options={{ headerBackTitle: '返回' }}
            />
            {/* 登录页：同服务器多账号 / 401 重登（modal 呈现，成功后原地 pop） */}
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
