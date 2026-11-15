<template>
  <el-dialog v-model="visible" title="双因子认证" width="420px" @closed="resetState">
    <div v-loading="loading" style="min-height: 120px">
      <!-- 未绑定：绑定流程（生成二维码 → 输动态码确认） -->
      <template v-if="!status.bound">
        <template v-if="!setup">
          <el-empty description="尚未绑定双因子验证器" :image-size="72">
            <template #description>
              <p style="margin: 0">绑定后登录需输入验证器动态码，可有效防止密码泄露导致的账号盗用</p>
            </template>
            <el-button type="primary" @click="doSetup">生成绑定二维码</el-button>
          </el-empty>
        </template>
        <template v-else>
          <el-alert
            title="使用 Google Authenticator / 微软验证器等 App 扫码，或手动输入密钥，然后输入动态码确认"
            type="info"
            :closable="false"
            style="margin-bottom: 12px"
          />
          <div class="qr-wrap">
            <img :src="setup.qrImage" class="qr" alt="TOTP 绑定二维码" />
          </div>
          <div class="secret">手动输入密钥：{{ setup.secret }}</div>
          <el-form label-width="80px" style="margin-top: 8px" @submit.prevent>
            <el-form-item label="动态码">
              <el-input v-model="code" maxlength="6" placeholder="App 显示的 6 位动态码" @keyup.enter="doEnable" />
            </el-form-item>
          </el-form>
        </template>
      </template>
      <!-- 已绑定：展示状态 + 解绑 -->
      <template v-else>
        <el-result icon="success" title="已绑定双因子验证器" sub-title="登录时需输入验证器动态码（丢失手机可联系管理员重置）" style="padding: 8px 0" />
        <el-form label-width="80px" @submit.prevent>
          <el-form-item label="动态码">
            <el-input v-model="code" maxlength="6" placeholder="输入当前动态码以解除绑定" @keyup.enter="doDisable" />
          </el-form-item>
        </el-form>
      </template>
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button v-if="!status.bound && !setup" type="primary" :loading="loading" @click="doSetup">生成绑定二维码</el-button>
      <el-button v-if="!status.bound && setup" type="primary" :loading="loading" @click="doEnable">确认绑定</el-button>
      <el-button v-if="status.bound" type="danger" :loading="loading" @click="doDisable">解除绑定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { totpStatus, totpSetup, totpEnable, totpDisable, type TotpEnrollment } from '../api/auth'

/** 双端端点在 api/auth 按构建侧别固定（与改密弹窗同款约定） */
const visible = defineModel<boolean>({ default: false })

const loading = ref(false)
const status = ref<{ bound: boolean }>({ bound: false })
const setup = ref<TotpEnrollment | null>(null)
const code = ref('')

watch(visible, (value) => {
  if (value) load()
})

function resetState() {
  setup.value = null
  code.value = ''
}

async function load() {
  loading.value = true
  resetState()
  try {
    status.value = await totpStatus()
  } catch {
    status.value = { bound: false }
  } finally {
    loading.value = false
  }
}

/** 生成绑定挑战：密钥仅在服务端暂存 10 分钟，确认绑定（验码通过）才落库 */
async function doSetup() {
  loading.value = true
  try {
    setup.value = await totpSetup()
  } finally {
    loading.value = false
  }
}

async function doEnable() {
  if (!code.value.trim()) {
    ElMessage.warning('请输入动态码')
    return
  }
  loading.value = true
  try {
    await totpEnable(code.value.trim())
    ElMessage.success('绑定成功，下次登录需输入验证器动态码')
    visible.value = false
  } finally {
    loading.value = false
  }
}

async function doDisable() {
  if (!code.value.trim()) {
    ElMessage.warning('请输入当前动态码以解除绑定')
    return
  }
  loading.value = true
  try {
    await totpDisable(code.value.trim())
    ElMessage.success('已解除绑定')
    visible.value = false
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.qr-wrap {
  text-align: center;
}
.qr {
  width: 168px;
  height: 168px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
}
.secret {
  margin-top: 6px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
</style>
