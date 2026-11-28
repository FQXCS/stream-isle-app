# AGENTS.md

## 项目概览

Stream Isle：**仅 Android** 的 Emby/Jellyfin 通用客户端（对标 VidHub，差异化补齐音乐与照片；兼容 Jellyfin Server 10.8+ / Emby Server 4.7+）。

- **同仓双工程**（TV-m0 平移后）：`mobile/`（手机工程，`src/` + `android/`）+ `tv/`（Android TV 工程，独立 APK）；`plugins/`（共享 Expo 插件）、`modules/`（共享本地原生模块）、docs/.github 等为纯仓库级共享物。
- **共享层**：`mobile/src` 的 `adapter / service / infra / store / constant / util / i18n` 双端共用（TV 经 Metro watchFolders + `@/` 别名编译）；TV 专属代码在 `tv/src/`（`@tv/` 别名），禁 import `@/page`、`@/component`（白名单：useTheme / AppIcon / Toast），共享层反向禁 import `@/page` / `@/component`（lint 强制）。

## 技术栈与架构约束（编码时按此执行）

- 框架：**React Native 0.76+（TypeScript strict）+ Expo prebuild 裸工作流**；`android/` 为 prebuild 产物且**入库**（.gitignore 只忽略其构建产物），真机调试需 dev client（Expo Go 装不了原生模块）。
- **双端 RN 版本纪律**：手机用官方 react-native，TV 用 `react-native-tvos` fork（npm alias，仅 `tv/package.json`）；共享代码同时跑两个 RN，**大版本必须对齐**（0.88 ↔ 0.88.1-0），小版本各自跟进，手机升 SDK 不必等 fork。
- **双份 patch 同步义务**：`mobile/patches/` 与 `tv/patches/` 各持 `react-native-video` 补丁副本，升级 react-native-video 时**双仓同改**，文件头注释标注同步义务。
- 播放器双引擎：视频 react-native-video 6.x（ExoPlayer）、音频 react-native-track-player；两引擎共用 PlaybackService 播放决策与 ProgressService 进度上报，不重复造轮子。
- 基建选型：zustand + MMKV（persist）、axios（拦截器统一认证头/错误归一化/证书开关）、expo-secure-store（Token）、expo-image + @shopify/flash-list、reanimated + gesture-handler。
- **UI 不感知服务器类型**：所有 Emby/Jellyfin 差异压进 `src/adapter/` 的 ServerAdapter（JellyfinAdapter / EmbyAdapter，预留 StreamIsleAdapter 第三实现位）；服务层不直接发请求，Adapter 产出的 API 描述统一由 ApiClient 执行。
- MVP 边界（明确不做）：DRM、iOS / tvOS 端、服务端管理功能、漫画/电子书。Android TV 首版已交付（m0~m4，设计定稿于 `docs/design/TV 适配设计.md`：`tv/` 独立工程 + 手机平移 `mobile/`，TV 仅 fork 依赖差异，交互为 D-pad 焦点范式；音乐/照片/下载域与二级设置页顺延后续里程碑）。
- 分层目录：`mobile/src/` 按 `adapter / infra / service / store / page / component / constant / util` 组织；`tv/src/` 为 TV 层（page / component / navigation / util）。

## UI 图标规范（编码时按此执行）

- **图标库优先**：UI 图标统一使用 **Phosphor**（`phosphor-react-native`，线性风格，支持 `regular` / `fill` 等权重）。若 Phosphor 确无所需图标，先询问是否引入其他图标族，不要自行新增图标族。
- **统一入口**：业务组件一律通过 `src/component/AppIcon.tsx` 的语义名使用（`<AppIcon name="play" size={20} color={t.textPrimary} />`），不直接在页面/组件里 import 图标族；新增图标扩展 `AppIconName` 与 `GLYPH_MAP`（图标按模块按需引入，避免整包打进 bundle）。选中态/播放控制可用 `weight` 切换实心（如底部 Tab 选中传 `fill`）。经确认引入其他图标族时，同样必须收口到 `AppIcon`，不得在业务代码直接 import。
- **emoji / Unicode 可保留**：现有 emoji / Unicode 图标（如文件夹无图占位 📁）不强制迁移；新增图标优先使用图标库。
- **SVG 兜底**：仅当 Phosphor 与已确认引入的其他图标族均无匹配图标时，才允许用 `react-native-svg` 自绘；自绘必须注册进 `AppIcon`（语义名 + 映射），禁止在业务组件内联 `<Svg>`，并在提交说明注明「图标库无匹配，自绘注册 AppIcon」。
- **尺寸/颜色**：尺寸随场景（14–16 次级信息 / 18–20 按钮 / 22–24 导航与工具栏 / 32–64 大号占位）；颜色取主题 token（普通页面用 `useTheme()`，Player / PhotoViewer / NowPlaying 沉浸页用固定 `COLORS`），不硬编码色值（既有 `#FFFFFF` 沉浸口径除外）。
- **无障碍**：`AppIcon` 默认 `accessible={false}`，纯图标按钮必须提供 `accessibilityLabel`，避免 TalkBack 丢失语义或朗读私用区字符。
- **非图标例外**：文字首字头像、SeekBar/进度条、二维码、媒体图片与库图保持现状。

