# Stream Isle Mobile

仅 Android 的 **Emby / Jellyfin 通用客户端**。大图沉浸式浏览、直连优先 / 自动转码播放；差异化补齐 **音乐、照片与图书（PDF）阅读**。一套代码兼容 Jellyfin Server 10.8+ 与 Emby Server 4.7+，服务器类型自动探测，用户无感知。

当前版本 `1.0.1`，已完成 MVP 与 P1 功能（连接浏览、转码字幕、搜索收藏、照片音乐、离线下载、Quick Connect、发布工程）以及图书阅读、库页 Tab / 排序配置等后续迭代。

## 功能特性

### 连接与账号

- 服务器地址支持 `host`、`host:port`、完整 URL，经 `/System/Info/Public` 自动识别 Jellyfin / Emby
- 多服务器、多用户管理，Token 存于系统安全存储，活跃账号一键切换
- 自签名证书按 `host:port` 白名单忽略（默认严格校验证书）
- Quick Connect 免密登录（Jellyfin 10.8+ / Emby 4.8+，授权码 + 二维码）

### 浏览与发现

- 首页：继续观看、下一集、各库最新添加
- 媒体库：海报墙分页浏览；每个库的 Tab 分类与排序项可按 **服务器类型**（Jellyfin / Emby）在设置中配置，并支持拖动排序
- 详情页：Hero 头部、媒体信息、演员、季集导航、相似推荐、条目长按操作、海报共享元素转场
- 搜索（电影 / 剧集 / 人物）、人物页、收藏、观看历史

### 播放

- **视频**：react-native-video（ExoPlayer / Media3）直连优先，不兼容编码自动走服务器 HLS 转码；字幕（外挂文本 / 烧录）、多音轨、码率档位、手势调亮度 / 音量 / 进度、横屏锁定
- 断点续播、节流进度上报、多端同步、自动连播下一集、标记已看
- **音乐**：专辑 / 艺术家 / 歌单 / 歌曲，队列连播 / 随机 / 循环，后台播放 + 通知栏 / 锁屏控制，歌词逐行同步，全局迷你播放条
- **照片**：相册网格、全屏查看器（双指缩放 / 滑动翻页 / GIF 动图）、保存到系统相册
- **图书**：书籍库浏览，PDF 连续滚动阅读、双击缩放、页码跳转、断点续读

### 离线与设置

- 视频离线下载（仅可直连条目）：断点续传、暂停 / 继续 / 重试 / 删除、本地播放，离线期间进度入队、联网后自动补报
- 深色 / 浅色 / 跟随系统（播放器、照片查看器、正在播放等沉浸页固定深色）
- 默认字幕语言、最大码率、HEVC 直连、蜂窝网络自动降档、继续观看 / 历史收录类型等设置

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 框架 | React Native 0.88 + Expo SDK 58（prebuild 裸工作流）+ TypeScript strict |
| 视频播放 | react-native-video 6.x（ExoPlayer / Media3） |
| 音频播放 | @rntp/player 5.x（后台播放 + MediaSession） |
| 导航 | React Navigation 7（Bottom Tabs + Native Stack） |
| 状态与持久化 | zustand + react-native-mmkv |
| 网络 | axios（统一认证头 / 错误归一化 / 证书开关） |
| 安全存储 | expo-secure-store |
| 图片与列表 | expo-image + @shopify/flash-list |
| 手势与动画 | react-native-reanimated + react-native-gesture-handler |
| 离线下载 | expo-file-system + expo-sqlite |
| PDF 阅读 | react-native-webview + pdf.js |
| 质量工具 | ESLint 9 + tsc + Jest（jest-expo） |

另有本地 Expo 原生模块（解码能力探测 `expo-media-caps`、播放手势 `expo-playback-gestures`），以及 Kotlin classic module 实现 TLS 白名单。

## 架构

```
UI（src/page、src/component）
        ↓
状态层（src/store，zustand）
        ↓
服务层（src/service：认证 / 浏览 / 播放决策 / 进度 / 下载 / 音频 / 照片 / 图书）
        ↓
兼容层（src/adapter：ServerAdapter → JellyfinAdapter / EmbyAdapter）
        ↓
基础设施（src/infra/api/ApiClient，axios）
        ↓
Jellyfin / Emby Server
```

核心约定：

- **UI 不感知服务器类型**：所有 Emby / Jellyfin 差异收敛在 `src/adapter/`，服务层只消费统一模型（`MediaLibrary`、`MediaDetail`、`PlaybackSource` 等）。
- **服务层不直接发请求**：`ServerAdapter` 产出 API 描述，统一由 `ApiClient` 执行，认证头、错误归一化、日志一处收口。
- **双播放引擎共用一条链路**：视频与音频共用 `PlaybackService` 的播放决策与 `ProgressService` 的进度上报。
- **原生改动可重放**：`android/` 为入库的 prebuild 产物，手写原生源与 PDF 资产由 `plugins/` 中的 config plugin 在 prebuild 时装配，CI 会断言重放后 `android/` 零 diff。

