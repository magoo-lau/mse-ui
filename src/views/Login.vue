<template>
  <div class="login-wrap" :style="backgroundStyle">
    <el-card class="login-card">
      <div v-if="logo" class="login-logo">
        <img :src="logo" alt="logo" />
      </div>
      <h2 style="text-align: center; margin-bottom: 8px">{{ title }}</h2>
      <h3 style="text-align: center; margin: 0 0 16px; font-weight: normal; color: var(--el-text-color-secondary)">租户登录</h3>
      <el-alert
        v-if="boundTenantName"
        :title="`欢迎访问：${boundTenantName}`"
        type="success"
        :closable="false"
        style="margin-bottom: 16px"
      />

      <!-- 步骤一：账号密码（风控要求时附图形验证码）；域名命中租户时编码已锁定，直接隐藏 -->
      <template v-if="step === 'form'">
        <el-form :model="tenantForm" label-width="80px" @keyup.enter="doLogin">
          <el-form-item v-if="!domainLocked" label="租户编码">
            <el-input v-model="tenantForm.tenantCode" placeholder="如 demo" />
          </el-form-item>
          <el-form-item label="用户名">
            <el-input v-model="tenantForm.username" placeholder="admin / user" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="tenantForm.password" type="password" show-password placeholder="tenant123 / user123" />
          </el-form-item>
          <el-form-item v-if="captcha.required" label="验证码">
            <div class="captcha-row">
              <el-input v-model="tenantForm.captchaCode" placeholder="图中字符" maxlength="6" />
              <img v-if="captcha.image" :src="captcha.image" class="captcha-img" title="看不清？点击刷新" @click="refreshCaptcha" />
            </div>
          </el-form-item>
        </el-form>
        <el-button type="primary" style="width: 100%" :loading="loading" @click="doLogin">登 录</el-button>
      </template>

      <!-- 步骤二：双因子验证（required 模式未绑定时先扫码绑定） -->
      <template v-else>
        <el-alert
          v-if="twoFactor.enroll"
          title="首次登录需绑定验证器：使用 Google Authenticator 等验证器 App 扫码，输入动态码完成绑定"
          type="info"
          :closable="false"
          style="margin-bottom: 12px"
        />
        <div v-else class="totp-tip">请输入验证器 App 中的 6 位动态码</div>
        <div v-if="twoFactor.enrollment" class="totp-enroll">
          <img :src="twoFactor.enrollment.qrImage" class="totp-qr" alt="TOTP 绑定二维码" />
          <div class="totp-secret">手动输入密钥：{{ twoFactor.enrollment.secret }}</div>
        </div>
        <el-form label-width="80px" @keyup.enter="doTwoFactor">
          <el-form-item :label="emailChannel ? '邮箱验证码' : '动态码'">
            <el-input v-model="twoFactor.code" maxlength="6" :placeholder="emailChannel ? '邮箱收到的 6 位验证码' : '6 位动态码'" />
          </el-form-item>
        </el-form>
        <el-button type="primary" style="width: 100%" :loading="loading" @click="doTwoFactor">验 证 并 登 录</el-button>
        <div v-if="!twoFactor.enroll && twoFactor.emailAvailable" class="totp-alt">
          <el-button link type="primary" :loading="sendingEmail" :disabled="emailCountdown > 0" @click="doSendEmailCode">
            {{ emailCountdown > 0
              ? `验证码已发送，${emailCountdown}s 后可重发`
              : `使用邮箱验证码${twoFactor.maskedEmail ? `（${twoFactor.maskedEmail}）` : ''}` }}
          </el-button>
        </div>
        <div class="totp-back">
          <el-button link @click="backToForm">返回重新登录</el-button>
        </div>
      </template>
    </el-card>
    <div v-if="copyright" class="login-copyright">{{ copyright }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import request from '../api/request'
import { useUserStore } from '../stores/user'
import { useDomainBranding } from '../composables/useDomainBranding'
import {
  newCaptcha, twoFactorChallenge, sendTwoFactorEmailCode, twoFactorLogin,
  type CaptchaChallenge, type TwoFactorChallenge
} from '../api/auth'

const router = useRouter()
const userStore = useUserStore()
const loading = ref(false)
const tenantForm = reactive({ tenantCode: 'demo', username: 'admin', password: 'tenant123', captchaCode: '' })

const { title, logo, copyright, backgroundStyle, loadBranding } = useDomainBranding()

/** 当前访问主机名：登录时随请求体上报，后端据此强制校验域名-租户绑定 */
const hostname = window.location.hostname
/** 域名命中绑定租户后隐藏编码输入（编码已随域名确定） */
const domainLocked = ref(false)
const boundTenantName = ref('')

/** 登录两段式：form=账号密码（+验证码）；twofactor=双因子验证 */
const step = ref<'form' | 'twofactor'>('form')
/** 图形验证码挑战（risk 模式失败计数达标后自动浮出） */
const captcha = reactive<CaptchaChallenge>({ required: false, captchaId: null, image: null })
/** 双因子阶段状态（tempToken 5 分钟有效，限 5 次尝试） */
const twoFactor = reactive<{
  tempToken: string
  enroll: boolean
  emailAvailable: boolean
  maskedEmail: string | null
  enrollment: { secret: string; otpauthUri: string; qrImage: string } | null
  code: string
}>({ tempToken: '', enroll: false, emailAvailable: false, maskedEmail: null, enrollment: null, code: '' })
const emailChannel = ref(false)
const sendingEmail = ref(false)
const emailCountdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

async function refreshCaptcha() {
  try {
    const data = await newCaptcha({
      tenantCode: tenantForm.tenantCode || undefined,
      username: tenantForm.username || undefined
    }) as CaptchaChallenge
    captcha.required = data.required
    captcha.captchaId = data.captchaId
    captcha.image = data.image
  } catch {
    // 预检失败不阻断登录：主链路还会强制复核
  }
}

onMounted(async () => {
  refreshCaptcha()
  // 域名解析与品牌一次取回：命中绑定租户即锁定（隐藏租户编码），否则保持手动输入
  try {
    const resolved = await loadBranding()
    if (resolved?.tenantId) {
      tenantForm.tenantCode = resolved.tenantCode || tenantForm.tenantCode
      boundTenantName.value = resolved.tenantName || ''
      domainLocked.value = true
    }
  } catch {
    // 解析失败（后端未升级/网络异常）回退为手动输入，不阻断登录
  }
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

async function doLogin() {
  if (loading.value) return
  loading.value = true
  try {
    const data = await request.post('/auth/login', {
      tenantCode: tenantForm.tenantCode,
      username: tenantForm.username,
      password: tenantForm.password,
      originDomain: hostname,
      captchaId: captcha.captchaId || undefined,
      captchaCode: tenantForm.captchaCode || undefined
    })
    if (data.twoFactorRequired) {
      await enterTwoFactor(data.tempToken, data.totpEnroll)
    } else {
      loginSuccess(data.result)
    }
  } catch {
    // 登录失败：风控失败计数已在服务端累加，重新预检（risk 模式下验证码自动浮出）并换新验证码
    tenantForm.captchaCode = ''
    await refreshCaptcha()
  } finally {
    loading.value = false
  }
}

async function enterTwoFactor(tempToken: string, enroll: boolean) {
  twoFactor.tempToken = tempToken
  twoFactor.enroll = enroll
  twoFactor.code = ''
  emailChannel.value = false
  twoFactor.enrollment = null
  const challenge = await twoFactorChallenge(tempToken) as TwoFactorChallenge
  twoFactor.enrollment = challenge.enrollment
  twoFactor.emailAvailable = challenge.emailAvailable
  twoFactor.maskedEmail = challenge.maskedEmail
  step.value = 'twofactor'
}

async function doSendEmailCode() {
  if (sendingEmail.value) return
  sendingEmail.value = true
  try {
    await sendTwoFactorEmailCode(twoFactor.tempToken)
    emailChannel.value = true
    twoFactor.code = ''
    emailCountdown.value = 60
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = setInterval(() => {
      emailCountdown.value -= 1
      if (emailCountdown.value <= 0 && countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
    }, 1000)
    ElMessage.success(`验证码已发送至 ${twoFactor.maskedEmail || '绑定邮箱'}`)
  } finally {
    sendingEmail.value = false
  }
}

async function doTwoFactor() {
  if (!twoFactor.code) {
    ElMessage.warning(emailChannel ? '请输入邮箱验证码' : '请输入动态码')
    return
  }
  if (loading.value) return
  loading.value = true
  try {
    const data = await twoFactorLogin({
      tempToken: twoFactor.tempToken,
      code: twoFactor.code,
      channel: emailChannel.value ? 'email' : 'totp'
    })
    loginSuccess(data.result)
  } catch {
    // 验证失败保留输入便于重试；超限后端作废临时凭证，require 会提示重新登录
  } finally {
    loading.value = false
  }
}

function loginSuccess(result: { tokenValue: string; tenantId: number | string; nickname: string; platform: boolean }) {
  userStore.setLogin(result)
  ElMessage.success(`欢迎，${result.nickname}`)
  router.push('/')
}

function backToForm() {
  step.value = 'form'
  twoFactor.code = ''
  refreshCaptcha()
}
</script>

<style scoped>
.login-wrap {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.login-card {
  width: 400px;
}
.login-logo {
  text-align: center;
  margin-bottom: 12px;
}
.login-logo img {
  height: 48px;
  max-width: 240px;
  object-fit: contain;
}
.captcha-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.captcha-img {
  height: 32px;
  cursor: pointer;
  border-radius: 4px;
  border: 1px solid var(--el-border-color);
}
.totp-tip {
  text-align: center;
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
}
.totp-enroll {
  text-align: center;
  margin-bottom: 12px;
}
.totp-qr {
  width: 168px;
  height: 168px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
}
.totp-secret {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.totp-alt {
  margin-top: 8px;
  text-align: center;
}
.totp-back {
  margin-top: 8px;
  text-align: center;
}
.login-copyright {
  position: absolute;
  bottom: 16px;
  left: 0;
  right: 0;
  text-align: center;
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
</style>
