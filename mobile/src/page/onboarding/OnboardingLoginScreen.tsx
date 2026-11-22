/**
 * 登录页（M1 文档 §4.10 OnboardingLogin + M6 文档 §4.3.3 Quick Connect 流）：
 * 登录 / 登录失败 / 重登 / 同服务器多用户最小交互 + Quick Connect 免密登录面板。
 * params { serverInfo?: ServerInfo; serverId?: string }，两个入口都闭环：
 * Connect 正常流程带 serverInfo（服务器尚未入库）；401 重登按 serverId 从 accountStore 恢复。
 * M6 QC 流（M6 §4.3.3）：登录表单下方「Quick Connect 免密登录」按钮 → beginQuickConnect →
 * QC 面板（大号 6 位授权码 + 同内容二维码 + 引导文案 + 轮询动效 + 取消）；
 * 授权后自动换取 Token 走保存链路进 Tabs；禁用/超时/过期/取消 → 面板内中文提示可重试或回表单。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import type { AppErrorCode } from '@/infra/error';
import type { ServerInfo } from '@/adapter/model';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, POSTER_RADIUS, SPACING } from '@/constant/theme';
import { useTheme } from '@/component/useTheme';
import { useT } from '@/i18n';
import { AppError, errorMessageKeyOf } from '@/infra/error';
import type { RootStackParamList } from '@/page/navigation/types';
import { beginQuickConnect, login, saveAccount, type QuickConnectFlow } from '@/service/AuthService';
import { useAccountStore, upstreamServerIdOf } from '@/store/accountStore';
import { compareVersion } from '@/util/semver';
import { MIN_EMBY_VERSION, MIN_JELLYFIN_VERSION } from '@/constant/server';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.ONBOARDING_LOGIN>;

/** 已保存用户行（点击直接进 Tabs 的最小交互） */
interface SavedUser {
  userId: string;
  userName: string;
}