## 目录结构

```
.
├── src/
│   ├── adapter/          # ServerAdapter、Jellyfin/Emby 实现、DeviceProfileBuilder、统一模型
│   ├── infra/            # ApiClient、MMKV/SQLite、Token 存储、TLS、错误归一化、原生桥
│   ├── service/          # 业务服务（认证/浏览/详情/播放/进度/下载/音频/照片/图书）
│   ├── store/            # zustand 状态与持久化
│   ├── page/             # 页面（Onboarding / Tabs / 库 / 详情 / 播放器 / 设置等）
│   ├── component/        # 复用 UI 组件（海报卡、列表、弹层、迷你播放条等）
│   ├── constant/         # 路由、主题、库 Tab / 排序目录、播放等常量
│   └── util/             # 纯函数工具
├── modules/              # 本地 Expo 原生模块（解码能力探测 / 播放手势）
├── plugins/              # Expo config plugin（prebuild 装配原生源与 PDF 资产）
├── android/              # prebuild 产物（入库，勿手改插件驱动的文件）
├── assets/pdf/           # pdf.js 构建产物 + reader.html
├── app.config.ts         # Expo 应用配置
├── AGENTS.md             # 开发约束（编码前必读）
└── .rules/commit.md      # Git 提交规范
```

## 环境要求

- **Node.js 20+**（CI 使用 Node 20）
- **JDK 21**（构建必需：compileSdk 37 的 `core-for-system-modules.jar` 需要 JDK 21，JDK 17 实测失败）
- **Android SDK**（建议通过 Android Studio 安装 Build Tools / Platform Tools）与 **Android 8.0（API 26）及以上**设备或模拟器
- Windows / macOS / Linux 均可

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 生成原生工程（android/ 已入库，但配置变更后需重放；同时装配本地原生模块与 PDF 资产）
npx expo prebuild -p android

# 3. 构建并安装到已连接的设备 / 模拟器
npx expo run:android
```

注意事项：

- **不支持 Expo Go**：项目包含本地原生模块与自定义播放器，必须使用本地构建的开发版。
- 本地构建 JDK 21：Gradle 9 launcher 只认环境变量，CLI 构建需带 `JAVA_HOME=<本机 JDK 21 路径>` 前缀（本机为 `D:/Java/jdk-21.0.10`）；Android Studio 构建走 IDE 自身 JDK；仓库不含 pin，CI 不受影响。
- 修改 `app.config.ts` 或 `plugins/` 后需重新 prebuild；不要手改由插件生成的 `android/` 文件，否则 CI 的零漂移检查会失败。
- **模拟器连接服务器**：Android 模拟器内的 `localhost` 指向模拟器自身，宿主机服务请填 `http://10.0.2.2:8096/`；真机使用局域网 IP。
- 本项目本地联调环境为 Emby `RYM 4.10.2.0`（`http://localhost:8096/`，本地测试账号 `test / 123456`）。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run start` | 启动 Expo / Metro 开发服务器 |
| `npm run android` | 构建并安装 Android 应用（等同 `npx expo run:android`） |
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | TypeScript 类型检查（`tsc --noEmit`） |
| `npm run test` | Jest 单元测试 |
| `npx expo prebuild -p android` | 重放 `android/` 原生工程 |
| `cd android && ./gradlew assembleDebug` | 构建 debug APK |
| `cd android && ./gradlew assembleRelease` | 构建签名 release APK（需配置 keystore） |

## 质量门禁与 CI/CD

合并前必须通过四项检查：

```bash
npm run lint
npx tsc --noEmit
npx jest
cd android && ./gradlew assembleDebug
```

- **CI**（`.github/workflows/mobile-ci.yml`）：push `main` / PR 触发；执行 lint、tsc、jest、`expo prebuild` 零漂移校验与 Android debug 构建。
- **Release**（`.github/workflows/mobile-release.yml`）：推送 `v*` tag 触发；复跑质量门禁后，用仓库 Secrets 中的 keystore 构建签名 APK，并附加到 GitHub Release。
- 提交信息遵循 `.rules/commit.md`：`feat: ` / `fix: ` / `refactor: ` 等关键词格式（英文冒号后一个空格）。

## 已知边界

- 仅 Android；iOS 与 Android TV / TV 端未支持
- 不支持 DRM 内容；不提供服务端管理功能
- 离线下载仅支持可直连（无需转码）的视频条目；下载需 App 进程存活（支持断点续传），未实现系统级后台下载
- 投屏、音乐离线缓存、Live TV / EPG、漫画 / EPUB 等能力未纳入当前版本

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
