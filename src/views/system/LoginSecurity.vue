<template>
  <div class="page login-security-page">
    <el-card shadow="never" v-loading="loading">
      <div class="table-toolbar">
        <div class="left">
          <span class="page-desc">登录链路安全策略，保存后即时生效；底层为 sys_config 内置参数，两端独立：租户保存即写本租户行，未覆盖项回退本库默认</span>
          <el-tag v-if="!form.platformManaged && form.overriddenKeys.length" type="warning" size="small" style="margin-left: 8px">
            本租户已自定义 {{ form.overriddenKeys.length }} 项
          </el-tag>
        </div>
        <div class="right">
          <el-button v-if="!form.platformManaged" v-permission="savePerm" :disabled="!form.overriddenKeys.length" @click="doResetOverride">
            恢复平台默认
          </el-button>
          <el-button v-permission="savePerm" type="primary" icon="Check" :loading="saving" @click="doSave">保 存</el-button>
        </div>
      </div>

      <el-form :model="form" label-width="190px" class="security-form" @submit.prevent>
        <el-divider content-position="left">图形验证码</el-divider>
        <el-form-item label="验证码模式">
          <el-radio-group v-model="form.captchaMode">
            <el-radio-button value="none">关闭</el-radio-button>
            <el-radio-button value="risk">风控触发</el-radio-button>
            <el-radio-button value="always">每次登录</el-radio-button>
          </el-radio-group>
          <div class="hint">风控触发 = 平时无感，同账号/同 IP 连续登录失败达阈值后自动要求验证码（失败计数 10 分钟滑动窗口）</div>
        </el-form-item>
        <template v-if="form.captchaMode === 'risk'">
          <el-form-item label="同账号失败阈值">
            <el-input-number v-model="form.captchaUserFailThreshold" :min="1" :max="100" />
            <span class="hint inline">次</span>
          </el-form-item>
          <el-form-item label="同 IP 失败阈值">
            <el-input-number v-model="form.captchaIpFailThreshold" :min="1" :max="100" />
            <span class="hint inline">次</span>
          </el-form-item>
        </template>

        <el-divider content-position="left">双因子认证（2FA）</el-divider>
        <el-form-item label="双因子模式">
          <el-radio-group v-model="form.totpMode">
            <el-radio-button value="off">关闭</el-radio-button>
            <el-radio-button value="optional">自愿绑定</el-radio-button>
            <el-radio-button value="required">强制全员</el-radio-button>
          </el-radio-group>
          <div class="hint">
            关闭 = 登录不校验动态码（头像菜单的「双因子认证」绑定入口一并隐藏）；自愿绑定 = 用户在「头像菜单 → 双因子认证」绑定验证器后，登录需输入动态码；强制全员 = 全部用户登录时先扫码绑定再进入（未绑定邮箱的用户请先维护邮箱）
          </div>
        </el-form-item>
        <el-form-item label="邮箱验证码降级通道">
          <el-switch v-model="form.emailOtp" :disabled="!form.mailAvailable" />
          <span class="hint inline">{{ form.mailAvailable
            ? '已绑定验证器的用户丢失手机时，可改用邮箱验证码完成登录'
            : 'SMTP 未就绪：需部署侧开启 mse.mail.enabled 并配置 spring.mail.*，且用户已填邮箱' }}</span>
        </el-form-item>

        <el-divider content-position="left">登录策略</el-divider>
        <el-form-item label="允许多端登录">
          <el-switch v-model="form.multiDevice" />
          <span class="hint inline">关闭 = 单点登录：登录时顶掉该账号全部旧会话</span>
        </el-form-item>
        <el-form-item label="同端互斥">
          <el-switch v-model="form.sameDeviceExclusive" :disabled="!form.multiDevice" />
          <span class="hint inline">允许多端并存时，登录仅顶掉同设备类型的旧会话</span>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { IS_PLATFORM } from '../../config/side'
import {
  loginSecurityConfig, saveLoginSecurityConfig, resetLoginSecurityOverride,
  type LoginSecurityConfig
} from '../../api/auth'

/** 双端 apiBase 切换（平台端管平台库自身参数，租户端管本租户覆盖），与参数设置页同款约定 */
const savePerm = IS_PLATFORM ? 'system:loginsecurity:platform-update' : 'system:loginsecurity:update'

const loading = ref(false)
const saving = ref(false)
const form = reactive<LoginSecurityConfig>({
  captchaMode: 'risk',
  captchaUserFailThreshold: 3,
  captchaIpFailThreshold: 10,
  totpMode: 'off',
  emailOtp: false,
  multiDevice: true,
  sameDeviceExclusive: false,
  mailAvailable: false,
  platformManaged: IS_PLATFORM,
  overriddenKeys: []
})

onMounted(load)

async function load() {
  loading.value = true
  try {
    const data = await loginSecurityConfig() as LoginSecurityConfig
    Object.assign(form, data)
  } catch {
    // 读取失败保持代码默认值，避免页面白屏
  } finally {
    loading.value = false
  }
}

async function doSave() {
  saving.value = true
  try {
    await saveLoginSecurityConfig({
      captchaMode: form.captchaMode,
      captchaUserFailThreshold: form.captchaUserFailThreshold,
      captchaIpFailThreshold: form.captchaIpFailThreshold,
      totpMode: form.totpMode,
      emailOtp: form.emailOtp,
      multiDevice: form.multiDevice,
      sameDeviceExclusive: form.sameDeviceExclusive
    })
    ElMessage.success('已保存，登录安全策略即时生效')
    await load()
  } finally {
    saving.value = false
  }
}

/** 仅租户端：删除本租户覆盖行，全部回退平台默认 */
async function doResetOverride() {
  await ElMessageBox.confirm('确定恢复平台默认？本租户对登录安全参数的全部自定义将被清除。', '恢复平台默认', { type: 'warning' })
  await resetLoginSecurityOverride()
  ElMessage.success('已恢复平台默认')
  await load()
}
</script>

<style scoped>
.security-form {
  max-width: 720px;
  padding-top: 8px;
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.5;
  white-space: normal;
}
.hint.inline {
  margin: 0 0 0 8px;
}
.right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
