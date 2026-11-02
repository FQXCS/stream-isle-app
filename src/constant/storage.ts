/**
 * 存储键常量（M1 文档 §4.2 / §4.5.3；设计文档 §9）。
 */

/** MMKV persist key：账号 store */
export const ACCOUNT_STORE_KEY = 'account-store';

/** MMKV persist key：设置 store */
export const SETTINGS_STORE_KEY = 'settings-store';

/** MMKV persist key：库页视图偏好（按库记忆排序） */
export const LIBRARY_VIEW_STORE_KEY = 'library-view-store';

/** MMKV persist key：库页 Tab/排序显示配置（按 flavor + 库类型覆盖） */
export const LIBRARY_DISPLAY_STORE_KEY = 'library-display-store';

/** secure-store key 前缀；完整键规范 `token_{serverId}_{userId}`（MMKV 中无任何 token 线索）。
 * 注意：SecureStore 仅允许字母数字与 . - _，不能用冒号分隔（否则 setItemAsync 直接抛错） */
export const TOKEN_KEY_PREFIX = 'token_';

/** MMKV 兜底 deviceId 的存储键（expo-application getAndroidId 异常时使用） */
export const DEVICE_ID_FALLBACK_KEY = 'device-id-fallback';
