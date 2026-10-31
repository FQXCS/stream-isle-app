# AGENTS.md

## 项目概览

Stream Isle Mobile：**仅 Android** 的 Emby/Jellyfin 通用客户端（对标 VidHub，差异化补齐音乐与照片；兼容 Jellyfin Server 10.8+ / Emby Server 4.7+）。

- **当前仓库处于纯文档阶段**：尚无任何代码。规划代码位于根目录 `mobile/` 子项目（与服务端、`ui/` 同级，独立演进、独立构建）。
- 产品与技术唯一权威定义：[docs/00-设计文档.md](docs/00-设计文档.md)（v0.2）；里程碑开发文档 `docs/01-M1-骨架与连接浏览.md` ~ `docs/06-M6-P1与发布.md`。

## 文档体系（动手前必读）

- `docs/00-设计文档.md` 是**唯一权威输入**：里程碑文档统一以「见设计文档 §x.x」引用它；修改设计文档后必须回查六份里程碑文档的对应引用。
- 六份里程碑文档按 M1→M6 顺序开发，结构统一为 8 节：目标与验收 / 范围 / 前置与依赖 / 技术方案 / 实现步骤 / 测试与验收 / 风险与对策 / 开放问题。
- 里程碑间存在**跨文档漂移登记表**（如 04 §4.1）与各文档 §8「开放问题」：后续文档会对早期文档宣布"终态声明"并登记回改项。引用任何里程碑结论前先核对是否已被后续文档修订，**不要各引旧版**（01↔04 已多次因此产生分歧）。
- 开放问题（StreamIsleAdapter 取舍、iOS 排期、WebSocket 推送、漫画/电子书等）集中在设计文档 §14 与各文档开放问题章节，**用户拍板前不要当既定决策写进代码或文档**。

## 技术栈与架构约束（编码时按此执行）

- 框架：**React Native 0.76+（TypeScript strict）+ Expo prebuild 裸工作流**；`android/` 为 prebuild 产物且**入库**（.gitignore 只忽略其构建产物），真机调试需 dev client（Expo Go 装不了原生模块）。
- 播放器双引擎：视频 react-native-video 6.x（ExoPlayer）、音频 react-native-track-player；两引擎共用 PlaybackService 播放决策与 ProgressService 进度上报，不重复造轮子。
- 基建选型：zustand + MMKV（persist）、axios（拦截器统一认证头/错误归一化/证书开关）、expo-secure-store（Token）、expo-image + @shopify/flash-list、reanimated + gesture-handler。
- **UI 不感知服务器类型**：所有 Emby/Jellyfin 差异压进 `src/adapter/` 的 ServerAdapter（JellyfinAdapter / EmbyAdapter，预留 StreamIsleAdapter 第三实现位）；服务层不直接发请求，Adapter 产出的 API 描述统一由 ApiClient 执行。
- MVP 边界（设计文档 §1.2，明确不做）：DRM、iOS / TV 端、服务端管理功能、漫画/电子书。
- 分层目录（设计文档 §4.1）：`mobile/src/` 按 `adapter / infra / service / store / page / component / constant / util` 组织；里程碑文档统一放根目录 `docs/`（设计文档 §4.1 写的 `mobile/docs/` 与现状不符，以现状为准）。

## 常用命令（mobile/ 落地后生效；当前仓库无 package.json）

```bash
npm run lint                    # 质量门禁 1/3
npx tsc --noEmit                # 质量门禁 2/3
npx jest                        # 质量门禁 3/3（adapter 差异 / DeviceProfileBuilder / 错误归一化等单测）
npx expo prebuild -p android    # 产出 android/（入库）
npx expo run:android            # 真机构建安装（Android 8+ / minSdk 26）
```

- CI（设计文档 §12）：lint + test + Android debug 构建；三件套全绿是每个里程碑验收第 1 条。
- 联调环境：Docker 起 `jellyfin/jellyfin:10.10` 与 `emby/embyserver:4.9` 各一，灌同一批测试媒体（含 HEVC 10bit 转码片 / 多字幕多音轨片 / flac+mp3 音乐专辑 / 含子目录照片库）。
- 分支习惯：每个里程碑一个 `feature/m<N>-xxx` 分支（设计文档 §13，如 M1 用 `feature/m1-skeleton`）。

## 专项规则（触发式加载）

执行以下操作时，**必须先读取对应规则文件，再动手**：

| 触发场景 | 规则文件 | 核心约束 |
|----------|----------|----------|
| 执行 `git commit` | [.rules/commit.md](.rules/commit.md) | 关键词格式 `feat:` / `fix:` / `refactor:` |
