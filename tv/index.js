/**
 * TV 工程入口（TV-m0 §4.6）：registerRootComponent 挂 TV 根组件。
 * 与手机 index.ts 的差异：无 @rntp/player 注册（首版 TV 无音乐，TV 设计 §3.4 不带清单）。
 */
import { registerRootComponent } from 'expo';

import App from './src/App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);
