# AGENTS.md

## 项目概览

Stream Isle Mobile：**仅 Android** 的 Emby/Jellyfin 通用客户端（对标 VidHub，差异化补齐音乐与照片；兼容 Jellyfin Server 10.8+ / Emby Server 4.7+）。

- 移动端代码位于**仓库根目录**（`src/` + `android/`，与服务端、`ui/` 等子项目同级演进、独立构建）。

## 技术栈与架构约束（编码时按此执行）

- 框架：**React Native 0.76+（TypeScript strict）+ Expo prebuild 裸工作流**；`android/` 为 prebuild 产物且**入库**（.gitignore 只忽略其构建产物），真机调试需 dev client（Expo Go 装不了原生模块）。
- 播放器双引擎：视频 react-native-video 6.x（ExoPlayer）、音频 react-native-track-player；两引擎共用 PlaybackService 播放决策与 ProgressService 进度上报，不重复造轮子。
- 基建选型：zustand + MMKV（persist）、axios（拦截器统一认证头/错误归一化/证书开关）、expo-secure-store（Token）、expo-image + @shopify/flash-list、reanimated + gesture-handler。
- **UI 不感知服务器类型**：所有 Emby/Jellyfin 差异压进 `src/adapter/` 的 ServerAdapter（JellyfinAdapter / EmbyAdapter，预留 StreamIsleAdapter 第三实现位）；服务层不直接发请求，Adapter 产出的 API 描述统一由 ApiClient 执行。
- MVP 边界（明确不做）：DRM、iOS / TV 端、服务端管理功能、漫画/电子书。
- 分层目录：`src/` 按 `adapter / infra / service / store / page / component / constant / util` 组织。

## UI 图标规范（编码时按此执行）

- **图标库优先**：UI 图标统一使用 `@expo/vector-icons` 的 **MaterialCommunityIcons**。若 MaterialCommunityIcons 确无所需图标，先询问是否引入其他图标族（如 Ionicons / MaterialIcons），不要自行新增图标族。
- **统一入口**：业务组件一律通过 `src/component/AppIcon.tsx` 的语义名使用（`<AppIcon name="play" size={20} color={t.textPrimary} />`），不直接在页面/组件里 import 图标族；新增图标扩展 `AppIconName` 与 `ICON_GLYPH_MAP`。经确认引入其他图标族时，同样必须收口到 `AppIcon`，不得在业务代码直接 import。
- **emoji / Unicode 可保留**：现有 emoji / Unicode 图标（如文件夹无图占位 📁）不强制迁移；新增图标优先使用图标库。
- **SVG 兜底**：仅当 MaterialCommunityIcons 与已确认引入的其他图标族均无匹配图标时，才允许用 `react-native-svg` 自绘；自绘必须注册进 `AppIcon`（语义名 + 映射），禁止在业务组件内联 `<Svg>`，并在提交说明注明「图标库无匹配，自绘注册 AppIcon」。
- **尺寸/颜色**：尺寸随场景（14–16 次级信息 / 18–20 按钮 / 22–24 导航与工具栏 / 32–64 大号占位）；颜色取主题 token（普通页面用 `useTheme()`，Player / PhotoViewer / NowPlaying 沉浸页用固定 `COLORS`），不硬编码色值（既有 `#FFFFFF` 沉浸口径除外）。
- **无障碍**：`AppIcon` 默认 `accessible={false}`，纯图标按钮必须提供 `accessibilityLabel`，避免 TalkBack 丢失语义或朗读私用区字符。
- **非图标例外**：文字首字头像、SeekBar/进度条、二维码、媒体图片与库图保持现状。

## 常用命令（在仓库根目录执行）

```bash
npm run lint                    # 质量门禁 1/3
npx tsc --noEmit                # 质量门禁 2/3
npx jest                        # 质量门禁 3/3（adapter 差异 / DeviceProfileBuilder / 错误归一化等单测）
npx expo prebuild -p android    # 产出 android/（入库）
npx expo run:android            # 真机构建安装（Android 8+ / minSdk 26）
```

- CI：lint + test + Android debug 构建；三件套全绿是每个里程碑验收第 1 条。Android 构建需 **JDK 21**（compileSdk 37 的 core-for-system-modules.jar 需 JDK 21 的 jlink，JDK 17 实测 JdkImageTransform 失败）。
- 分支习惯：每个里程碑一个 `feature/m<N>-xxx` 分支（如 M1 用 `feature/m1-skeleton`）。
- **警告处理**：lint / tsc / jest 输出中的警告要一并处理，保持零警告；成本低（调整 import、消除多余 hook 依赖、补 eslint 注释等）的直接修掉，成本高（升级依赖版本、改库内部行为等）的可不处理，并在提交说明中注明原因。

## 本地联调测试环境（Emby 模拟器实测）

- 测试服务器：Emby **RYM 4.10.2.0**（宿主机 Windows 服务），主机地址 `http://localhost:8096/`，账密 `test / 123456`（本地测试账号）。
- **模拟器内连接必须用 `http://10.0.2.2:8096/`**：Android 模拟器的 `localhost` 指模拟器自身，`10.0.2.2` 才映射到宿主机；真机调试则用局域网 IP。
- 本机构建 JDK：默认 JAVA_HOME 为 JDK 8，`android/gradle.properties` 已固定 `org.gradle.java.home=E:/Java/jdk-21.0.10`。
- 排障：Emby 服务端日志在 `E:/emby/programdata/logs/embyserver.txt`，可核对请求是否到达服务器、状态码与认证头（曾借此定位「服务器 200 但客户端报错」的 SecureStore key 问题）。

## 专项规则（触发式加载）

执行以下操作时，**必须先读取对应规则文件，再动手**：

| 触发场景 | 规则文件 | 核心约束 |
|----------|----------|----------|
| 执行 `git commit` | [.rules/commit.md](.rules/commit.md) | 关键词格式 `feat:` / `fix:` / `refactor:` |
