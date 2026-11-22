/**
 * TV 形态构建期常量（TV-m0 §4.6，TV 设计 §5）：后续共享层形态感知的唯一入口，
 * 禁止散落 Platform.isTV() 直调。
 */
import Constants from 'expo-constants';

/** TV 构建产物恒 true（tv/app.config.ts 的 extra.tv 注入）；mobile 构建恒 false */
export const IS_TV_BUILD = Constants.expoConfig?.extra?.tv === true;
