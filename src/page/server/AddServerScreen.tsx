/**
 * 添加 / 编辑服务器表单（影视服务器页「+」与卡片菜单「编辑」进入）：
 * 名称 / 协议 / 服务器地址 / 路径 / 端口号 / 用户名 / 密码，
 * 添加 = 探测 + 登录 + 保存并激活（类型以入口选择为准）；编辑 = 探测确认同一台服务器后更新资料（不动 Token）。
 */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ServerFlavor } from '@/adapter/model';
import { AppIcon } from '@/component/AppIcon';
import { useTheme } from '@/component/useTheme';
import { ROUTES } from '@/constant/navigation';
import { FONT_SIZE, POSTER_RADIUS, SPACING, type ThemeTokens } from '@/constant/theme';
import { AppError, errorMessageKeyOf } from '@/infra/error';
import { getPassword } from '@/infra/credentialVault';
import type { MessageKey } from '@/i18n';
import { useT } from '@/i18n';
import type { RootStackParamList } from '@/page/navigation/types';
import { addServer, updateServer } from '@/service/ServerService';
import { useAccountStore, type ServerAccount } from '@/store/accountStore';
import { useSettingsStore } from '@/store/settingsStore';
import { composeServerUrl, splitServerUrl } from '@/util/serverUrl';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.SERVER_ADD>;

/** 编辑模式回填（服务器记录缺失时按添加模式兜底） */
function editServerOf(params: Props['route']['params']): ServerAccount | undefined {
  if (params.mode !== 'edit') {
    return undefined;
  }
  return useAccountStore.getState().servers.find((server) => server.serverId === params.serverId);
}