export function OnboardingLoginScreen({ route, navigation }: Props) {
  const t = useTheme();
  const tr = useT();
  const servers = useAccountStore((state) => state.servers);
  const routeServerInfo = route.params?.serverInfo;
  const routeServerId = route.params?.serverId;

  /** QC 面板态：null=登录表单；非 null=面板进行中（码/二维码/轮询态） */
  const [qcFlow, setQcFlow] = useState<QuickConnectFlow | null>(null);
  const [qcError, setQcError] = useState<AppErrorCode | null>(null);

  /** 卸载守卫（gate 重建栈后异步续延不再操作已失效的 navigation） */
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );
  // QC 轮询生命周期：flow 更换/关闭面板/卸载时 cancel 旧轮询（UI 返回必须 cancel，M6 §4.3.2）
  useEffect(() => () => qcFlow?.cancel(), [qcFlow]);

  /**
   * resolveServerInfo（§4.10）：route.params.serverInfo 优先（Connect 正常流程）；
   * 否则按记录 id 从 accountStore.servers 恢复（401 重登/同服务器加账号）。
   * 注意 serverInfo.serverId 用上游 id（本地记录 id 可能带 #2 后缀），recordId 才是本地记录 id。
   */
  const resolved = useMemo<{
    serverInfo: ServerInfo;
    savedUsers: SavedUser[];
    recordId?: string;
  }>(() => {
    if (routeServerInfo !== undefined) {
      const upstreamId = routeServerInfo.serverId;
      const saved = servers.find(
        (server) => upstreamServerIdOf(server) === upstreamId
      );
      return {
        serverInfo: routeServerInfo,
        savedUsers: saved?.users.map((user) => ({ userId: user.userId, userName: user.userName })) ?? [],
        recordId: saved?.serverId,
      };
    }
    if (routeServerId !== undefined) {
      const saved = servers.find((server) => server.serverId === routeServerId);
      if (saved === undefined) {
        // 导航时序错误：开发期即暴露，绝不静默兜底（§4.7 断言语义）
        throw new Error(`时序错误：OnboardingLogin 未找到 serverId=${routeServerId} 的账号记录`);
      }
      const minVersion = saved.flavor === 'JELLYFIN' ? MIN_JELLYFIN_VERSION : MIN_EMBY_VERSION;
      const serverInfo: ServerInfo = {
        flavor: saved.flavor,
        baseUrl: saved.baseUrl,
        serverId: upstreamServerIdOf(saved),
        serverName: saved.serverName,
        version: saved.version,
        versionTooLow: compareVersion(saved.version, minVersion) < 0,
      };
      return {
        serverInfo,
        savedUsers: saved.users.map((user) => ({ userId: user.userId, userName: user.userName })),
        recordId: saved.serverId,
      };
    }
    throw new Error('时序错误：OnboardingLogin 缺少 serverInfo/serverId 导航参数');
  }, [routeServerInfo, routeServerId, servers]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [errorCode, setErrorCode] = useState<AppError['code'] | null>(null);

  /** 已保存用户：点击后 switchActiveUser（内部预热 Token），gate 自动进 Tabs（同服务器多用户） */
  const handlePickSavedUser = async (userId: string) => {
    // 消费 401 重登标记（若有），下次登出走 Connect 首屏
    useAccountStore.getState().actions.setReloginServerId(null);
    await useAccountStore
      .getState()
      .actions.switchActiveUser(resolved.recordId ?? resolved.serverInfo.serverId, userId);
    // guest 流程 gate 重建栈本屏已卸载（pop 不执行）；authed 追加用户流程就地弹回设置页
    dismissIfMounted();
  };

  const dismissIfMounted = () => {
    if (mountedRef.current && navigation.canGoBack()) {
      navigation.pop();
    }
  };

  /** 表单登录：失败 LOGIN_FAILED 显示「用户名或密码错误」、网络类错误复用 ErrorView */
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
      // 消费 401 重登标记（若有），下次登出走 Connect 首屏
      useAccountStore.getState().actions.setReloginServerId(null);
      // 成功后 guest 流程 gate 响应 active 变化自动切到 Tabs（§4.9 响应式）；
      // authed 追加用户/服务器流程（设置页进入）栈未重建，就地弹回（M4 §4.5）
      dismissIfMounted();
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

  // —— M6：Quick Connect 流（M6 文档 §4.3.3）——

  /** 发起 QC：beginQuickConnect（Enabled 探测 → Initiate）→ 切换 QC 面板态 */
  const handleStartQuickConnect = () => {
    setQcError(null);
    void (async () => {
      try {
        const flow = await beginQuickConnect(resolved.serverInfo, resolved.recordId);
        setQcFlow(flow);
        // 轮询直至授权（内部完成换 Token + 保存链路）；resolve → 关闭面板 → 进 Tabs
        await flow.awaitAuthorization();
        if (!mountedRef.current) {
          return;
        }
        setQcFlow(null);
        useAccountStore.getState().actions.setReloginServerId(null);
        dismissIfMounted();
      } catch (err) {
        if (!mountedRef.current) {
          return;
        }
        setQcFlow(null);
        // 面板内展示对应中文提示（禁用/超时/取消/过期），可重试或回密码登录（M6 §4.3.3）
        if (err instanceof AppError && err.code !== 'QUICK_CONNECT_CANCELLED') {
          setQcError(err.code);
        } else if (!(err instanceof AppError)) {
          setQcError('UNKNOWN');
        }
      }
    })();
  };

  /** 取消 QC：置取消标志（立即 reject 且不再轮询）后回登录表单（M6 §4.3.2）；
   *  flow 置 null 触发上方 cleanup 再次 cancel（幂等），无 ref 可变共享 */
  const handleCancelQuickConnect = () => {
    qcFlow?.cancel();
    setQcFlow(null);
    setQcError(null);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: t.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: t.textPrimary }]}>{tr('server.loginTitle')}</Text>
      <Text style={[styles.subtitle, { color: t.textSecondary }]}>
        {tr('server.loginServerLabel', {
          name: resolved.serverInfo.serverName || tr('server.unnamedServer'),
          flavor: resolved.serverInfo.flavor,
        })}
      </Text>
      {resolved.serverInfo.versionTooLow && (
        <Text style={[styles.warning, { color: t.warning }]}>{tr('server.versionTooLow')}</Text>
      )}
      {qcFlow === null ? (
        <>
          {resolved.savedUsers.length > 0 && (
            <View style={styles.savedBox}>
              <Text style={[styles.savedTitle, { color: t.textSecondary }]}>
                {tr('server.savedAccounts')}
              </Text>
              {resolved.savedUsers.map((user) => (
                <Pressable
                  key={user.userId}
                  style={({ pressed }) => [
                    styles.savedRow,
                    { backgroundColor: t.surface },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => void handlePickSavedUser(user.userId)}
                >
                  <Text style={[styles.savedName, { color: t.textPrimary }]}>{user.userName}</Text>
                  <Text style={[styles.savedHint, { color: t.textSecondary }]}>
                    {tr('server.tapToEnter')}
                  </Text>
                </Pressable>
              ))}
              <Text style={[styles.savedTitle, { color: t.textSecondary }]}>
                {tr('server.useOtherAccount')}
              </Text>
            </View>
          )}
          <TextInput
            style={[
              styles.input,
              { backgroundColor: t.surface, color: t.textPrimary },
            ]}
            value={username}
            onChangeText={setUsername}
            placeholder={tr('server.formUsername')}
            placeholderTextColor={t.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, { backgroundColor: t.surface, color: t.textPrimary }]}
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
          {/* M1 §4.10 错误分态：非密码类错误（网络不可达/TLS/服务器错误等）就地渲染文案
              （返工勘误：errorCode 不得只写不读——输错地址点登录必须有反馈） */}
          {errorCode !== null && !loginFailed && (
            <Text style={[styles.errorText, { color: t.danger }]}>
              {tr(errorMessageKeyOf(errorCode))}
            </Text>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: t.accent },
              pressed && styles.pressed,
            ]}
            onPress={() => void handleSubmit()}
            disabled={submitting || username === '' || password === ''}
          >
            <Text style={[styles.primaryButtonText, { color: t.accentOn }]}>
              {submitting ? tr('server.signingIn') : tr('server.loginTitle')}
            </Text>
          </Pressable>
          {/* M6：Quick Connect 入口（M6 §4.3.3；登录表单下方） */}
          <Pressable
            style={({ pressed }) => [
              styles.qcButton,
              { borderColor: t.accent },
              pressed && styles.pressed,
            ]}
            onPress={handleStartQuickConnect}
          >
            <Text style={[styles.qcButtonText, { color: t.accent }]}>
              {tr('server.quickConnect')}
            </Text>
          </Pressable>
          {qcError !== null && (
            <Text style={[styles.errorText, { color: t.danger }]}>
              {tr(errorMessageKeyOf(qcError))}
            </Text>
          )}
        </>
      ) : (
        <QuickConnectPanel
          code={qcFlow.session.code}
          friendlyName={qcFlow.session.friendlyName}
          onCancel={handleCancelQuickConnect}
        />
      )}
    </ScrollView>
  );
}

