/**
 * TV 播放器常量（TV-m3 §4.2/§4.3）：遥控 seek 步长与 HUD 停留时长。
 * 手机播放域常量在 @/constant/playback（手势灵敏度等 TV 不消费）；TV 专属交互参数收口于此。
 */

/** 遥控单击 seek 步长（毫秒，±10s；长按连发为增强项不在首版，TV-m3-S3） */
export const TV_SEEK_STEP_MS = 10000;

/** seek HUD 延迟隐藏时长（毫秒，按键结束后气泡停留；手机 GestureHud 同口径） */
export const TV_HUD_HIDE_DELAY_MS = 600;