export function AddServerScreen({ route, navigation }: Props) {
  const t = useTheme();
  const tr = useT();
  const styles = createStyles(t);
  const params = route.params;
  const editing = editServerOf(params);
  const isEdit = params.mode === 'edit' && editing !== undefined;
  const flavor: ServerFlavor =
    params.mode === 'add' ? (params.flavor ?? 'EMBY') : (editing?.flavor ?? 'EMBY');
  const initialAddress = editing !== undefined ? splitServerUrl(editing.baseUrl) : null;
  // 单账号模型：编辑时回填该服务器当前账号用户名，密码不回显（留空表示不修改账号）
  const currentUserName =
    editing?.users.find((user) => user.userId === editing.activeUserId)?.userName ??
    editing?.users[0]?.userName ??
    '';

  const [name, setName] = useState(editing?.serverName ?? '');
  const [https, setHttps] = useState(initialAddress?.https ?? false);
  const [host, setHost] = useState(initialAddress?.host ?? '');
  const [path, setPath] = useState(initialAddress?.path ?? '');
  const [port, setPort] = useState(initialAddress?.port ?? '8096');
  const [username, setUsername] = useState(currentUserName);
  const [password, setPassword] = useState('');
  /** 已加密留存的密码（编辑时解密回显；与输入框对比判断是否改动） */
  const [storedPassword, setStoredPassword] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);

  const editingUserId = editing?.activeUserId ?? editing?.users[0]?.userId ?? null;

  // 编辑模式：从 SecureStore 解密已保存密码并回显（密文 + 眼睛切换）
  useEffect(() => {
    if (params.mode !== 'edit' || editingUserId === null || editing === undefined) {
      return;
    }
    let cancelled = false;
    void getPassword(editing.serverId, editingUserId).then((value) => {
      if (!cancelled && value !== null) {
        setStoredPassword(value);
        setPassword(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [editing, editingUserId, params.mode]);

  // 必填项：服务器地址 / 端口号 / 用户名（密码、名称、路径可选）；全部填了才允许提交
  const canSubmit =
    !submitting && host.trim() !== '' && port.trim() !== '' && username.trim() !== '';

  /** 提交：添加（探测+登录+保存）/ 编辑（改资料；账号有改动才重登并替换账号） */
  const handleSubmit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }
    const passwordChanged = password !== (storedPassword ?? '');
    const credentialChanged = passwordChanged || username.trim() !== currentUserName;
    if (params.mode === 'edit') {
      if (credentialChanged && password === '') {
        setErrorKey('server.editNeedsPassword');
        return;
      }
      if (password !== '' && username.trim() === '') {
        setErrorKey('server.usernameRequired');
        return;
      }
    }
    setSubmitting(true);
    setErrorKey(null);
    const address = { https, host, port, path };
    try {
      if (params.mode === 'edit') {
        await updateServer({
          serverId: params.serverId,
          name,
          address,
          username,
          // 账号没改动时传空密码 → 不重登；改动了才用输入框里的密码重登
          password: credentialChanged ? password : '',
        });
      } else {
        await addServer({
          flavor,
          name,
          https,
          host,
          port,
          path,
          username,
          password,
        });
      }
      navigation.goBack();
    } catch (err) {
      if (err instanceof AppError) {
        setErrorKey(errorMessageKeyOf(err.code));
      } else {
        setErrorKey('server.operationFailed');
      }
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, currentUserName, flavor, host, https, name, navigation, params, password, path, port, storedPassword, username]);

  /** 自签名证书：写入白名单后重试（与连接页同口径） */
  const handleIgnoreTls = useCallback(() => {
    const normalized = composeServerUrl({ https, host, port, path });
    if (normalized === null) {
      return;
    }
    useSettingsStore.getState().actions.setInsecureTlsAllowed(normalized, true);
    void handleSubmit();
  }, [handleSubmit, host, https, path, port]);

  // 导航头：标题 + 右侧「添加/保存」
  useLayoutEffect(() => {
    navigation.setOptions({
      title: isEdit
        ? tr('server.editServerTitle')
        : tr('server.addFlavorTitle', { flavor: flavor === 'EMBY' ? 'Emby' : 'Jellyfin' }),
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isEdit ? tr('common.save') : tr('server.add')}
          disabled={!canSubmit}
          onPress={() => void handleSubmit()}
        >
          <Text
            style={{
              fontSize: FONT_SIZE.body,
              fontWeight: '600',
              // 可提交为主文字色（浅色主题即黑色），未填完必填项用更浅的第三级文字色
              color: canSubmit ? t.textPrimary : t.textTertiary,
            }}
          >
            {submitting
              ? tr('server.saving')
              : isEdit
                ? tr('common.save')
                : tr('server.add')}
          </Text>
        </Pressable>
      ),
    });
  }, [canSubmit, flavor, handleSubmit, isEdit, navigation, submitting, t.textPrimary, t.textTertiary, tr]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: t.bg }]} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>{tr('server.formName')}</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={tr('server.placeholderName')}
          placeholderTextColor={t.textSecondary}
          editable={!submitting}
        />
      </View>

      <Text style={styles.sectionLabel}>{tr('server.formProtocol')}</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>HTTPS</Text>
          <Switch value={https} onValueChange={setHttps} />
        </View>
      </View>

      <Text style={styles.sectionLabel}>{tr('server.formAddress')}</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={host}
          onChangeText={setHost}
          placeholder={tr('server.placeholderHost')}
          placeholderTextColor={t.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!submitting}
        />
      </View>

      <Text style={styles.sectionLabel}>{tr('server.formPath')}</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={path}
          onChangeText={setPath}
          placeholder={tr('server.placeholderPath')}
          placeholderTextColor={t.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
        />
      </View>

      <Text style={styles.sectionLabel}>{tr('server.formPort')}</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={port}
          onChangeText={setPort}
          placeholder="8096"
          placeholderTextColor={t.textSecondary}
          keyboardType="number-pad"
          editable={!submitting}
        />
      </View>

      <Text style={styles.sectionLabel}>
        {isEdit ? tr('server.formAccount') : tr('server.formUsername')}
      </Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder={tr('server.placeholderRequired')}
          placeholderTextColor={t.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
        />
      </View>

      <Text style={styles.sectionLabel}>{tr('server.formPassword')}</Text>
      <View style={styles.card}>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            value={password}
            onChangeText={setPassword}
            placeholder={
              isEdit
                ? storedPassword === null
                  ? tr('server.placeholderPasswordKeep')
                  : tr('server.placeholderPasswordStored')
                : tr('server.placeholderPasswordOptional')
            }
            placeholderTextColor={t.textSecondary}
            secureTextEntry={!passwordVisible}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              passwordVisible ? tr('server.hidePassword') : tr('server.showPassword')
            }
            hitSlop={8}
            onPress={() => setPasswordVisible((visible) => !visible)}
          >
            <AppIcon
              name={passwordVisible ? 'eye' : 'eyeOff'}
              size={20}
              color={t.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      {submitting && (
        <View style={styles.statusRow}>
          <ActivityIndicator color={t.accent} />
          <Text style={styles.statusText}>
            {isEdit ? tr('server.verifyingAddress') : tr('server.connectingServer')}
          </Text>
        </View>
      )}
      {errorKey !== null && <Text style={styles.errorText}>{tr(errorKey)}</Text>}
      {errorKey === 'error.TLS_ERROR' && (
        <Pressable style={styles.secondaryButton} onPress={handleIgnoreTls} disabled={submitting}>
          <Text style={styles.secondaryButtonText}>{tr('server.ignoreTlsRetry')}</Text>
        </Pressable>
      )}
      <Text style={styles.hint}>{isEdit ? tr('server.editHint') : tr('server.addHint')}</Text>
    </ScrollView>
  );
}

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { padding: SPACING.l, paddingBottom: SPACING.xl, gap: SPACING.s },
    sectionLabel: {
      color: t.textSecondary,
      fontSize: FONT_SIZE.body,
      marginTop: SPACING.s,
      paddingHorizontal: SPACING.xs,
    },
    card: {
      backgroundColor: t.surface,
      borderRadius: POSTER_RADIUS,
      paddingHorizontal: SPACING.l,
      paddingVertical: SPACING.xs,
    },
    input: {
      color: t.textPrimary,
      fontSize: FONT_SIZE.body,
      paddingVertical: SPACING.m,
    },
    passwordRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s },
    passwordInput: { flex: 1 },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.s,
    },
    switchLabel: { color: t.textPrimary, fontSize: FONT_SIZE.body },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.s, paddingTop: SPACING.m },
    statusText: { color: t.textSecondary, fontSize: FONT_SIZE.body },
    errorText: { color: t.danger, fontSize: FONT_SIZE.body, paddingTop: SPACING.s },
    secondaryButton: {
      backgroundColor: t.surface,
      borderRadius: POSTER_RADIUS,
      alignItems: 'center',
      paddingVertical: SPACING.m,
      marginTop: SPACING.s,
    },
    secondaryButtonText: { color: t.textPrimary, fontSize: FONT_SIZE.body },
    hint: { color: t.textSecondary, fontSize: FONT_SIZE.body - 2, paddingTop: SPACING.m },
  });
