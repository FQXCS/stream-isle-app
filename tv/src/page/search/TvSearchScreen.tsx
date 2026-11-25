/**
 * TV 搜索页（TV-m2 §4.5，壳内搜索 tab 内容）：单输入框 400ms 防抖（useDebouncedValue）+
 * 手动提交双通道（onSubmitEditing，同词去重共用标记）+ seq 竞态守卫 + 旧结果保留
 * （照搬手机 SearchScreen 模式，验收 #8 三态：空词/无结果/错误）。
 * 结果三分组纵排（电影/剧集 → TvMediaRow 海报行；人物 → TvPersonRow 头像行），
 * 组内横向焦点行复用 TvMediaRow 跳板机制（行首 LEFT → 跳板 → UP 侧栏代理，壳内闭环）。
 * Enter → 详情/人物（TV 路由映射收口在页面）。IME 聚焦态显著，BACK 收键盘
 * （Android 默认行为：键盘开启时 BACK 先收键盘不冒泡）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { MediaLibraryItem, SearchResultGroup } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import type { AppIconName } from '@/component/AppIcon';
import { useT } from '@/i18n';
import { AppError } from '@/infra/error';
import { SEARCH_DEBOUNCE_MS, SEARCH_GROUP_TITLE_MAP } from '@/constant/search';
import { ROUTES } from '@/constant/navigation';
import { searchService } from '@/service/SearchService';
import { useDebouncedValue } from '@/util/useDebouncedValue';

import { TvEmptyView, TvErrorView, TvLoadingSkeleton } from '@tv/component/TvStateViews';
import { TvPersonCard } from '@tv/component/TvPersonCard';
import { TvSidebarProxy } from '@tv/component/TvSidebarProxy';
import { TvPressable } from '@tv/component/TvPressable';
import { useTvTheme } from '@tv/component/useTvTheme';
import { TvMediaRow, TvRowEscapeSentinel } from '@tv/page/home/TvMediaRow';
import { findNodeHandleTagOf } from '@tv/util/focusView';
import type { TvStackParamList } from '@tv/navigation/types';

type TvNavigation = NativeStackNavigationProp<TvStackParamList>;

interface TvSearchScreenProps {
  /** 侧栏镜像代理的图标/文案（Shell 当前 tab 下发，首页同构） */
  proxyIcon: AppIconName;
  proxyLabel: string;
  /** 代理实例 tag 上抛（跳板 nextFocusUp 寻址；代理须挂本 ScrollView 内才可达） */
  onProxyTag(tag: number | null): void;
  /** 代理 CENTER 动作（Shell tab 循环切换） */
  onProxyPress(): void;
  /** 行首跳板 nextFocusUp 的目标（即代理 tag，Shell 下发回环） */
  escapeFocusUpTag?: number;
}

/** 输入框圆角（10-foot 放大档） */
const INPUT_RADIUS = 14;

