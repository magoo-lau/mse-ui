<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="域名">
          <el-input v-model="query.domain" placeholder="如 demo.example.com" clearable style="width: 220px" @keyup.enter="load" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 120px">
            <el-option label="启用" :value="0" />
            <el-option label="停用" :value="1" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="load">搜索</el-button>
          <el-button icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="left">
          <el-button v-permission="'tenant:domain:create'" type="primary" icon="Plus" @click="openCreate">新增配置</el-button>
          <span class="toolbar-tip">定制平台自有域名（如管理端 admin.mse.local）的登录页标题 / Logo / 背景 / 版权；租户站点域名由租户在「品牌个性化」自助绑定</span>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="rows">
        <el-table-column prop="id" label="编号" width="190" />
        <el-table-column prop="domain" label="域名" min-width="160" />
        <el-table-column label="标题" min-width="140">
          <template #default="{ row }">{{ row.siteTitle || '-' }}</template>
        </el-table-column>
        <el-table-column label="Logo" width="90" align="center">
          <template #default="{ row }">
            <el-image v-if="row.siteLogo" :src="resolveBrandingUrl(row.siteLogo)" fit="contain" style="height: 28px; width: 64px" :preview-src-list="[resolveBrandingUrl(row.siteLogo)]" hide-on-click-modal>
              <template #error><span class="logo-broken">失效</span></template>
            </el-image>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="背景预览" width="90" align="center">
          <template #default="{ row }">
            <el-tooltip :content="row.loginBackground || row.backgroundColor || '默认'" placement="top">
              <div class="bg-swatch" :style="swatchStyle(row)" />
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="版权文案" min-width="180">
          <template #default="{ row }">{{ row.copyright || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 0 ? 'success' : 'danger'" size="small">{{ row.status === 0 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatTime(row.updateTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'tenant:domain:update'" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
            <el-button v-permission="'tenant:domain:delete'" link type="danger" icon="Delete" @click="doDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>

    <el-dialog v-model="dialog" :title="editing ? '编辑域名配置' : '新增域名配置'" width="720px" top="6vh">
      <div class="dialog-body">
        <el-form :model="form" label-width="100px" class="dialog-form">
          <el-form-item label="域名">
            <el-input v-model="form.domain" :disabled="editing" placeholder="完整主机名，如 demo.example.com" />
          </el-form-item>
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
          <el-form-item label="状态">
            <el-switch v-model="form.status" :active-value="0" :inactive-value="1" active-text="启用" inactive-text="停用" inline-prompt />
          </el-form-item>
          <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" /></el-form-item>
        </el-form>

        <div class="preview-pane">
          <div class="preview-title">登录页预览</div>
          <div class="preview-stage" :style="swatchStyle(form)">
            <div class="preview-card">
              <img v-if="form.siteLogo" class="preview-logo" :src="resolveBrandingUrl(form.siteLogo)" alt="logo" />
              <div class="preview-site">{{ form.siteTitle || 'ai-mse' }}</div>
              <div class="preview-sub">登录</div>
            </div>
            <div v-if="form.copyright" class="preview-copyright">{{ form.copyright }}</div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="doSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import request from '../../api/request'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../../components/RightToolbar.vue'
import { resolveBrandingUrl } from '../../composables/useDomainBranding'

/** 常用渐变预设（点击回填背景色输入框） */
const GRADIENT_PRESETS = [
  { label: '默认紫蓝', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { label: '清新青绿', value: 'linear-gradient(135deg, #0ba360 0%, #3cba92 100%)' },
  { label: '深海蓝', value: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)' },
  { label: '暖阳橙', value: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
  { label: '静谧灰', value: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)' }
]

const showSearch = ref(true)
const rows = ref<any[]>([])
const total = ref(0)
const query = reactive({ pageNum: 1, pageSize: 10, domain: '', status: null as number | null })
const dialog = ref(false)
const editing = ref(false)
const form = reactive({
  id: 0, domain: '', siteTitle: '', siteLogo: '', loginBackground: '', backgroundColor: '',
  copyright: '', remark: '', status: 0
})

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

/** 背景 swatch / 预览舞台共用：背景图 cover 居中，背景色垫底 */
function swatchStyle(row: { loginBackground?: string | null; backgroundColor?: string | null }) {
  if (row.loginBackground) {
    return {
      backgroundImage: `url("${resolveBrandingUrl(row.loginBackground)}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundColor: row.backgroundColor || '#f5f7fa'
    }
  }
  return { background: row.backgroundColor || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }
}

// -------------------- 品牌素材上传 --------------------

const uploading = ref<'' | 'logo' | 'background'>('')

/** el-upload 手动接文件：立即上传到后端素材接口，回填返回的站内地址（保存配置后才落到配置行） */
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
      const url = await request.post('/tenant/domain-config/asset', body)
      if (kind === 'logo') form.siteLogo = url
      else form.loginBackground = url
      ElMessage.success('已上传，保存配置后生效')
    } finally {
      uploading.value = ''
    }
  }
}

async function load() {
  const data = await request.get('/tenant/domain-config/page', { params: query })
  rows.value = data.records
  total.value = Number(data.total)
}

function reset() {
  Object.assign(query, { pageNum: 1, domain: '', status: null })
  load()
}

function openCreate() {
  Object.assign(form, {
    id: 0, domain: '', siteTitle: '', siteLogo: '', loginBackground: '', backgroundColor: '',
    copyright: '', remark: '', status: 0
  })
  editing.value = false
  dialog.value = true
}

function openEdit(row: any) {
  Object.assign(form, {
    id: row.id,
    domain: row.domain,
    siteTitle: row.siteTitle ?? '',
    siteLogo: row.siteLogo ?? '',
    loginBackground: row.loginBackground ?? '',
    backgroundColor: row.backgroundColor ?? '',
    copyright: row.copyright ?? '',
    remark: row.remark ?? '',
    status: row.status ?? 0
  })
  editing.value = true
  dialog.value = true
}

async function doSave() {
  const { id, ...payload } = form
  if (editing.value) {
    await request.put('/tenant/domain-config', { id, ...payload })
    ElMessage.success('配置已更新')
  } else {
    await request.post('/tenant/domain-config', payload)
    ElMessage.success('配置已创建')
  }
  dialog.value = false
  load()
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确认删除域名 ${row.domain} 的个性化配置？`, '提示', { type: 'warning' })
  await request.delete(`/tenant/domain-config/${row.id}`)
  ElMessage.success('配置已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.search-card :deep(.el-form-item) {
  margin-bottom: 0;
}
.search-card {
  margin-bottom: 10px;
}
.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.toolbar-tip {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.bg-swatch {
  width: 56px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color);
  cursor: default;
}
.logo-broken {
  font-size: 12px;
  color: var(--el-color-danger);
}
.dialog-body {
  display: flex;
  gap: 16px;
}
.dialog-form {
  flex: 1;
  min-width: 0;
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