/**
 * QC 面板（M6 文档 §4.3.3）：大号 6 位授权码（等宽数字字体）+ 同内容二维码
 * （内容 = 授权码字符串本身，供另一台设备相机扫码取码，开放问题 1 形态）+
 * 引导文案「打开已登录设备：网页端 设置 → Quick Connect，输入此码确认」+ 轮询动效 + 取消按钮。
 */
function QuickConnectPanel({
  code,
  friendlyName,
  onCancel,
}: {
  code: string;
  friendlyName?: string;
  onCancel: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  return (
    <View style={[styles.qcPanel, { backgroundColor: t.surface }]}>
      {friendlyName !== undefined && (
        <Text style={[styles.qcServer, { color: t.textSecondary }]}>{friendlyName}</Text>
      )}
      <Text style={[styles.qcCode, { color: t.textPrimary }]}>{code}</Text>
      <View style={styles.qrBox}>
        <QRCode value={code} size={140} color={t.textPrimary} backgroundColor="transparent" />
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
      <Pressable
        style={({ pressed }) => [
          styles.qcCancelButton,
          { backgroundColor: t.surfaceElevated },
          pressed && styles.pressed,
        ]}
        onPress={onCancel}
      >
        <Text style={[styles.qcCancelText, { color: t.textPrimary }]}>{tr('common.cancel')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.xl, gap: SPACING.m, justifyContent: 'center', flexGrow: 1 },
  title: { fontSize: FONT_SIZE.header, fontWeight: '700' },
  subtitle: { fontSize: FONT_SIZE.body },
  warning: { fontSize: FONT_SIZE.body },
  savedBox: { gap: SPACING.s },
  savedTitle: { fontSize: FONT_SIZE.body },
  savedRow: {
    borderRadius: POSTER_RADIUS,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  savedName: { fontSize: FONT_SIZE.body },
  savedHint: { fontSize: FONT_SIZE.body },
  input: {
    borderRadius: POSTER_RADIUS,
    fontSize: FONT_SIZE.body,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
  },
  errorText: { fontSize: FONT_SIZE.body },
  primaryButton: {
    borderRadius: POSTER_RADIUS,
    alignItems: 'center',
    paddingVertical: SPACING.m,
  },
  primaryButtonText: { fontSize: FONT_SIZE.body, fontWeight: '600' },
  qcButton: {
    borderRadius: POSTER_RADIUS,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: SPACING.m,
  },
  qcButtonText: { fontSize: FONT_SIZE.body, fontWeight: '600' },
  qcPanel: {
    borderRadius: POSTER_RADIUS,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.m,
  },
  qcServer: { fontSize: FONT_SIZE.body },
  qcCode: {
    fontSize: 44,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 6,
  },
  qrBox: { padding: SPACING.s, backgroundColor: '#FFFFFF', borderRadius: 8 },
  qcGuide: { fontSize: FONT_SIZE.body, textAlign: 'center', lineHeight: 20 },
  qcPolling: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
  qcPollingText: { fontSize: FONT_SIZE.body },
  qcCancelButton: {
    borderRadius: POSTER_RADIUS,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.s,
  },
  qcCancelText: { fontSize: FONT_SIZE.body },
  pressed: { opacity: 0.7 },
});
