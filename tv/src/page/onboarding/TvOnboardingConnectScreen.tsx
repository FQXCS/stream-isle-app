/**
 * TV 连接服务器页（TV-m1 §4.3）：地址 TextInput（TV IME）+ 连接 + 历史服务器快选行 +
 * 错误文案 errorMessageOf + TLS 引导。状态机与手机 OnboardingConnectScreen 同构
 * （IDLE → PROBING → SERVER_OK | TLS_OFFER | ERROR），错误分态全由 AppErrorCode 驱动。
 */
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { ServerInfo } from '@/adapter/model';
import { AppError, errorMessageKeyOf, type AppErrorCode } from '@/infra/error';
import { AppIcon } from '@/component/AppIcon';
import { useT } from '@/i18n';
import type { ThemeTokens } from '@/constant/theme';
import { connect } from '@/service/AuthService';
import { useAccountStore, type ServerAccount } from '@/store/accountStore';
import { useSettingsStore } from '@/store/settingsStore';
import { normalizeAddress } from '@/util/normalizeUrl';

import { TvPressable } from '@tv/component/TvPressable';
import { TvScreenFrame } from '@tv/component/TvScreenFrame';
import { useTvTheme } from '@tv/component/useTvTheme';

type ConnectPhase = 'IDLE' | 'PROBING' | 'SERVER_OK' | 'TLS_OFFER' | 'ERROR';

interface TvOnboardingConnectScreenProps {
  /** 探测成功 → 下一步进入登录屏（带 serverInfo，Root 提升状态） */
  onConnected(serverInfo: ServerInfo): void;
  /** 历史服务器快选：选中直接进登录屏（带记录重建 serverInfo） */
  onPickRecord(record: ServerAccount): void;
}

