/**
 * TV 登录页（TV-m1 §4.3）：Quick Connect 主路径（进入即发起，大字配对码 + 二维码）
 * + 账密兜底（TV IME）。共享 AuthService 原样复用（login/saveAccount/beginQuickConnect 全接口）。
 * 参数解析同手机 OnboardingLoginScreen：serverInfo 优先，否则按记录重建（401 重登/快选上下文）。
 * BACK 键为 Android 根级默认（退出应用，TV 根级惯例，TV-m1 §4.3）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import type { ServerInfo } from '@/adapter/model';
import { AppError, errorMessageKeyOf, type AppErrorCode } from '@/infra/error';
import { useT } from '@/i18n';
import type { ThemeTokens } from '@/constant/theme';
import { useTvTheme } from '@tv/component/useTvTheme';
import {
  beginQuickConnect,
  login,
  saveAccount,
  type QuickConnectFlow,
} from '@/service/AuthService';
import {
  useAccountStore,
  upstreamServerIdOf,
  type ServerAccount,
} from '@/store/accountStore';
import { compareVersion } from '@/util/semver';
import { MIN_EMBY_VERSION, MIN_JELLYFIN_VERSION } from '@/constant/server';

import { TvPressable } from '@tv/component/TvPressable';
import { TvScreenFrame } from '@tv/component/TvScreenFrame';

/** 已保存用户行（同服务器多用户快切） */
interface SavedUser {
  userId: string;
  userName: string;
}

interface TvOnboardingLoginScreenProps {
  /** Connect 正常流程带 serverInfo（服务器尚未入库） */
  serverInfo?: ServerInfo;
  /** 401 重登 / 历史快选上下文：按记录重建 */
  serverRecord?: ServerAccount;
  /** 主动上下文（Connect 快选进入）显示「返回连接页」；401 重登不显示 */
  onBackToConnect?: () => void;
}

/** 登录路径 */
type LoginMode = 'qc' | 'password';

