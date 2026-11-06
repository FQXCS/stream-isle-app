/**
 * 连接服务器页（M1 文档 §4.10 OnboardingConnect 状态机）：
 * 地址规范化 / 探测 / 三类错误分态 / 版本警告 / 自签名证书引导。
 * 状态机：IDLE → PROBING → SERVER_OK | TLS_OFFER | ERROR（页面本地状态，不经 store）。
 */
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ServerInfo } from '@/adapter/model';
import { ROUTES } from '@/constant/navigation';
import { POSTER_RADIUS, FONT_SIZE, SPACING, type ThemeTokens } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { AppError, errorMessageOf } from '@/infra/error';
import type { AppErrorCode } from '@/infra/error';
import type { RootStackParamList } from '@/page/navigation/types';
import { connect } from '@/service/AuthService';
import { useSettingsStore } from '@/store/settingsStore';
import { normalizeAddress } from '@/util/normalizeUrl';

type ConnectPhase = 'IDLE' | 'PROBING' | 'SERVER_OK' | 'TLS_OFFER' | 'ERROR';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.ONBOARDING_CONNECT>;

/** 按钮文案全局唯一写法（验收标准 3 / §4.10 / §6.3 手测 1e 三处逐字引用） */
const IGNORE_TLS_BUTTON_LABEL = '忽略该服务器证书校验并重试';

export function OnboardingConnectScreen({ navigation }: Props) {
  const t = useTheme();
  const styles = createStyles(t);
  const [phase, setPhase] = useState<ConnectPhase>('IDLE');
  const [address, setAddress] = useState('');
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);

  /** 探测：错误分态全部由 AppErrorCode 驱动（页面不自行调 probe，细分在 AuthService.connect 内） */
  const handleConnect = async () => {
    setPhase('PROBING');
    setErrorCode(null);
    try {
      const info = await connect(address);
      setServerInfo(info);
      setPhase('SERVER_OK');
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'UNKNOWN';
      setErrorCode(code);
      setPhase(code === 'TLS_ERROR' ? 'TLS_OFFER' : 'ERROR');
    }
  };

  /** 自签名证书引导：白名单记入规范化 baseUrl 键 → 原生已全量回同步 → 重进 PROBING（axios 即可连通） */
  const handleIgnoreTls = () => {
    const normalized = normalizeAddress(address);
    if (normalized === null) {
      return;
    }
    // 白名单键 = 规范化 baseUrl（04 §4.6 终态），原生侧经 toHostPort 解析为 host:port
    useSettingsStore.getState().actions.setInsecureTlsAllowed(normalized, true);
    handleConnect();
  };

  const probing = phase === 'PROBING';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>连接服务器</Text>
      <Text style={styles.hint}>输入 Jellyfin / Emby 服务器地址，如 http://192.168.1.5:8096</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="192.168.1.5:8096"
        placeholderTextColor={t.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!probing}
      />
      {phase === 'ERROR' && errorCode !== null && (
        // 文案一律取 ERROR_MESSAGE_MAP 唯一出处（§4.10）
        <Text style={styles.errorText}>{errorMessageOf(errorCode)}</Text>
      )}
      {phase === 'TLS_OFFER' && (
        <View style={styles.tlsBox}>
          {/* 文案取 ERROR_MESSAGE_MAP（TLS_ERROR），逐字一致 */}
          <Text style={styles.errorText}>{errorMessageOf('TLS_ERROR')}</Text>
          <Pressable style={styles.secondaryButton} onPress={handleIgnoreTls}>
            <Text style={styles.secondaryButtonText}>{IGNORE_TLS_BUTTON_LABEL}</Text>
          </Pressable>
        </View>
      )}
      <Pressable
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        onPress={handleConnect}
        disabled={probing}
      >
        <Text style={styles.primaryButtonText}>{probing ? '探测中…' : '连接'}</Text>
      </Pressable>
      {phase === 'SERVER_OK' && serverInfo !== null && (
        <View style={styles.serverCard}>
          <View style={styles.cardHeader}>
            {/* 类型徽标：UI 展示探测结果，不感知后续请求 */}
            <Text style={styles.badge}>{serverInfo.flavor}</Text>
            <Text style={styles.serverName}>{serverInfo.serverName || '未命名服务器'}</Text>
          </View>
          <Text style={styles.version}>版本 {serverInfo.version}</Text>
          {serverInfo.versionTooLow && (
            <Text style={styles.warning}>
              版本过低（低于 Jellyfin 10.8 / Emby 4.7），部分功能可能不可用，可继续尝试
            </Text>
          )}
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={() =>
              navigation.navigate(ROUTES.ONBOARDING_LOGIN, { serverInfo })
            }
          >
            <Text style={styles.primaryButtonText}>下一步</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
    padding: SPACING.xl,
    gap: SPACING.m,
    justifyContent: 'center',
  },
  title: { color: t.textPrimary, fontSize: FONT_SIZE.header, fontWeight: '700' },
  hint: { color: t.textSecondary, fontSize: FONT_SIZE.body },
  input: {
    backgroundColor: t.surface,
    borderRadius: POSTER_RADIUS,
    color: t.textPrimary,
    fontSize: FONT_SIZE.body,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
  },
  errorText: { color: t.danger, fontSize: FONT_SIZE.body },
  tlsBox: { gap: SPACING.m },
  serverCard: {
    backgroundColor: t.surface,
    borderRadius: POSTER_RADIUS,
    padding: SPACING.l,
    gap: SPACING.s,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  badge: {
    color: t.accent,
    borderColor: t.accent,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: SPACING.s,
    paddingVertical: 2,
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
    overflow: 'hidden',
  },
  serverName: { color: t.textPrimary, fontSize: FONT_SIZE.title, fontWeight: '600' },
  version: { color: t.textSecondary, fontSize: FONT_SIZE.body },
  warning: { color: t.warning, fontSize: FONT_SIZE.body },
  primaryButton: {
    backgroundColor: t.accent,
    borderRadius: POSTER_RADIUS,
    alignItems: 'center',
    paddingVertical: SPACING.m,
  },
  secondaryButton: {
    backgroundColor: t.surface,
    borderRadius: POSTER_RADIUS,
    alignItems: 'center',
    paddingVertical: SPACING.m,
  },
  secondaryButtonText: { color: t.textPrimary, fontSize: FONT_SIZE.body },
  primaryButtonText: { color: t.accentOn, fontSize: FONT_SIZE.body, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