export function TvOnboardingConnectScreen({
  onConnected,
  onPickRecord,
}: TvOnboardingConnectScreenProps) {
  const t = useTvTheme();
  const tr = useT();
  const styles = createStyles(t);
  const servers = useAccountStore((state) => state.servers);
  const [phase, setPhase] = useState<ConnectPhase>('IDLE');
  const [address, setAddress] = useState('');
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);

  /** 探测：错误分态全部由 AppErrorCode 驱动（细分在 AuthService.connect 内，页面不自行调 probe） */
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

  /** 自签名证书引导：白名单记入规范化 baseUrl 键 → 重进 PROBING（手机同口径） */
  const handleIgnoreTls = () => {
    const normalized = normalizeAddress(address);
    if (normalized === null) {
      return;
    }
    useSettingsStore.getState().actions.setInsecureTlsAllowed(normalized, true);
    void handleConnect();
  };

  const probing = phase === 'PROBING';

  return (
    <TvScreenFrame>
      <View style={styles.content}>
        <Text style={[styles.title, { color: t.textPrimary }]}>{tr('server.connectTitle')}</Text>
        <Text style={[styles.hint, { color: t.textSecondary }]}>{tr('server.connectHint')}</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: t.surface, color: t.textPrimary, borderColor: t.separator },
          ]}
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
          <Text style={[styles.errorText, { color: t.danger }]}>
            {tr(errorMessageKeyOf(errorCode))}
          </Text>
        )}
        {phase === 'TLS_OFFER' && (
          <View style={styles.tlsBox}>
            {/* 文案取 ERROR_MESSAGE_MAP（TLS_ERROR），逐字一致（手机同口径） */}
            <Text style={[styles.errorText, { color: t.danger }]}>{tr('error.TLS_ERROR')}</Text>
            <TvPressable
              focusKind="row"
              focusable
              accessibilityRole="button"
              accessibilityLabel={tr('server.ignoreTlsRetry')}
              onPress={handleIgnoreTls}
              style={[styles.secondaryButton, { borderColor: t.accent }]}
            >
              <Text style={[styles.secondaryText, { color: t.accent }]}>
                {tr('server.ignoreTlsRetry')}
              </Text>
            </TvPressable>
          </View>
        )}
        <TvPressable
          focusKind="card"
          focusable
          hasTVPreferredFocus
          accessibilityRole="button"
          accessibilityLabel={tr('server.connect')}
          onPress={() => void handleConnect()}
          disabled={probing}
          style={[styles.primaryButton, { backgroundColor: t.accent }]}
        >
          <Text style={[styles.primaryText, { color: t.accentOn }]}>
            {probing ? tr('server.probing') : tr('server.connect')}
          </Text>
        </TvPressable>
        {phase === 'SERVER_OK' && serverInfo !== null && (
          <View style={[styles.serverCard, { backgroundColor: t.surface }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.badge, { color: t.accent, borderColor: t.accent }]}>
                {serverInfo.flavor}
              </Text>
              <Text style={[styles.serverName, { color: t.textPrimary }]}>
                {serverInfo.serverName || tr('server.unnamedServer')}
              </Text>
            </View>
            <Text style={[styles.version, { color: t.textSecondary }]}>
              {tr('server.version', { version: serverInfo.version })}
            </Text>
            {serverInfo.versionTooLow && (
              <Text style={[styles.errorText, { color: t.warning }]}>
                {tr('server.versionTooLow')}
              </Text>
            )}
            <TvPressable
              focusKind="card"
              focusable
              hasTVPreferredFocus
              accessibilityRole="button"
              accessibilityLabel={tr('server.next')}
              onPress={() => onConnected(serverInfo)}
              style={[styles.primaryButton, { backgroundColor: t.accent }]}
            >
              <Text style={[styles.primaryText, { color: t.accentOn }]}>{tr('server.next')}</Text>
            </TvPressable>
          </View>
        )}
        {servers.length > 0 && (
          <View style={styles.historyBox}>
            <Text style={[styles.historyTitle, { color: t.textSecondary }]}>
              {tr('tv.savedServers')}
            </Text>
            {servers.map((server) => (
              <TvPressable
                key={server.serverId}
                focusKind="row"
                focusable
                accessibilityRole="button"
                accessibilityLabel={server.serverName || tr('server.unnamedServer')}
                onPress={() => onPickRecord(server)}
                style={[styles.historyRow, { backgroundColor: t.surface }]}
              >
                <AppIcon name="server" size={22} color={t.textSecondary} />
                <View style={styles.historyMeta}>
                  <Text style={[styles.historyName, { color: t.textPrimary }]} numberOfLines={1}>
                    {server.serverName || tr('server.unnamedServer')}
                  </Text>
                  <Text style={[styles.historyUrl, { color: t.textTertiary }]} numberOfLines={1}>
                    {server.baseUrl}
                  </Text>
                </View>
                <Text style={[styles.historyBadge, { color: t.textTertiary }]}>
                  {server.flavor}
                </Text>
              </TvPressable>
            ))}
          </View>
        )}
      </View>
    </TvScreenFrame>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, maxWidth: 720, alignSelf: 'center', width: '100%' },
    title: { fontSize: 28, fontWeight: '700' },
    hint: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
    input: {
      borderRadius: 14,
      fontSize: 20,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderWidth: StyleSheet.hairlineWidth,
      width: '100%',
    },
    errorText: { fontSize: 16 },
    tlsBox: { gap: 14, alignItems: 'center' },
    secondaryButton: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 28,
      paddingVertical: 12,
    },
    secondaryText: { fontSize: 16, fontWeight: '600' },
    primaryButton: {
      borderRadius: 14,
      paddingHorizontal: 48,
      paddingVertical: 16,
      alignItems: 'center',
    },
    primaryText: { fontSize: 18, fontWeight: '700' },
    serverCard: {
      borderRadius: 14,
      padding: 24,
      alignItems: 'center',
      gap: 12,
      width: '100%',
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    badge: {
      fontSize: 14,
      fontWeight: '700',
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    serverName: { fontSize: 20, fontWeight: '700' },
    version: { fontSize: 14 },
    historyBox: { gap: 10, width: '100%' },
    historyTitle: { fontSize: 14 },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    historyMeta: { flex: 1, gap: 2 },
    historyName: { fontSize: 16, fontWeight: '600' },
    historyUrl: { fontSize: 13 },
    historyBadge: { fontSize: 13 },
  });
