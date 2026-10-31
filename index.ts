import { registerRootComponent } from 'expo';
import TrackPlayer from '@rntp/player';

// M2 修正：M1 真实根组件在 src/App.tsx（启动时序/401 订阅/导航 gate），
// index 此前误指向模板残留 App.tsx（应用启动为空白模板屏），改指 src/App
import App from './src/App';
// M5（05 文档 §4.9）：通知栏/锁屏/耳机等远程控制在 @rntp/player v5 默认由原生处理
//（native handling），JS 侧不再需要 Remote 事件分发；registerPlaybackSession 须在
// 应用注册前调用一次（官方文档要求），会话内注册的播放事件监听器与 JS runtime
// 生命周期等长（后台/熄屏仍存活），承担上报接线（AudioReporting 五类事件）
import { audioService } from './src/service/AudioService';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// M5：注册播放会话（v5.9.2+ 官方推荐的播放逻辑挂载点，调用即执行）；
// AudioReporting 的事件订阅经 audioService.attachPlaybackSession 幂等挂载
TrackPlayer.registerPlaybackSession(() => audioService.attachPlaybackSession());
