/**
 * 人物页（M2 文档 §4.1/§4.5）：头像、姓名、简介、出演作品网格（Movie/Series），
 * 点击作品回详情页（M2 §1.2 A3）。
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MediaDetail, MediaLibraryItem } from '@/adapter/model';
import { ErrorView } from '@/component/ErrorView';
import { LoadingView } from '@/component/LoadingView';
import { PosterCard } from '@/component/PosterCard';
import { ROUTES } from '@/constant/navigation';
import { GRID_COLUMNS } from '@/constant/browse';
import { FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { useT } from '@/i18n';
import type { RootStackParamList } from '@/page/navigation/types';
import { detailService } from '@/service/DetailService';
import { AppError } from '@/infra/error';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** 出演网格卡宽度（3 列） */
const FILMOGRAPHY_COLUMNS = GRID_COLUMNS;

export function PersonScreen() {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const route = useRoute<{ key: string; name: string; params: { personId: string } }>();
  const personId = route.params.personId;
  const navigation = useNavigation<NavigationProp>();

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
      <View style={styles.fill}>
        <LoadingView />
      </View>
    );
  }

  if (error !== null || person === null) {
    return (
      <View style={styles.fill}>
        <ErrorView error={error ?? new AppError('UNKNOWN')} onRetry={() => void loadPerson()} />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <FlashList
        data={filmographyList}
        numColumns={FILMOGRAPHY_COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: MediaLibraryItem }) => (
          <Pressable
            onPress={() => navigation.navigate(ROUTES.ITEM, { itemId: item.id })}
            style={styles.cardCell}
          >
            <PosterCard item={item} />
          </Pressable>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            {person.posterImageUrl !== undefined ? (
              <Image
                source={{ uri: person.posterImageUrl }}
                style={styles.avatar}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{person.name.slice(0, 1)}</Text>
              </View>
            )}
            <Text style={styles.name}>{person.name}</Text>
            {person.overview !== undefined && (
              <Text style={styles.overview}>{person.overview}</Text>
            )}
            <Text style={styles.sectionTitle}>{tr('person.filmography')}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{tr('person.emptyFilmography')}</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  fill: { flex: 1, backgroundColor: t.bg },
  listContent: { paddingHorizontal: SPACING.m, paddingBottom: SPACING.xl },
  header: { gap: SPACING.s, paddingHorizontal: SPACING.s, marginBottom: SPACING.l },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: t.surface,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { color: t.textSecondary, fontSize: FONT_SIZE.header },
  name: { color: t.textPrimary, fontSize: FONT_SIZE.header, fontWeight: '700' },
  overview: { color: t.textSecondary, fontSize: FONT_SIZE.body, lineHeight: 22 },
  sectionTitle: {
    color: t.textPrimary,
    fontSize: FONT_SIZE.title,
    marginTop: SPACING.m,
  },
  cardCell: { flex: 1, padding: SPACING.xs },
  empty: { padding: SPACING.xl, alignItems: 'center' },
  emptyText: { color: t.textSecondary, fontSize: FONT_SIZE.body },
});
