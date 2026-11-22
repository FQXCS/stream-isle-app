/**
 * 软件更新页（设置 → 关于 → 版本号进入）：
 * 品牌头图 + 当前版本 + 检查状态 + 底部检查按钮；检测到新版本时展示 Release 说明，
 * 主按钮跳转 GitHub Release 页面由用户手动下载（不做应用内 APK 下载/安装）。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/component/useTheme';
import { APP_VERSION, GITHUB_RELEASES_URL } from '@/constant/app';
import { CARD_RADIUS, CARD_SHADOW, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useT } from '@/i18n';
import {
  formatReleaseNotes,
  isNewerVersion,
  updateService,
  type AppReleaseInfo,
} from '@/service/UpdateService';

/** 检查状态机：进入页面自动检查一次，按钮可重复触发 */
type CheckState =
  | { phase: 'checking' }
  | { phase: 'latest' }
  | { phase: 'available'; release: AppReleaseInfo }
  | { phase: 'failed' };

export function UpdateScreen() {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<CheckState>({ phase: 'checking' });
  /** 自增触发重新检查（初始进入 + 重试；检查中按钮禁用，不会并发） */
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let active = true;
    updateService
      .fetchLatestRelease()
      .then((release) => {
        if (!active) {
          return;
        }
        setState(
          isNewerVersion(APP_VERSION, release.version)
            ? { phase: 'available', release }
            : { phase: 'latest' }
        );
      })
      .catch(() => {
        if (active) {
          setState({ phase: 'failed' });
        }
      });
    return () => {
      active = false;
    };
  }, [requestId]);

  const openUrl = useCallback((url: string) => {
    void Linking.openURL(url).catch(() => {
      // 无浏览器场景静默（与设置页外链口径一致）
    });
  }, []);

  const checking = state.phase === 'checking';
  const updateAvailable = state.phase === 'available';

  const statusText = (() => {
    switch (state.phase) {
      case 'checking':
        return tr('update.statusChecking');
      case 'latest':
        return tr('update.statusLatest');
      case 'available':
        return tr('update.statusAvailable', { version: state.release.version });
      case 'failed':
        return tr('update.statusFailed');
    }
  })();

  const buttonLabel = updateAvailable
    ? tr('update.download')
    : state.phase === 'failed'
      ? tr('common.retry')
      : checking
        ? tr('update.checking')
        : tr('update.check');

  const handlePrimary = () => {
    if (state.phase === 'available') {
      openUrl(state.release.htmlUrl || GITHUB_RELEASES_URL);
      return;
    }
    if (!checking) {
      setState({ phase: 'checking' });
      setRequestId((id) => id + 1);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xl }]}
    >
      {/* 品牌头图：软色底 + 两个圆形高光，替代系统更新页的大幅品牌图 */}
      <View style={styles.hero}>
        <View style={styles.heroCircleLarge} />
        <View style={styles.heroCircleSmall} />
        <Image
          source={require('../../../assets/icon.png')}
          style={styles.heroIcon}
          contentFit="contain"
        />
        <Text style={styles.heroTitle}>Stream Isle</Text>
      </View>

      <View style={styles.versionBlock}>
        <Text style={styles.versionText}>{APP_VERSION}</Text>
        <Text
          style={[
            styles.statusText,
            (state.phase === 'latest' || updateAvailable) && styles.statusAccent,
            state.phase === 'failed' && styles.statusError,
          ]}
        >
          {statusText}
        </Text>
        {state.phase === 'failed' && (
          <Text style={styles.failedHint}>{tr('update.failedHint')}</Text>
        )}
      </View>

      {state.phase === 'available' && (
        <View style={styles.releaseCard}>
          <Text style={styles.releaseSectionTitle}>{tr('update.releaseNotes')}</Text>
          <Text style={styles.releaseName}>{state.release.name}</Text>
          <Text style={styles.releaseNotes}>
            {state.release.notes !== ''
              ? formatReleaseNotes(state.release.notes)
              : tr('update.noNotes')}
          </Text>
        </View>
      )}

      {state.phase === 'failed' && (
        <Pressable
          style={({ pressed }) => [styles.releasesLink, pressed && styles.pressed]}
          onPress={() => openUrl(GITHUB_RELEASES_URL)}
        >
          <Text style={styles.releasesLinkText}>{tr('update.openReleases')}</Text>
        </Pressable>
      )}

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            checking && styles.buttonDisabled,
          ]}
          onPress={handlePrimary}
          disabled={checking}
        >
          {checking && <ActivityIndicator size="small" color={t.accentOn} />}
          <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
        </Pressable>
        <Text style={styles.sourceHint}>{tr('update.sourceHint')}</Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: {
      flexGrow: 1,
      padding: SPACING.l,
      gap: SPACING.m,
    },
    hero: {
      height: 280,
      borderRadius: CARD_RADIUS,
      backgroundColor: t.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.s,
      overflow: 'hidden',
      ...CARD_SHADOW,
    },
    heroCircleLarge: {
      position: 'absolute',
      width: 300,
      height: 300,
      borderRadius: 150,
      backgroundColor: t.surface,
      opacity: 0.45,
      top: -120,
      right: -110,
    },
    heroCircleSmall: {
      position: 'absolute',
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: t.surface,
      opacity: 0.65,
      bottom: -60,
      right: 18,
    },
    heroIcon: {
      width: 96,
      height: 96,
      borderRadius: 24,
    },
    heroTitle: {
      color: t.textPrimary,
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: -0.5,
      marginTop: SPACING.s,
    },
    versionBlock: {
      alignItems: 'center',
      gap: SPACING.xs,
      marginTop: SPACING.l,
    },
    versionText: {
      color: t.textPrimary,
      fontSize: 30,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    statusText: {
      color: t.textSecondary,
      fontSize: FONT_SIZE.title - 1,
      fontWeight: '500',
    },
    statusAccent: { color: t.accent },
    statusError: { color: t.danger },
    failedHint: { color: t.textTertiary, fontSize: FONT_SIZE.body - 1 },
    releaseCard: {
      backgroundColor: t.surface,
      borderRadius: CARD_RADIUS,
      padding: SPACING.l,
      gap: SPACING.s,
      ...CARD_SHADOW,
    },
    releaseSectionTitle: {
      color: t.textTertiary,
      fontSize: FONT_SIZE.caption + 1,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    releaseName: {
      color: t.textPrimary,
      fontSize: FONT_SIZE.title - 1,
      fontWeight: '600',
    },
    releaseNotes: {
      color: t.textSecondary,
      fontSize: FONT_SIZE.body,
      lineHeight: 21,
    },
    releasesLink: {
      alignSelf: 'center',
      paddingHorizontal: SPACING.m,
      paddingVertical: SPACING.s,
    },
    releasesLinkText: { color: t.accent, fontSize: FONT_SIZE.body, fontWeight: '500' },
    footer: {
      marginTop: 'auto',
      paddingTop: SPACING.xl,
      gap: SPACING.m,
      alignItems: 'center',
    },
    primaryButton: {
      alignSelf: 'stretch',
      minHeight: 50,
      borderRadius: 999,
      backgroundColor: t.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.s,
    },
    buttonDisabled: { opacity: 0.75 },
    primaryButtonText: { color: t.accentOn, fontSize: FONT_SIZE.title, fontWeight: '600' },
    sourceHint: { color: t.textTertiary, fontSize: FONT_SIZE.caption },
    pressed: { opacity: 0.7 },
  });