## 常用命令（cd mobile / cd tv 后执行）

```bash
# 手机（mobile/）
cd mobile
npm run lint                    # 质量门禁 1/3
npx tsc --noEmit                # 质量门禁 2/3
npx jest                        # 质量门禁 3/3（adapter 差异 / DeviceProfileBuilder / 错误归一化等单测）
npx expo prebuild -p android    # 产出 android/（入库）
npx expo run:android            # 真机/模拟器构建安装（Android 8+ / minSdk 26）

# TV（tv/）——RN 用 react-native-tvos fork，Metro 共享编译 mobile/src
cd tv
npm run lint                    # 门禁 1/2（含 @tv/ 边界规则）
npm run typecheck               # 门禁 2/2（fork 类型检查共享层）
npx expo prebuild -p android    # 产出 android/（入库）
npx expo run:android            # TV AVD 构建安装（D-pad 冒烟）
```

- CI：mobile job 四关（lint + test + Android debug 构建）+ tv job 三关（lint + tsc + debug 构建）；全绿是每个里程碑验收第 1 条。Android 构建需 **JDK 21**（compileSdk 37 的 core-for-system-modules.jar 需 JDK 21 的 jlink，JDK 17 实测 JdkImageTransform 失败）。
- 分支习惯：每个里程碑一个 `feature/m<N>-xxx` 分支（如 M1 用 `feature/m1-skeleton`）；TV 里程碑 `feature/tv-m<N>-xxx`。
- **警告处理**：lint / tsc / jest 输出中的警告要一并处理，保持零警告；成本低（调整 import、消除多余 hook 依赖、补 eslint 注释等）的直接修掉，成本高（升级依赖版本、改库内部行为等）的可不处理，并在提交说明中注明原因。

## 版本纪律与发版路由（2026-11-28 修订：同 tag 双 APK，TV 设计 §4.2 / decision TV-m4-S6）

- **bump**：一次 commit 同改 `mobile/app.config.ts` 与 `tv/app.config.ts` 的 `version`（两端版本名恒同步）；versionCode 各自递增（手机续现序列；TV 100 起独立序列，100→101…）。
- **tag**：单一 `v{version}` tag → **同一 GitHub Release 附加双 APK**（`StreamIsle-{version}({code}).apk` + `StreamIsle-TV-{version}({code}).apk`）；build-mobile / build-tv 并行构建后 publish-release 汇总发布，title `Stream Isle v{version}`，单序列默认 Latest（无端徽标抢占问题）。
- **notes**：基线取上一 `v*` tag（`git tag --list 'v*' --sort=creatordate` 排除当前；首个 tag 无基线走全量 fallback）；内容含 `mobile/` 与 `tv/` 路径提交（pathspec 按提交时路径，m0 平移前历史不入 notes）。
- **更新检查**：UpdateService 读 releases 列表取首条正式 Release（跳过 prerelease/draft 防御保留），无端前缀过滤；TV 更新 UI（后续里程碑）读同一 Release。

## 本地联调测试环境（Emby 模拟器实测）

- 测试服务器：Emby **RYM 4.10.2.0**（宿主机 Windows 服务），主机地址 `http://localhost:8096/`，账密 `test / 123456`（本地测试账号）。
- **模拟器内连接必须用 `http://10.0.2.2:8096/`**：Android 模拟器的 `localhost` 指模拟器自身，`10.0.2.2` 才映射到宿主机；真机调试则用局域网 IP。
- Gradle 9 launcher 只认环境变量（要求 ≥17）。
- 排障：Emby 服务端日志在 `E:/emby/programdata/logs/embyserver.txt`，可核对请求是否到达服务器、状态码与认证头（曾借此定位「服务器 200 但客户端报错」的 SecureStore key 问题）。

## 专项规则（触发式加载）

执行以下操作时，**必须先读取对应规则文件，再动手**：

| 触发场景 | 规则文件 | 核心约束 |
|----------|----------|----------|
| 执行 `git commit` | [.rules/commit.md](.rules/commit.md) | 关键词格式 `feat:` / `fix:` / `refactor:` |
