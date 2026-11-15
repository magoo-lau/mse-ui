<template>
  <div class="page">
    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="left">
          <span class="toolbar-tip">定制本租户站点的登录页标题 / Logo / 背景 / 版权；保存后绑定域名（见下方）的登录页立即生效</span>
        </div>
        <el-button v-permission="'system:branding:update'" type="primary" icon="Check" :loading="saving" @click="doSave">保存</el-button>
      </div>

      <div class="branding-body">
        <el-form :model="form" label-width="100px" class="branding-form">
          <el-form-item label="站点标题">
            <el-input v-model="form.siteTitle" placeholder="登录页标题；留空 = 前端默认标题" maxlength="60" />
          </el-form-item>
          <el-form-item label="Logo 地址">
            <div class="asset-row">
              <el-input v-model="form.siteLogo" placeholder="直接上传，或粘贴 http(s)://… / data:image/…" />
              <el-upload :auto-upload="false" :show-file-list="false" accept=".png,.jpg,.jpeg,.webp,.gif,.svg,.ico"
                         :on-change="pick('logo')">
                <el-button :loading="uploading === 'logo'" icon="Upload">上传</el-button>
              </el-upload>
            </div>
          </el-form-item>
          <el-form-item label="背景图地址">
            <div class="asset-row">
              <el-input v-model="form.loginBackground" placeholder="直接上传，或粘贴 http(s)://…；留空 = 背景色" />
              <el-upload :auto-upload="false" :show-file-list="false" accept=".png,.jpg,.jpeg,.webp"
                         :on-change="pick('background')">
                <el-button :loading="uploading === 'background'" icon="Upload">上传</el-button>
              </el-upload>
            </div>
          </el-form-item>
          <el-form-item label="背景色">
            <el-input v-model="form.backgroundColor" placeholder="如 #0ba360 或 linear-gradient(135deg,#0ba360,#3cba92)" />
            <div class="gradient-presets">
              <span v-for="preset in GRADIENT_PRESETS" :key="preset.value" class="preset-chip"
                    :style="{ background: preset.value }" :title="preset.label" @click="form.backgroundColor = preset.value" />
            </div>
          </el-form-item>
          <el-form-item label="版权文案">
            <el-input v-model="form.copyright" placeholder="登录页底部文案；留空 = 不显示" maxlength="200" />
          </el-form-item>
        </el-form>

        <div class="preview-pane">
          <div class="preview-title">登录页预览</div>
          <div class="preview-stage" :style="previewStyle">
            <div class="preview-card">
              <img v-if="form.siteLogo" class="preview-logo" :src="resolveBrandingUrl(form.siteLogo)" alt="logo" />
              <div class="preview-site">{{ form.siteTitle || 'ai-mse' }}</div>
              <div class="preview-sub">登录</div>
            </div>
            <div v-if="form.copyright" class="preview-copyright">{{ form.copyright }}</div>
          </div>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="domain-card">
      <div class="table-toolbar">
        <div class="left">
          <span class="toolbar-tip">绑定本租户的站点域名：访客经该域名打开登录页即呈现本品牌，并免填租户编码（直接登录本租户）</span>
        </div>
        <div class="domain-add">
          <el-input v-model="newDomain" placeholder="完整主机名，如 demo.mse.local" style="width: 240px"
                    @keyup.enter="doBind" />
          <el-button v-permission="'system:branding:update'" type="primary" icon="Link" :loading="binding"
                     @click="doBind">绑定域名</el-button>
        </div>
      </div>
      <el-table :data="domains" size="small">
        <el-table-column prop="domain" label="域名" min-width="220" />
        <el-table-column label="绑定时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-button v-permission="'system:branding:update'" link type="danger" icon="Delete"
                       @click="doUnbind(row)">解绑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import request from '../../api/request'
import { resolveBrandingUrl } from '../../composables/useDomainBranding'

