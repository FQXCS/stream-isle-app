/**
 * TV 人物页（TV-m2 §4.3 验收 #7）：头像、姓名、简介、出演作品网格（TV 6 列焦点化），
 * 点击作品回详情页（手机 PersonScreen 同数据链路：detailService.loadPerson 一次拉齐）。
 * 网格焦点：单元格全部在 FlatList 纵向 ScrollView 子树内（arrowScroll 四向移动 + 边缘滚动，
 * m1 行焦点结论的网格版）；作品卡 Enter 经页面收口 Item 路由。
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import type { MediaDetail, MediaLibraryItem } from '@/adapter/model';
import { AppError } from '@/infra/error';
import { useT } from '@/i18n';
import { ROUTES } from '@/constant/navigation';
import { detailService } from '@/service/DetailService';

import { TvErrorView, TvLoadingSkeleton } from '@tv/component/TvStateViews';
import { TvScreenFrame } from '@tv/component/TvScreenFrame';
import { useTvTheme } from '@tv/component/useTvTheme';
import { useTvGridCellWidth } from '@tv/util/useTvGridCellWidth';
import { TvPosterCard, TV_CARD_IMAGE_HEIGHT } from '@tv/page/home/TvPosterCard';
import { TV_GRID_COLUMNS, TV_GRID_CONTENT_PADDING, TV_GRID_GAP } from '@tv/constant/library';
import type { TvStackParamList } from '@tv/navigation/types';

type TvNavigation = NativeStackNavigationProp<TvStackParamList>;

export function TvPersonScreen() {
  const route = useRoute<{ key: string; name: string; params: { personId: string } }>();
  const personId = route.params.personId;
  const navigation = useNavigation<TvNavigation>();
  const t = useTvTheme();
  const tr = useT();
  const styles = createStyles();
  const cellWidth = useTvGridCellWidth();

  const [person, setPerson] = useState<MediaDetail | null>(null);
  const [filmographyList, setFilmographyList] = useState<MediaLibraryItem[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPerson = useCallback(async () => {
    setLoading(true);
    try {
      const result = await detailService.loadPerson(personId);
      setPerson(result.person);
      setFilmographyList(result.filmographyList);
      setError(null);
    } catch (err) {
      setError(err instanceof AppError ? err : new AppError('UNKNOWN', { cause: err }));
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useFocusEffect(
    useCallback(() => {
      void loadPerson();
    }, [loadPerson])
  );

  if (loading && person === null) {
    return (
      <TvScreenFrame>
        <TvLoadingSkeleton />
      </TvScreenFrame>
    );
  }

  if (error !== null || person === null) {
    return (
      <TvScreenFrame>
        <TvErrorView error={error ?? new AppError('UNKNOWN')} onRetry={() => void loadPerson()} />
      </TvScreenFrame>
    );
  }

  return (
    <TvScreenFrame>
      <FlatList
        data={filmographyList}
        numColumns={TV_GRID_COLUMNS}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            {person.posterImageUrl !== undefined ? (
              <TvPersonAvatar imageUrl={person.posterImageUrl} name={person.name} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: t.surface }]}>
                <Text style={[styles.avatarFallbackText, { color: t.textSecondary }]}>
                  {person.name.slice(0, 1)}
                </Text>
              </View>
            )}
            <Text style={[styles.name, { color: t.textPrimary }]}>{person.name}</Text>
            {person.overview !== undefined && (
              <Text style={[styles.overview, { color: t.textSecondary }]} numberOfLines={4}>
                {person.overview}
              </Text>
            )}
            <Text style={[styles.sectionTitle, { color: t.textPrimary }]}>
              {tr('person.filmography')}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: t.textSecondary }]}>
              {tr('person.emptyFilmography')}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <TvPosterCard
              item={item}
              frame={{ width: cellWidth, height: TV_CARD_IMAGE_HEIGHT }}
              onPress={() => navigation.navigate(ROUTES.ITEM, { itemId: item.id })}
            />
          </View>
        )}
      />
    </TvScreenFrame>
  );
}

/** 人物头像（手机 96dp 的 TV 放大档 160dp，10-foot 可读性） */
function TvPersonAvatar({ imageUrl, name }: { imageUrl: string; name: string }) {
  const t = useTvTheme();
  const styles = createStyles();
  return (
    <View style={[styles.avatar, { backgroundColor: t.surface }]}>
      <Image
        source={{ uri: imageUrl }}
        style={styles.avatarImage}
        contentFit="cover"
        transition={200}
        accessibilityLabel={name}
      />
    </View>
  );
}

const AVATAR_SIZE = 160;

const createStyles = () =>
  StyleSheet.create({
    header: { gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      overflow: 'hidden',
    },
    avatarImage: { width: '100%', height: '100%' },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    avatarFallbackText: { fontSize: 56, fontWeight: '700' },
    name: { fontSize: 30, fontWeight: '700' },
    overview: { fontSize: 17, lineHeight: 26, maxWidth: 720 },
    sectionTitle: { fontSize: 20, fontWeight: '700', marginTop: 12 },
    listContent: {
      paddingHorizontal: TV_GRID_CONTENT_PADDING,
      paddingBottom: 32,
    },
    cell: {
      flex: 1,
      alignItems: 'flex-start',
      paddingHorizontal: TV_GRID_GAP / 2,
      paddingBottom: TV_GRID_GAP,
    },
    empty: { padding: 32, alignItems: 'center' },
    emptyText: { fontSize: 17 },
  });