export function TvOnboardingLoginScreen({
  serverInfo: routeServerInfo,
  serverRecord,
  onBackToConnect,
}: TvOnboardingLoginScreenProps) {
  const t = useTvTheme();
  const tr = useT();
  const styles = createStyles(t);
  const servers = useAccountStore((state) => state.servers);

  // —— 参数解析（同手机 OnboardingLoginScreen resolved 口径）——
  const resolved = useMemo<{
    serverInfo: ServerInfo;
    savedUsers: SavedUser[];
    recordId?: string;
  }>(() => {
    if (routeServerInfo !== undefined) {
      const upstreamId = routeServerInfo.serverId;
      const saved = servers.find((server) => upstreamServerIdOf(server) === upstreamId);
      return {
        serverInfo: routeServerInfo,
        savedUsers:
          saved?.users.map((user) => ({ userId: user.userId, userName: user.userName })) ?? [],
        recordId: saved?.serverId,
      };
    }
    if (serverRecord !== undefined) {
      const minVersion =
        serverRecord.flavor === 'JELLYFIN' ? MIN_JELLYFIN_VERSION : MIN_EMBY_VERSION;
      const info: ServerInfo = {
        flavor: serverRecord.flavor,
        baseUrl: serverRecord.baseUrl,
        serverId: upstreamServerIdOf(serverRecord),
        serverName: serverRecord.serverName,
        version: serverRecord.version,
        versionTooLow: compareVersion(serverRecord.version, minVersion) < 0,
      };
      return {
        serverInfo: info,
        savedUsers: serverRecord.users.map((user) => ({
          userId: user.userId,
          userName: user.userName,
        })),
        recordId: serverRecord.serverId,
      };
    }
    throw new Error('时序错误：TvOnboardingLoginScreen 缺少 serverInfo/serverRecord 参数');
  }, [routeServerInfo, serverRecord, servers]);

  // —— 路径状态：QC 主路径（进入即发起）+ 账密兜底 ——
  const [mode, setMode] = useState<LoginMode>('qc');
  const [qcFlow, setQcFlow] = useState<QuickConnectFlow | null>(null);
  const [qcError, setQcError] = useState<AppErrorCode | null>(null);
  // 在途 flow 引用：重试/切路径时先 cancel 旧轮询（幂等，已 reject 时为空操作）
  const qcFlowRef = useRef<QuickConnectFlow | null>(null);
  /** 发起中（flow 未就绪且无错误）：派生态，避免 effect 内同步 setState（react-hooks 规则） */
  const qcStarting = mode === 'qc' && qcFlow === null && qcError === null;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);

  /** 卸载守卫（gate 重建后异步续延不再 setState） */
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  /**
   * 发起 QC（进入即 beginQuickConnect，TV-m1 §4.3 主路径；重试按钮同链路）：
   * Enabled 探测 → Initiate → awaitAuthorization（共享 5s/120s 轮询）→ 授权后自动进壳
   * （saveAccount 激活 active，gate 响应式切换，无需手动导航）。
   */
  const startQuickConnect = useCallback(() => {
    qcFlowRef.current?.cancel();
    qcFlowRef.current = null;
    void (async () => {
      try {
        const flow = await beginQuickConnect(resolved.serverInfo, resolved.recordId);
        if (!mountedRef.current) {
          flow.cancel();
          return;
        }
        qcFlowRef.current = flow;
        setQcFlow(flow);
        await flow.awaitAuthorization();
        if (!mountedRef.current) {
          return;
        }
        // 授权成功：消费 401 重登标记（若有），gate 响应 active 变化自动进壳
        useAccountStore.getState().actions.setReloginServerId(null);
      } catch (err) {
        if (!mountedRef.current) {
          return;
        }
        qcFlowRef.current = null;
        setQcFlow(null);
        // 面板内展示对应提示（禁用/超时/过期/取消），可重试或改账密（手机 M6 §4.3.3 口径）
        if (err instanceof AppError && err.code !== 'QUICK_CONNECT_CANCELLED') {
          setQcError(err.code);
        } else if (!(err instanceof AppError)) {
          setQcError('UNKNOWN');
        }
      }
    })();
  }, [resolved]);

  // 进入登录屏即发起 QC（主路径，TV-m1 §4.3）；mode 切走/卸载时旧轮询由 ref cancel + cleanup 兜底。
  // startQuickConnect 入依赖：resolved（servers 引用）仅在保存链路后变化——届时 gate 已切壳卸载本屏，
  // 不会实际重启轮询
  useEffect(() => {
    if (mode === 'qc') {
      startQuickConnect();
    }
    return () => {
      qcFlowRef.current?.cancel();
      qcFlowRef.current = null;
    };
  }, [mode, startQuickConnect]);

  /** 重试（事件回调可同步清错误态，派生 qcStarting 立即回到发起中） */
  const handleQuickConnectRetry = useCallback(() => {
    setQcError(null);
    startQuickConnect();
  }, [startQuickConnect]);

  /** 表单登录：login → saveAccount → gate 自动进壳（同手机链路） */
  const handleSubmit = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setLoginFailed(false);
    setErrorCode(null);
    try {
      const auth = await login(resolved.serverInfo, username, password);
      await saveAccount(resolved.serverInfo, auth, resolved.recordId);
      useAccountStore.getState().actions.setReloginServerId(null);
      // 成功后 gate 响应 active 变化自动切壳（§4.9 响应式）
    } catch (err) {
      if (err instanceof AppError) {
        if (err.code === 'LOGIN_FAILED') {
          setLoginFailed(true);
        } else {
          setErrorCode(err.code);
        }
      } else {
        setErrorCode('UNKNOWN');
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** 已保存用户快切：switchActiveUser（内部预热 Token），gate 自动进壳 */
  const handlePickSavedUser = async (userId: string) => {
    useAccountStore.getState().actions.setReloginServerId(null);
    await useAccountStore
      .getState()
      .actions.switchActiveUser(resolved.recordId ?? resolved.serverInfo.serverId, userId);
  };

  const qcPending = qcStarting || qcFlow !== null;

  return (
    <TvScreenFrame>
      <View style={styles.content}>
        <Text style={[styles.title, { color: t.textPrimary }]}>{tr('server.loginTitle')}</Text>
        <Text style={[styles.subtitle, { color: t.textSecondary }]}>
          {tr('server.loginServerLabel', {
            name: resolved.serverInfo.serverName || tr('server.unnamedServer'),
            flavor: resolved.serverInfo.flavor,
          })}
        </Text>
        {resolved.serverInfo.versionTooLow && (
          <Text style={[styles.errorText, { color: t.warning }]}>
            {tr('server.versionTooLow')}
          </Text>
        )}
        {onBackToConnect !== undefined && (
          <TvPressable
            focusKind="row"
            focusable
            accessibilityRole="button"
            accessibilityLabel={tr('nav.back')}
            onPress={onBackToConnect}
            style={styles.backButton}
          >
            <Text style={[styles.backText, { color: t.textSecondary }]}>
              {tr('nav.back')}
            </Text>
          </TvPressable>
        )}
        {mode === 'qc' ? (
          <QuickConnectPanel
            pending={qcPending}
            code={qcFlow?.session.code}
            friendlyName={qcFlow?.session.friendlyName}
            error={qcError}
            onRetry={handleQuickConnectRetry}
            onUsePassword={() => {
              // 在途轮询由 mode effect cleanup cancel（TV-m1 §4.3：切路径必须 cancel）
              setQcFlow(null);
              setQcError(null);
              setMode('password');
            }}
          />
        ) : (
          <View style={styles.formBox}>
            {resolved.savedUsers.length > 0 && (
              <View style={styles.savedBox}>
                <Text style={[styles.sectionLabel, { color: t.textSecondary }]}>
                  {tr('server.savedAccounts')}
                </Text>
                {resolved.savedUsers.map((user) => (
                  <TvPressable
                    key={user.userId}
                    focusKind="row"
                    focusable
                    accessibilityRole="button"
                    accessibilityLabel={user.userName}
                    onPress={() => void handlePickSavedUser(user.userId)}
                    style={styles.savedRow}
                  >
                    <Text style={[styles.savedName, { color: t.textPrimary }]}>
                      {user.userName}
                    </Text>
                    <Text style={[styles.savedHint, { color: t.textSecondary }]}>
                      {tr('server.tapToEnter')}
                    </Text>
                  </TvPressable>
                ))}
                <Text style={[styles.sectionLabel, { color: t.textSecondary }]}>
                  {tr('server.useOtherAccount')}
                </Text>
              </View>
            )}
            <TextInput
              style={[
                styles.input,
                { backgroundColor: t.surface, color: t.textPrimary, borderColor: t.separator },
              ]}
              value={username}
              onChangeText={setUsername}
              placeholder={tr('server.formUsername')}
              placeholderTextColor={t.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={[
                styles.input,
                { backgroundColor: t.surface, color: t.textPrimary, borderColor: t.separator },
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder={tr('server.formPassword')}
              placeholderTextColor={t.textSecondary}
              secureTextEntry
            />
            {loginFailed && (
              <Text style={[styles.errorText, { color: t.danger }]}>
                {tr(errorMessageKeyOf('LOGIN_FAILED'))}
              </Text>
            )}
            {/* 非密码类错误（网络不可达/TLS/服务器错误等）就地渲染文案（手机 M1 §4.10 同口径） */}
            {errorCode !== null && !loginFailed && (
              <Text style={[styles.errorText, { color: t.danger }]}>
                {tr(errorMessageKeyOf(errorCode))}
              </Text>
            )}
            <TvPressable
              focusKind="card"
              focusable
              accessibilityRole="button"
              accessibilityLabel={tr('server.loginTitle')}
              onPress={() => void handleSubmit()}
              disabled={submitting || username === '' || password === ''}
              style={[styles.primaryButton, { backgroundColor: t.accent }]}
            >
              <Text style={[styles.primaryText, { color: t.accentOn }]}>
                {submitting ? tr('server.signingIn') : tr('server.loginTitle')}
              </Text>
            </TvPressable>
            <TvPressable
              focusKind="row"
              focusable
              accessibilityRole="button"
              accessibilityLabel={tr('server.quickConnect')}
              onPress={() => setMode('qc')}
              style={[styles.qcSwitchButton, { borderColor: t.accent }]}
            >
              <Text style={[styles.qcSwitchText, { color: t.accent }]}>
                {tr('server.quickConnect')}
              </Text>
            </TvPressable>
          </View>
        )}
      </View>
    </TvScreenFrame>
  );
}

/**
 * QC 面板（手机 M6 §4.3.3 口径，TV 视觉优先）：大字 6 位授权码（48sp+）+ 同内容二维码
 * （value=授权码字符串本身）+ 引导文案 + 轮询动效 + 改账密兜底。
 * 错误态（禁用/超时/过期）文案 + 重试按钮（D-pad 可达，验收 #4）。
 */
function QuickConnectPanel({
  pending,
  code,
  friendlyName,
  error,
  onRetry,
  onUsePassword,
}: {
  pending: boolean;
  code?: string;
  friendlyName?: string;
  error: AppErrorCode | null;
  onRetry(): void;
  onUsePassword(): void;
}) {
  const t = useTvTheme();
  const tr = useT();
  const styles = createStyles(t);
  return (
    <View style={[styles.qcPanel, { backgroundColor: t.surface }]}>
      {friendlyName !== undefined && (
        <Text style={[styles.qcServer, { color: t.textSecondary }]}>{friendlyName}</Text>
      )}
      {code !== undefined ? (
        <>
          <Text style={[styles.qcCode, { color: t.textPrimary }]}>{code}</Text>
          <View style={styles.qrBox}>
            {/* 二维码仅渲染冒烟：value=授权码（TV-m1 §6 风险 3，真机扫码联调留待局域网环境） */}
            <QRCode value={code} size={280} color="#111111" backgroundColor="#FFFFFF" />
          </View>
          <Text style={[styles.qcGuide, { color: t.textSecondary }]}>
            {tr('server.quickConnectGuide')}
          </Text>
          <View style={styles.qcPolling}>
            <ActivityIndicator color={t.accent} />
            <Text style={[styles.qcPollingText, { color: t.textSecondary }]}>
              {tr('server.waitingApproval')}
            </Text>
          </View>
        </>
      ) : error === null && pending ? (
        <View style={styles.qcPolling}>
          <ActivityIndicator color={t.accent} />
          <Text style={[styles.qcPollingText, { color: t.textSecondary }]}>
            {tr('server.probing')}
          </Text>
        </View>
      ) : null}
      {error !== null && (
        <>
          <Text style={[styles.errorText, { color: t.danger }]}>
            {tr(errorMessageKeyOf(error))}
          </Text>
          <TvPressable
            focusKind="card"
            focusable
            hasTVPreferredFocus={code === undefined}
            accessibilityRole="button"
            accessibilityLabel={tr('common.retry')}
            onPress={onRetry}
            style={[styles.primaryButton, { backgroundColor: t.accent }]}
          >
            <Text style={[styles.primaryText, { color: t.accentOn }]}>
              {tr('common.retry')}
            </Text>
          </TvPressable>
        </>
      )}
      <TvPressable
        focusKind="row"
        focusable
        hasTVPreferredFocus={code !== undefined}
        accessibilityRole="button"
        accessibilityLabel={tr('tv.usePasswordLogin')}
        onPress={onUsePassword}
        style={styles.qcSwitchButton}
      >
        <Text style={[styles.qcSwitchText, { color: t.textPrimary }]}>
          {tr('tv.usePasswordLogin')}
        </Text>
      </TvPressable>
    </View>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
      maxWidth: 720,
      alignSelf: 'center',
      width: '100%',
    },
    title: { fontSize: 28, fontWeight: '700' },
    subtitle: { fontSize: 16, textAlign: 'center' },
    errorText: { fontSize: 16, textAlign: 'center' },
    backButton: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
    backText: { fontSize: 14 },
    formBox: { gap: 14, width: '100%' },
    savedBox: { gap: 10 },
    sectionLabel: { fontSize: 15 },
    savedRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    savedName: { fontSize: 17, fontWeight: '600' },
    savedHint: { fontSize: 14 },
    input: {
      borderRadius: 14,
      fontSize: 20,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderWidth: StyleSheet.hairlineWidth,
    },
    primaryButton: {
      borderRadius: 14,
      paddingHorizontal: 48,
      paddingVertical: 16,
      alignItems: 'center',
    },
    primaryText: { fontSize: 18, fontWeight: '700' },
    qcSwitchButton: {
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 28,
      paddingVertical: 14,
      alignItems: 'center',
    },
    qcSwitchText: { fontSize: 16, fontWeight: '600' },
    qcPanel: {
      borderRadius: 16,
      padding: 28,
      alignItems: 'center',
      gap: 16,
      width: '100%',
    },
    qcServer: { fontSize: 15 },
    qcCode: {
      fontSize: 52,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      letterSpacing: 8,
    },
    qrBox: { padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 },
    qcGuide: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
    qcPolling: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    qcPollingText: { fontSize: 15 },
  });