/** 常用渐变预设（点击回填背景色输入框） */
const GRADIENT_PRESETS = [
  { label: '默认紫蓝', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { label: '清新青绿', value: 'linear-gradient(135deg, #0ba360 0%, #3cba92 100%)' },
  { label: '深海蓝', value: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)' },
  { label: '暖阳橙', value: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
  { label: '静谧灰', value: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)' }
]

const form = reactive({
  siteTitle: '', siteLogo: '', loginBackground: '', backgroundColor: '', copyright: ''
})
const saving = ref(false)

// -------------------- 域名绑定（登录页按域名命中本租户品牌并免填租户编码） --------------------

interface DomainBinding {
  id: number | string
  domain: string
  createTime: string
}

const domains = ref<DomainBinding[]>([])
const newDomain = ref('')
const binding = ref(false)

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

async function loadDomains() {
  const data = await request.get('/system/tenant-branding/domain')
  domains.value = (data || []) as DomainBinding[]
}

async function doBind() {
  const domain = newDomain.value.trim()
  if (!domain) {
    ElMessage.warning('请输入要绑定的域名')
    return
  }
  binding.value = true
  try {
    await request.post('/system/tenant-branding/domain', { domain })
    ElMessage.success(`域名 ${domain} 已绑定，访问该域名的登录页立即生效`)
    newDomain.value = ''
    await loadDomains()
  } finally {
    binding.value = false
  }
}

async function doUnbind(row: DomainBinding) {
  await ElMessageBox.confirm(`解绑后访问 ${row.domain} 的登录页将不再呈现本品牌，确认解绑？`, '解绑域名', {
    type: 'warning',
    confirmButtonText: '解绑',
    cancelButtonText: '取消'
  })
  await request.delete(`/system/tenant-branding/domain/${row.id}`)
  ElMessage.success('已解绑')
  await loadDomains()
}

const previewStyle = computed(() => {
  if (form.loginBackground) {
    return {
      backgroundImage: `url("${resolveBrandingUrl(form.loginBackground)}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundColor: form.backgroundColor || '#f5f7fa'
    }
  }
  return { background: form.backgroundColor || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }
})

// -------------------- 品牌素材上传 --------------------

const uploading = ref<'' | 'logo' | 'background'>('')

/** el-upload 手动接文件：立即上传到后端素材接口，回填返回的站内地址（保存配置后才落到品牌行） */
function pick(kind: 'logo' | 'background') {
  return async (file: UploadFile) => {
    if (file.status !== 'ready') return
    const raw = file.raw
    if (!raw) return
    const limitMb = kind === 'logo' ? 2 : 8
    if (raw.size > limitMb * 1024 * 1024) {
      ElMessage.error(`${kind === 'logo' ? 'Logo' : '背景图'}不能超过 ${limitMb}MB`)
      return
    }
    uploading.value = kind
    try {
      const body = new FormData()
      body.append('file', raw)
      body.append('kind', kind)
      const url = await request.post('/system/tenant-branding/asset', body)
      if (kind === 'logo') form.siteLogo = url
      else form.loginBackground = url
      ElMessage.success('已上传，保存配置后生效')
    } finally {
      uploading.value = ''
    }
  }
}

async function load() {
  const data = await request.get('/system/tenant-branding')
  Object.assign(form, {
    siteTitle: data.siteTitle ?? '',
    siteLogo: data.siteLogo ?? '',
    loginBackground: data.loginBackground ?? '',
    backgroundColor: data.backgroundColor ?? '',
    copyright: data.copyright ?? ''
  })
}

async function doSave() {
  saving.value = true
  try {
    await request.put('/system/tenant-branding', { ...form })
    ElMessage.success('品牌配置已保存')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  load()
  loadDomains()
})
</script>

<style scoped>
.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.toolbar-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.domain-card {
  margin-top: 16px;
}
.domain-add {
  display: flex;
  gap: 8px;
  align-items: center;
}
.branding-body {
  display: flex;
  gap: 16px;
}
.branding-form {
  flex: 1;
  min-width: 0;
  max-width: 620px;
}
.asset-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.asset-row .el-input {
  flex: 1;
}
.preview-pane {
  width: 260px;
  flex-shrink: 0;
}
.preview-title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.preview-stage {
  position: relative;
  height: 340px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.preview-card {
  width: 160px;
  padding: 18px 12px;
  background: var(--el-bg-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  text-align: center;
}
.preview-logo {
  height: 28px;
  max-width: 120px;
  object-fit: contain;
  margin-bottom: 6px;
}
.preview-site {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.preview-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.preview-copyright {
  position: absolute;
  bottom: 6px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
.gradient-presets {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.preset-chip {
  width: 40px;
  height: 18px;
  border-radius: 9px;
  border: 1px solid var(--el-border-color);
  cursor: pointer;
}
</style>
