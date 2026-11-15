/**
 * 构建期侧别常量：同一工程按 VITE_SIDE 构建出「租户端」「平台运营端」两个部署物
 * （.env.tenant / .env.platform，脚本见 package.json）。运行时行为只依赖本文件，
 * 不再读取登录响应里的 platform 标志做本地跳转/存储决策。
 */
export const SIDE: 'tenant' | 'platform' = import.meta.env.VITE_SIDE === 'platform' ? 'platform' : 'tenant'

export const IS_PLATFORM = SIDE === 'platform'

/** 本侧登录页路径（沿用历史 URL：租户 /login、平台 /platform/login） */
export const LOGIN_PATH = IS_PLATFORM ? '/platform/login' : '/login'

/** 页面标题（index.html 经 %VITE_APP_TITLE% 注入，此处用于布局品牌区） */
export const APP_TITLE: string = import.meta.env.VITE_APP_TITLE || 'ai-mse'

/**
 * 本地存储 key：两端 key 不同（租户保持历史 mse-* 不变，平台加 -platform 前缀），
 * 同一浏览器即可同时登录两端而互不覆盖。
 */
export function storageKey(name: 'token' | 'user' | 'tags'): string {
  return IS_PLATFORM ? `mse-platform-${name}` : `mse-${name}`
}
