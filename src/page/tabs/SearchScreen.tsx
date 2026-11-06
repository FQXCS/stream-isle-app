/**
 * 搜索页（04 文档 §4.3，M1 占位页填充；设计文档 §7.4）：
 * 单输入框 400ms 防抖（useDebouncedValue），电影/剧集/人物分组结果（PosterRow/PersonRow），
 * 点击直达 Item/Person 页；seq 序号竞态守卫 + 旧结果保留策略。
 * 状态机：首次搜索 LoadingView；已有旧结果时保留旧结果、仅输入框尾部转圈；
 * 失败 ErrorView（retry 重发当前关键词）；有词无结果 EmptyView。
 * 搜索结果仅存页面状态、不持久化（设计文档 §9）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { SearchResultGroup } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { EmptyView } from '@/component/EmptyView';
import { ErrorView } from '@/component/ErrorView';
import { LoadingView } from '@/component/LoadingView';
import { PersonRow } from '@/component/PersonRow';
import { PosterRow } from '@/component/PosterRow';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { SEARCH_DEBOUNCE_MS, SEARCH_GROUP_TITLE_MAP } from '@/constant/search';
import { AppError } from '@/infra/error';
import { searchService } from '@/service/SearchService';
import { useDebouncedValue } from '@/util/useDebouncedValue';

/** 输入框圆角 */
const INPUT_RADIUS = 14;

export function SearchScreen() {
  const t = useTheme();
  const styles = createStyles(t);
  const [input, setInput] = useState('');
  // 400ms 防抖：输入连续变更仅末次生效（04 §4.3）
  const debouncedInput = useDebouncedValue(input, SEARCH_DEBOUNCE_MS);

  const [groups, setGroups] = useState<SearchResultGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  /** 已出结果的关键词（空态文案用） */
  const [keyword, setKeyword] = useState('');
  /** 请求序号竞态守卫：仅最新序号的响应可落状态（04 §4.3） */
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
        // 过期响应直接丢弃（已有旧结果保留，04 §4.3 竞态守卫）
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
    // 空词仅复位去重标记（不发请求；引导空态由渲染分支按 hasQuery 直接呈现，
    // 不在 effect 内同步 setState——react-hooks/set-state-in-effect）
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
      {/* 顶部圆角输入框：尾部清除按钮 / 请求中指示（04 §4.3） */}
      <View style={styles.inputWrap}>
        <AppIcon name="search" size={18} color={t.textTertiary} />
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="搜索电影、剧集、人物"
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
          <Pressable
            style={styles.inputTail}
            onPress={() => setInput('')}
            hitSlop={8}
            accessibilityLabel="清除搜索"
          >
            <AppIcon name="close" size={16} color={t.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {/* 状态机（04 §4.3）：空词引导态优先（清输入即出，不依赖 effect 清态） */}
      {!hasQuery ? (
        <EmptyView title="输入关键词搜索电影、剧集、人物" />
      ) : error !== null ? (
        <ErrorView error={error} onRetry={() => void runSearch(trimmed)} />
      ) : isInitialLoading ? (
        <LoadingView />
      ) : groups !== null && groups.length === 0 ? (
        <EmptyView title={`没有找到与「${keyword}」相关的内容`} />
      ) : groups !== null ? (
        <ScrollView contentContainerStyle={styles.resultContent}>
          {groups.map((group) => (
            <View key={group.kind} style={styles.section}>
              {/* 组标题来自 SEARCH_GROUP_TITLE_MAP（SearchResultGroup 不携带，04 §4.3） */}
              <Text style={styles.sectionTitle}>{SEARCH_GROUP_TITLE_MAP[group.kind]}</Text>
              {group.kind === 'PERSON' ? (
                <PersonRow itemList={group.itemList} />
              ) : (
                <PosterRow itemList={group.itemList} />
              )}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg, padding: SPACING.l, gap: SPACING.l },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    backgroundColor: t.surface,
    borderRadius: INPUT_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.separator,
    paddingHorizontal: SPACING.m + 2,
    height: 46,
  },
  input: {
    flex: 1,
    color: t.textPrimary,
    fontSize: FONT_SIZE.title - 1,
    paddingVertical: 0,
  },
  inputTail: { paddingLeft: SPACING.xs },
  resultContent: { paddingBottom: SPACING.xl },
  section: { gap: SPACING.m, marginBottom: SPACING.l },
  sectionTitle: {
    color: t.textPrimary,
    fontSize: FONT_SIZE.section,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
