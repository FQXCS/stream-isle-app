/**
 * TV 导航器（TV-m1 §4.1 / TV-m1-S3）：单 Shell 路由——侧栏自绘 + 内容区按 selectedTab
 * 状态切换三屏（首页/搜索/设置），tab 切换不压栈（TV 惯例，侧栏常驻）；设置 tab
 * tv-m4 收口为最小设置页（服务器/账号切换/退出/关于）。详情/库浏览/下钻/人物等找片
 * 链路以 stack push 进入（TV-m2 §2.1，无侧栏，BACK 回退）；播放器 tv-m3 追加。
 * 转场禁用（TV 设计 §6.1 animation 'none'）；主题强制深色映射（TV-m1 §4.5，验收 #10）。
 */
import { useCallback, useMemo, useState } from 'react';
import type { ComponentRef } from 'react';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, TVFocusGuideView, View } from 'react-native';

import { useT } from '@/i18n';

import { TV_ROUTES } from '@tv/constant/navigation';
import { ROUTES } from '@/constant/navigation';
import { TvScreenFrame } from '@tv/component/TvScreenFrame';
import { TvSidebarNav, type TvSidebarItem } from '@tv/component/TvSidebarNav';
import { useTvTheme } from '@tv/component/useTvTheme';
import { navigationRef } from '@tv/navigation/navigationRef';
import type { TvStackParamList } from '@tv/navigation/types';
import { TvHomeScreen } from '@tv/page/home/TvHomeScreen';
import { TvItemDetailScreen } from '@tv/page/detail/TvItemDetailScreen';
import { TvItemListScreen } from '@tv/page/library/TvItemListScreen';
import { TvLibraryFolderScreen } from '@tv/page/library/TvLibraryFolderScreen';
import { TvLibraryScreen } from '@tv/page/library/TvLibraryScreen';
import { TvPersonScreen } from '@tv/page/person/TvPersonScreen';
import { TvPlayerScreen } from '@tv/page/player/TvPlayerScreen';
import { TvSearchScreen } from '@tv/page/search/TvSearchScreen';
import { TvSettingsScreen } from '@tv/page/settings/TvSettingsScreen';

/** Shell 内容区 tab（单路由内状态切换，TV-m1-S3） */
type TvTabKey = 'home' | 'search' | 'settings';

/** 壳屏：侧栏 + 内容区（TV 设计 §6.1；跨区引导见 handleEscapeToLeft 注释） */
function TvShellScreen() {
  const tr = useT();
  const [selectedTab, setSelectedTab] = useState<TvTabKey>('home');
  // guide 目的地实例（state 化：fork findNodeHandle 在 React 19 下不解引 RefObject）
  const [contentNode, setContentNode] = useState<ComponentRef<typeof View> | null>(null);
  const [sidebarNode, setSidebarNode] = useState<ComponentRef<typeof View> | null>(null);
  // 侧栏镜像代理 tag：跳板/设置行 nextFocus 的目标（代理挂内容屏纵向 ScrollView 内可达）
  const [proxyTag, setProxyTag] = useState<number | null>(null);

  // 侧栏项（label 随语言变化，故依赖 tr；useMemo 稳定引用供 cycleTab 依赖）
  const items: TvSidebarItem[] = useMemo(
    () => [
      { key: 'home', label: tr('tv.tabHome'), icon: 'home' },
      { key: 'search', label: tr('nav.search'), icon: 'search' },
      { key: 'settings', label: tr('nav.tabSettings'), icon: 'settings' },
    ],
    [tr]
  );
  const selectedItems = items.filter((item) => item.key === selectedTab);
  // m1 的真侧栏聚焦受 ScrollView 树焦点管理限制（决策记录 TV-m1-S3）：代理 CENTER
  // 以 tab 循环切换代替侧栏栏内切换；占位屏内 LEFT 直达真侧栏（nextFocusLeft）闭环
  const cycleTab = useCallback(() => {
    setSelectedTab((prev) => {
      const index = items.findIndex((item) => item.key === prev);
      return items[(index + 1) % items.length].key as TvTabKey;
    });
  }, [items]);
  return (
    <TvScreenFrame style={styles.shell}>
      {/* 容器持实例作内容区引导目的地；侧栏自身 guide 右键进 contentNode */}
      <View ref={setSidebarNode}>
        <TvSidebarNav
          items={items}
          selectedKey={selectedTab}
          onSelect={(key) => setSelectedTab(key as TvTabKey)}
          contentDestination={contentNode}
        />
      </View>
      <TVFocusGuideView
        destinations={sidebarNode !== null ? [sidebarNode] : undefined}
        style={styles.content}
      >
        <View ref={setContentNode} style={styles.contentInner}>
          {selectedTab === 'home' && (
            <TvHomeScreen
              proxyIcon={selectedItems[0].icon}
              proxyLabel={selectedItems[0].label}
              onProxyTag={setProxyTag}
              onProxyPress={cycleTab}
              escapeFocusUpTag={proxyTag ?? undefined}
            />
          )}
          {selectedTab === 'search' && (
            <TvSearchScreen
              proxyIcon={selectedItems[0].icon}
              proxyLabel={selectedItems[0].label}
              onProxyTag={setProxyTag}
              onProxyPress={cycleTab}
              escapeFocusUpTag={proxyTag ?? undefined}
            />
          )}
          {selectedTab === 'settings' && (
            <TvSettingsScreen
              proxyIcon={selectedItems[0].icon}
              proxyLabel={selectedItems[0].label}
              onProxyTag={setProxyTag}
              onProxyPress={cycleTab}
              escapeFocusUpTag={proxyTag ?? undefined}
            />
          )}
        </View>
      </TVFocusGuideView>
    </TvScreenFrame>
  );
}

const TvStack = createNativeStackNavigator<TvStackParamList>();

export function TvNavigator() {
  const t = useTvTheme();
  // NavigationContainer theme 恒深色映射（TV 强制深色，TV-m1 §4.5）
  const navigationTheme = useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: t.bg,
        card: t.surface,
        text: t.textPrimary,
        border: t.separator,
        primary: t.accent,
      },
    }),
    [t]
  );
  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <TvStack.Navigator
        screenOptions={{
          headerShown: false,
          // TV 模式转场禁用（TV 设计 §6.1）
          animation: 'none',
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <TvStack.Screen name={TV_ROUTES.SHELL} component={TvShellScreen} />
        {/* TV-m2 找片链路：库浏览/详情/下钻/通用列表/人物 stack push（无侧栏，BACK 回退） */}
        <TvStack.Screen name={ROUTES.LIBRARY} component={TvLibraryScreen} />
        <TvStack.Screen name={ROUTES.ITEM} component={TvItemDetailScreen} />
        <TvStack.Screen name={ROUTES.LIBRARY_FOLDER} component={TvLibraryFolderScreen} />
        <TvStack.Screen name={ROUTES.ITEM_LIST} component={TvItemListScreen} />
        <TvStack.Screen name={ROUTES.PERSON} component={TvPersonScreen} />
        {/* TV-m3 播放器：详情 resolve 后 push（无侧栏，BACK 层级收口于播放页） */}
        <TvStack.Screen name={ROUTES.PLAYER} component={TvPlayerScreen} />
      </TvStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  shell: { flexDirection: 'row', gap: 16 },
  content: { flex: 1 },
  contentInner: { flex: 1 },
});
