import request from './request'
import { IS_PLATFORM } from '../config/side'

/** 登录成功态（/auth/login 两段式的最终产物；字段与后端 AuthController.LoginResult 对应） */
export interface LoginResult {
  tokenName: string
  tokenValue: string
  tenantId: number | string
  userId: number | string
  nickname: string
  platform: boolean
}

/** 登录响应（两段式）：twoFactorRequired=true 时持有 tempToken 走 /auth/login/2fa */
export interface LoginResponse {
  twoFactorRequired: boolean
  totpEnroll: boolean
  tempToken: string | null
  result: LoginResult | null
}

/** 图形验证码挑战（required=false 时登录页隐藏验证码行） */
export interface CaptchaChallenge {
  required: boolean
  captchaId: string | null
  image: string | null
}

/** TOTP 绑定挑战（二维码由后端渲染 base64 data URL，前端零依赖） */
export interface TotpEnrollment {
  secret: string
  otpauthUri: string
  qrImage: string
}

/** 双因子阶段挑战：enroll=true 附绑定二维码；否则附邮箱通道可用性 */
export interface TwoFactorChallenge {
  enroll: boolean
  enrollment: TotpEnrollment | null
  emailAvailable: boolean
  maskedEmail: string | null
}

/** 登录安全设置（专属配置页表单数据；GET 为有效值合并结果） */
export interface LoginSecurityConfig {
  captchaMode: 'none' | 'risk' | 'always'
  captchaUserFailThreshold: number
  captchaIpFailThreshold: number
  totpMode: 'off' | 'optional' | 'required'
  emailOtp: boolean
  multiDevice: boolean
  sameDeviceExclusive: boolean
  /** SMTP 是否就绪（false 时前端禁用邮箱通道开关并提示） */
  mailAvailable: boolean
  /** 平台端视角（隐藏「恢复平台默认」） */
  platformManaged: boolean
  /** 租户端：本租户已覆盖的参数键 */
  overriddenKeys: string[]
}

// -------------------- 登录链路（公开接口） --------------------

export const newCaptcha = (params: { tenantId?: number; tenantCode?: string; username?: string }) =>
  request.get('/auth/captcha/new', { params, skipErrorToast: true })

export const twoFactorChallenge = (tempToken: string) =>
  request.get('/auth/2fa/challenge', { params: { tempToken } })

export const sendTwoFactorEmailCode = (tempToken: string) =>
  request.post('/auth/2fa/email-code', { tempToken })

export const twoFactorLogin = (data: { tempToken: string; code: string; channel?: 'totp' | 'email' }) =>
  request.post('/auth/login/2fa', data)

// -------------------- TOTP 个人绑定（登录态；端点按构建侧别固定，与改密弹窗同款约定） --------------------

const PROFILE_TOTP_BASE = IS_PLATFORM ? '/system/profile/platform/totp' : '/system/profile/totp'

export const totpStatus = () => request.get(PROFILE_TOTP_BASE, { skipErrorToast: true })
export const totpSetup = () => request.post(`${PROFILE_TOTP_BASE}/setup`)
export const totpEnable = (code: string) => request.post(`${PROFILE_TOTP_BASE}/enable`, { code })
export const totpDisable = (code: string) => request.post(`${PROFILE_TOTP_BASE}/disable`, { code })

// -------------------- 登录安全设置（专属配置页；双端 apiBase 切换与参数设置页同款约定） --------------------

const LOGIN_SECURITY_BASE = IS_PLATFORM ? '/system/login-security/platform/config' : '/system/login-security/config'

export const loginSecurityConfig = () => request.get(LOGIN_SECURITY_BASE, { skipErrorToast: true })
export const saveLoginSecurityConfig = (data: Partial<LoginSecurityConfig>) =>
  request.put(LOGIN_SECURITY_BASE, data)
/** 仅租户端调用：删除本租户覆盖行，回退平台默认 */
export const resetLoginSecurityOverride = () => request.delete(LOGIN_SECURITY_BASE)

// -------------------- IM 工作台一次性 code 免登（租户端，/im/sso/exchange 在网关白名单） --------------------

/** IM 工作台 SSO 兑换结果（字段与后端 ImSsoCodeService.LoginVO 对齐，userStore.setLogin 直接消费） */
export interface SsoLoginResult {
  tokenName: string
  tokenValue: string
  tenantId: number | string
  userId: number | string
  nickname: string
  platform: boolean
}

/** 端点路径走构建配置，缺省 /im/sso/exchange（独立部署网关前缀不同时可覆盖） */
export const exchangeSsoCode = (code: string) =>
  request.post<SsoLoginResult>(import.meta.env.VITE_SSO_EXCHANGE_URL || '/im/sso/exchange', { code }, { skipErrorToast: true })
