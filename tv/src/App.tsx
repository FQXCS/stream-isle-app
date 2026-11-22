/**
 * TV 壳 smoke 验证页（TV-m0 §4.6）——m0 唯一的 TV 代码，不遵循 TV UI 规范
 * （TvScreenFrame 体系属 tv-m1），只为机械化验收：
 * - 信息区：Platform.isTV() / IS_TV_BUILD 一致性、设备与版本常量（验收 #7）；
 * - 焦点冒烟：fork Pressable onFocus/onBlur 变色 + DPAD_CENTER 触发 onPress（验收 #8）；
 * - 登录接口冒烟：共享层 AuthService 连接本地 Emby 并认证（验收 #9）。
 */
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import Constants from 'expo-constants';

import { connect, login } from '@/service/AuthService';
import type { ServerInfo } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { useTheme } from '@/component/useTheme';
import type { ThemeTokens } from '@/constant/theme';
import { IS_TV_BUILD } from '@tv/util/form';

/** 本地联调服务器（模拟器内 10.0.2.2 映射宿主机，AGENTS.md 联调环境） */
const SMOKE_SERVER_URL = 'http://10.0.2.2:8096';
const SMOKE_USERNAME = 'test';
const SMOKE_PASSWORD = '123456';

/** 登录冒烟状态机 */
type LoginState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ok'; message: string }
  | { phase: 'error'; message: string };

const rnVersion = Platform.constants.reactNativeVersion;
const RN_VERSION_TEXT = `${rnVersion.major}.${rnVersion.minor}.${rnVersion.patch}`;

export default function App() {
  const t = useTheme();
  const styles = createStyles(t);

  // 焦点冒烟：onFocus/onBlur 切换背景色（fork 焦点 API 生效的直读信号）
  const [focusFocused, setFocusFocused] = useState(false);
  const [focusPressed, setFocusPressed] = useState(false);
  // 登录冒烟结果
  const [loginState, setLoginState] = useState<LoginState>({ phase: 'idle' });

  // RN 0.88 fork：isTV 为布尔 getter（非方法）；Android Release 直接取 Platform.Version
  const formConsistent = Platform.isTV === IS_TV_BUILD;

  /** 登录接口冒烟：connect（探测）→ login（AuthenticateByName）→ 展示结果 */
  const runLoginSmoke = async () => {
    setLoginState({ phase: 'loading' });
    try {
      const info: ServerInfo = await connect(SMOKE_SERVER_URL);
      const auth = await login(info, SMOKE_USERNAME, SMOKE_PASSWORD);
      setLoginState({
        phase: 'ok',
        message: `「${info.serverName}」${info.flavor} v${info.version} 认证成功：${auth.userName}`,
      });
    } catch (err) {
      setLoginState({ phase: 'error', message: String(err) });
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Stream Isle TV · TV-m0 smoke</Text>

      {/* 信息区（验收 #7）：isTV 与构建期形态判定一致性 */}
      <View style={styles.section}>
        <InfoRow label="Platform.isTV" value={String(Platform.isTV)} ok={formConsistent} styles={styles} />
        <InfoRow label="extra.tv (IS_TV_BUILD)" value={String(IS_TV_BUILD)} ok={formConsistent} styles={styles} />
        <InfoRow
          label="形态一致性"
          value={formConsistent ? '一致 ✓' : '不一致 ✗'}
          ok={formConsistent}
          styles={styles}
        />
        <InfoRow label="设备" value={Constants.deviceName ?? Constants.modelName ?? '-'} styles={styles} />
        <InfoRow label="Android Release" value={String(Platform.Version)} styles={styles} />
        <InfoRow label="react-native（fork）" value={RN_VERSION_TEXT} styles={styles} />
        <InfoRow label="app version" value={Constants.expoConfig?.version ?? '-'} styles={styles} />
      </View>

      {/* 焦点冒烟（验收 #8）：D-pad 移动焦点变色，DPAD_CENTER 触发 onPress */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>焦点冒烟</Text>
        <Pressable
          focusable
          hasTVPreferredFocus
          accessibilityLabel="焦点冒烟按钮"
          style={[styles.button, focusFocused && styles.buttonFocused]}
          onFocus={() => setFocusFocused(true)}
          onBlur={() => setFocusFocused(false)}
          onPress={() => setFocusPressed(true)}
        >
          <Text style={styles.buttonText}>
            聚焦我（onFocus/onBlur {focusFocused ? '已变色' : '未触发'}）
          </Text>
        </Pressable>
        <Text style={styles.result}>
          DPAD_CENTER：{focusPressed ? '已触发 onPress ✓' : '待触发'}
        </Text>
      </View>

      {/* 登录接口冒烟（验收 #9）：共享层 AuthService → 本地 Emby */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>登录接口冒烟（共享层 AuthService）</Text>
        <Pressable
          focusable
          accessibilityLabel="登录接口冒烟按钮"
          style={[styles.button, focusFocused && styles.buttonFocused]}
          onPress={runLoginSmoke}
          disabled={loginState.phase === 'loading'}
        >
          <AppIcon name="account" size={20} color={t.accentOn} />
          <Text style={styles.buttonText}>
            {loginState.phase === 'loading' ? '连接中…' : `连接 ${SMOKE_SERVER_URL}`}
          </Text>
        </Pressable>
        <Text
          style={[
            styles.result,
            loginState.phase === 'ok' && styles.resultOk,
            loginState.phase === 'error' && styles.resultError,
          ]}
        >
          {loginState.phase === 'idle' && '待触发'}
          {loginState.phase === 'loading' && '请求中…'}
          {loginState.phase === 'ok' && loginState.message}
          {loginState.phase === 'error' && `失败：${loginState.message}`}
        </Text>
      </View>
    </ScrollView>
  );
}

/** 信息行：label 固定宽 + 值；ok 传入时按一致性着色 */
function InfoRow({
  label,
  value,
  ok,
  styles,
}: {
  label: string;
  value: string;
  ok?: boolean;
  styles: Styles;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, ok === true && styles.infoOk, ok === false && styles.infoError]}>
        {value}
      </Text>
    </View>
  );
}

/** 样式表（随主题 token 构建；smoke 页不做 TV 尺度规范） */
type Styles = Record<'root' | 'content' | 'title' | 'section' | 'sectionTitle' | 'button' | 'buttonFocused' | 'buttonText' | 'result' | 'resultOk' | 'resultError' | 'infoRow' | 'infoLabel' | 'infoValue' | 'infoOk' | 'infoError', StyleProp<ViewStyle> | StyleProp<TextStyle>>;

const createStyles = (t: ThemeTokens): Styles =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    content: { padding: 32, gap: 20 },
    title: { fontSize: 28, fontWeight: '700', color: t.textPrimary },
    section: { gap: 10, backgroundColor: t.surface, borderRadius: 12, padding: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: t.textPrimary },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: t.accent,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 20,
    },
    buttonFocused: {
      // 焦点态：accentSoft 底 + accent 描边（fork onFocus 直读信号）
      backgroundColor: t.accentSoft,
      borderWidth: 3,
      borderColor: t.accent,
    },
    buttonText: { fontSize: 18, color: t.accentOn },
    result: { fontSize: 14, color: t.textSecondary },
    resultOk: { color: t.success },
    resultError: { color: t.danger },
    infoRow: { flexDirection: 'row', gap: 12 },
    infoLabel: { width: 220, fontSize: 14, color: t.textSecondary },
    infoValue: { fontSize: 14, color: t.textPrimary, flexShrink: 1 },
    infoOk: { color: t.success },
    infoError: { color: t.danger },
  });
