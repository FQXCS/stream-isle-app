/**
 * TV 专属路由名常量（TV-m1 §4.1）：与手机同值者直接引用 @/constant/navigation 的 ROUTES
 * （OnboardingConnect / OnboardingLogin / Library / Item 等），TV 新增路由名落本文件。
 */
export const TV_ROUTES = {
  /** 壳路由（侧栏 + 内容区单路由，tab 切换不压栈，TV-m1-S3） */
  SHELL: 'Shell',
} as const;