export function TvSearchScreen({
  proxyIcon,
  proxyLabel,
  onProxyTag,
  onProxyPress,
  escapeFocusUpTag,
}: TvSearchScreenProps) {
  const t = useTvTheme();
  const tr = useT();
  const styles = createStyles(t);
  const navigation = useNavigation<TvNavigation>();
  const [input, setInput] = useState('');
  // 400ms 防抖：输入连续变更仅末次生效（手机同口径）
  const debouncedInput = useDebouncedValue(input, SEARCH_DEBOUNCE_MS);

  const [groups, setGroups] = useState<SearchResultGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  /** 已出结果的关键词（空态文案用） */
  const [keyword, setKeyword] = useState('');
  /** 请求序号竞态守卫：仅最新序号的响应可落状态 */
  const seqRef = useRef(0);
  /** 上一次已发起搜索的词（同词不重复搜索） */
  const lastSearchedRef = useRef<string | null>(null);

  const runSearch = useCallback(async (term: string) => {
    seqRef.current += 1;
    const seq = seqRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await searchService.search(term);
      if (seqRef.current !== seq) {
        return;
      }
      setGroups(result);
      setKeyword(term);
    } catch (err) {
      if (seqRef.current !== seq) {
        return;
      }
      setError(err instanceof AppError ? err : new AppError('UNKNOWN', { cause: err }));
    } finally {
      if (seqRef.current === seq) {
        setLoading(false);
      }
    }
  }, []);

  const trimmed = debouncedInput.trim();
  useEffect(() => {
    // 空词仅复位去重标记（不发请求；空态由渲染分支直接呈现）
    if (trimmed === '') {
      lastSearchedRef.current = null;
      return;
    }
    if (lastSearchedRef.current === trimmed) {
      return;
    }
    lastSearchedRef.current = trimmed;
    void runSearch(trimmed);
  }, [trimmed, runSearch]);

  const hasQuery = trimmed !== '';
  const isInitialLoading = loading && groups === null;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 侧栏镜像代理（纵向 ScrollView 子树内可达；结果行跳板 UP 落此，壳内闭环） */}
        <TvSidebarProxy icon={proxyIcon} label={proxyLabel} onTag={onProxyTag} onPress={onProxyPress} />
        {/* 顶部输入框：尾部清除按钮 / 请求中指示；TV IME 防抖 + 手动提交双通道 */}
        <View style={styles.inputWrap}>
          <AppIcon name="search" size={20} color={t.textTertiary} />
          <TextInput
            style={[styles.input, { color: t.textPrimary }]}
            value={input}
            onChangeText={setInput}
            placeholder={tr('server.searchPlaceholder')}
            placeholderTextColor={t.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              // 手动提交与防抖 effect 共用去重标记：同词（防抖已发/已提交过）不重复发起
              const term = input.trim();
              if (term !== '' && lastSearchedRef.current !== term) {
                lastSearchedRef.current = term;
                void runSearch(term);
              }
            }}
          />
          {loading ? (
            <ActivityIndicator style={styles.inputTail} color={t.accent} size="small" />
          ) : input !== '' ? (
            <TvPressable
              focusKind="row"
              focusable
              accessibilityRole="button"
              accessibilityLabel={tr('server.clearSearch')}
              onPress={() => setInput('')}
              style={styles.inputTail}
            >
              <AppIcon name="close" size={18} color={t.textTertiary} />
            </TvPressable>
          ) : null}
        </View>

        {/* 状态机（手机同口径）：空词引导态优先（清输入即出，不依赖 effect 清态） */}
        {!hasQuery ? (
          <View style={styles.stateBox}>
            <TvEmptyView title={tr('server.searchEmptyTitle')} />
          </View>
        ) : error !== null ? (
          <View style={styles.stateBox}>
            <TvErrorView error={error} onRetry={() => void runSearch(trimmed)} />
          </View>
        ) : isInitialLoading ? (
          <TvLoadingSkeleton />
        ) : groups !== null && groups.length === 0 ? (
          <View style={styles.stateBox}>
            <TvEmptyView title={tr('server.searchNoResult', { keyword })} />
          </View>
        ) : groups !== null ? (
          <View style={styles.results}>
            {groups.map((group) =>
              group.kind === 'PERSON' ? (
                <TvPersonRow
                  key={group.kind}
                  title={tr(SEARCH_GROUP_TITLE_MAP[group.kind])}
                  itemList={group.itemList}
                  escapeFocusUpTag={escapeFocusUpTag}
                  onSelectPerson={(personId) => navigation.navigate(ROUTES.PERSON, { personId })}
                />
              ) : (
                <TvMediaRow
                  key={group.kind}
                  title={tr(SEARCH_GROUP_TITLE_MAP[group.kind])}
                  itemList={group.itemList}
                  escapeFocusUpTag={escapeFocusUpTag}
                  onPressItem={(item) => navigation.navigate(ROUTES.ITEM, { itemId: item.id })}
                />
              )
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * 搜索结果人物行：标题 + 横向 TvPersonCard 焦点行 + 行首跳板（与海报行同构逃逸路径）。
 * Person 条目主图即头像（posterImageUrl）；Enter 进人物页。
 */
function TvPersonRow({
  title,
  itemList,
  escapeFocusUpTag,
  onSelectPerson,
}: {
  title: string;
  itemList: MediaLibraryItem[];
  escapeFocusUpTag?: number;
  onSelectPerson(personId: string): void;
}) {
  const t = useTvTheme();
  const styles = createStyles(t);
  // 跳板 React tag：行首卡 nextFocusLeft 指向它（同 TvMediaRow 机制）
  const [sentinelTag, setSentinelTag] = useState<number | null>(null);
  if (itemList.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.textPrimary }]}>{title}</Text>
      <FlatList
        horizontal
        data={itemList}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}
        ListHeaderComponent={
          <TvRowEscapeSentinel
            label={title}
            focusUpTag={escapeFocusUpTag}
            onRef={(ref) => {
              const tag = findNodeHandleTagOf(ref);
              setSentinelTag((prev) => (prev === tag ? prev : tag));
            }}
          />
        }
        renderItem={({ item, index }) => (
          <TvPersonCard
            person={{ id: item.id, name: item.name, imageUrl: item.posterImageUrl }}
            nextFocusLeft={index === 0 && sentinelTag !== null ? sentinelTag : undefined}
            onSelect={() => onSelectPerson(item.id)}
          />
        )}
      />
    </View>
  );
}

const createStyles = (t: ReturnType<typeof useTvTheme>) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { gap: 24, paddingBottom: 32 },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.surface,
      borderRadius: INPUT_RADIUS,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.separator,
      paddingHorizontal: 20,
      height: 64,
    },
    input: { flex: 1, fontSize: 20, paddingVertical: 0 },
    inputTail: { paddingLeft: 8, borderRadius: 10 },
    stateBox: { flex: 1, minHeight: 320 },
    results: { gap: 28 },
    section: { gap: 14 },
    sectionTitle: { fontSize: 20, fontWeight: '700', paddingHorizontal: 16 },
    rowContent: { paddingHorizontal: 16, gap: 16 },
  });
