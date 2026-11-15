<template>
  <div class="page">
    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="left">
          <el-button v-permission="'deliver:package:export'" type="primary" icon="Suitcase" @click="openExport">签发附件包</el-button>
          <el-button icon="Refresh" @click="loadPackages">刷新</el-button>
        </div>
        <right-toolbar @refresh="loadPackages" />
      </div>

      <el-table :data="packages" border>
        <el-table-column prop="id" label="编号" width="70" />
        <el-table-column prop="tenantCode" label="租户" width="110" />
        <el-table-column label="类型" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.packageType === 'FULL' ? 'success' : 'warning'" size="small">
              {{ row.packageType === 'FULL' ? '全量' : '升级' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="模块集" width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.moduleList || '（全量）' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="190">
          <template #default="{ row }">
            <template v-if="row.status === 0">
              <el-progress :percentage="row.progress || 0" :stroke-width="8" class="progress" />
              <div class="stage">{{ row.stage || '签发中' }}</div>
            </template>
            <el-tag v-else-if="row.status === 1" type="success" size="small">完成</el-tag>
            <el-tooltip v-else :content="row.errorMsg || '签发失败'" placement="top">
              <el-tag type="danger" size="small">失败</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="数据" width="120">
          <template #default="{ row }">
            <span v-if="row.status === 1">{{ row.tableCount }} 表 / {{ row.rowCount }} 行</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="licenseId" label="随包凭证" width="120">
          <template #default="{ row }">{{ row.licenseId || '-' }}</template>
        </el-table-column>
        <el-table-column label="推送 studio" width="150">
          <template #default="{ row }">
            <el-tag v-if="row.pushStatus === 'pushed'" type="success" size="small">已推送 #{{ row.studioDeliveryId }}</el-tag>
            <el-tooltip v-else-if="row.pushStatus && row.pushStatus.startsWith('failed')" :content="row.pushStatus" placement="top">
              <el-tag type="danger" size="small">推送失败</el-tag>
            </el-tooltip>
            <span v-else style="color: var(--el-text-color-secondary)">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="fileName" label="文件" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'deliver:package:download'" link type="primary" icon="Download"
                       :disabled="row.status !== 1" @click="doDownload(row)">下载</el-button>
            <el-button v-permission="'deliver:package:list'" link type="primary" icon="View"
                       :disabled="row.status !== 1" @click="openDetail(row)">清单</el-button>
          </template>
        </el-table-column>
      </el-table>
      <Pagination :total="total" v-model:page="query.pageNum" v-model:size="query.pageSize" @change="loadPackages" />
      <div class="tip">签发为异步任务：附件包（license 凭证 + 租户数据 + 租户变量 + 表结构，RS256 签名内层）归档可下载，
        或直推 deliver-studio；最终交付包 = deliver-studio「套件 + 附件」重打包产出，交 deliver-console 安装。</div>
    </el-card>

    <el-dialog v-model="exportDialog" title="签发交付附件包" width="680px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="目标租户">
          <el-select v-model="form.tenantId" filterable style="width: 100%">
            <el-option v-for="t in tenants" :key="t.id" :label="`${t.name}（${t.code}）`" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="包类型">
          <el-radio-group v-model="form.packageType" @change="form.patchTables = []">
            <el-radio value="FULL">全量附件包（含凭证+数据）</el-radio>
            <el-radio value="UPGRADE">升级包（增量补丁）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.packageType === 'FULL'" label="包含业务数据">
          <el-switch v-model="form.includeData" />
          <span class="tip inline">结构/菜单不随包（租户侧 jar 自建）；关闭则仅交付凭证与配置模板</span>
        </el-form-item>
        <el-form-item v-if="form.packageType === 'FULL'" label="随包导出菜单">
          <div class="menu-export-box">
            <el-tree ref="exportMenuTreeRef" :data="exportMenuTree" show-checkbox node-key="id"
                     :props="{ label: 'name', children: 'children' }" default-expand-all
                     @check="onExportMenuCheck" />
          </div>
          <div class="tip">默认勾选 = 该租户当前套餐；可增勾任务调度/监控中心等（如「系统管理 → 任务调度」）随包导出——未勾选菜单不出现在离线部署（license 即菜单域真源）</div>
        </el-form-item>
        <el-form-item v-if="form.packageType === 'FULL'" label="授权凭证">
          <div class="license-row">
            <el-input-number v-model="licenseDays" :min="1" :max="3650" />
            <span class="tip inline">天</span>
            <el-button type="primary" plain :loading="issuing" @click="doIssue">签发凭证</el-button>
            <el-tag v-if="form.licenseId" type="success" size="small">{{ form.licenseId }} 已就绪</el-tag>
          </div>
          <div class="tip">先签发后导出；token 一次性生成，仅随包写入（平台不落库）</div>
        </el-form-item>
        <el-form-item label="签发模块">
          <el-select v-model="form.modules" multiple filterable allow-create default-first-option
                     placeholder="可空=全量；勾选后未选积木的数据表不进包" style="width: 100%">
            <el-option v-for="m in moduleOptions" :key="m" :label="m" :value="m" />
          </el-select>
          <div class="tip">与 deliver-studio 打包套件时的业务勾选保持同口径（套件未含的积木其数据不必导出）；基座模块（system）恒随包</div>
        </el-form-item>
        <el-form-item label="直推 studio">
          <template v-if="studio.enabled">
            <el-switch v-model="form.pushStudio" />
            <span class="tip inline">{{ studio.url }}（推送失败不影响签发，附件包仍可手动下载上传）</span>
          </template>
          <span v-else class="tip inline">未配置直推（mse.deliver.studio.url/user/password）——签发后手动下载附件包，到 deliver-studio「交付附件」上传</span>
        </el-form-item>
        <el-form-item v-if="form.packageType === 'UPGRADE'" label="补丁表">
          <el-select v-model="form.patchTables" multiple filterable allow-create default-first-option
                     placeholder="输入表名后回车，可多选" style="width: 100%" />
          <div class="tip">按表整表替换（租户范围 delete + 重建，天然携带删除）；表须在租户库可导出清单内</div>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="exportDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doExport">提交签发任务</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialog" title="附件包清单（内层 manifest 快照）" width="760px">
      <el-descriptions :column="2" border size="small" class="detail-desc">
        <el-descriptions-item label="文件">{{ detail?.fileName }}</el-descriptions-item>
        <el-descriptions-item label="大小">{{ formatSize(detail?.fileSize) }}</el-descriptions-item>
        <el-descriptions-item label="SHA-256" :span="2">
          <span class="sha">{{ detail?.fileSha256 }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <el-input type="textarea" :model-value="detailManifest" :rows="18" readonly class="manifest-text" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../../api/request'
import RightToolbar from '../../components/RightToolbar.vue'
import { Pagination } from 'mse-ui-shared/pc'

const packages = ref<any[]>([])
const total = ref(0)
const query = reactive({ pageNum: 1, pageSize: 10, tenantId: undefined as number | undefined, status: undefined as number | undefined })
const tenants = ref<any[]>([])
const moduleOptions = ref<string[]>([])
const studio = reactive({ enabled: false, url: '' })

const exportDialog = ref(false)
const issuing = ref(false)
const exportMenuTree = ref<any[]>([])
const exportMenuTreeRef = ref()
const packageMenuMap = ref<Record<number, string>>({})
const checkedExportMenuIds = ref<number[]>([])
const submitting = ref(false)
const licenseDays = ref(365)
const form = reactive({
  tenantId: undefined as number | undefined,
  packageType: 'FULL',
  includeData: true,
  licenseId: '',
  licenseToken: '',
  modules: [] as string[],
  pushStudio: false,
  patchTables: [] as string[],
  remark: ''
})

const detailDialog = ref(false)
const detail = ref<any>(null)
const detailManifest = ref('')

let pollTimer: number | undefined

function formatSize(size?: number) {
  if (!size) return '-'
  if (size > 1024 * 1024 * 1024) return (size / 1024 / 1024 / 1024).toFixed(2) + ' GB'
  if (size > 1024 * 1024) return (size / 1024 / 1024).toFixed(2) + ' MB'
  return (size / 1024).toFixed(1) + ' KB'
}

/** 有签发中任务时轮询记录列表（进度反馈），全部终态自动停止 */
function ensurePolling() {
  if (pollTimer) return
  pollTimer = window.setInterval(async () => {
    if (!packages.value.some((r) => r.status === 0)) {
      window.clearInterval(pollTimer)
      pollTimer = undefined
      return
    }
    await loadPackages()
  }, 3000)
}

async function loadPackages() {
  const page = await request.get('/tenant/deliver/package/page', { params: query })
  packages.value = page.records || []
  total.value = Number(page.total || 0)
  if (packages.value.some((r) => r.status === 0)) ensurePolling()
}

async function loadTenants() {
  const page = await request.get('/tenant/page', { params: { pageNum: 1, pageSize: 200 } })
  tenants.value = page.records || []
}

async function loadMeta() {
  moduleOptions.value = (await request.get('/tenant/deliver/modules')) || []
  const info = await request.get('/tenant/deliver/studio')
  studio.enabled = !!info?.enabled
  studio.url = info?.url || ''
}

/** 随包导出菜单树（与「套餐管理」同源，MenuTreeNode.menu 拍平为 {id,name,children}）+ 套餐 menuIds 映射（默认勾选用） */
async function loadExportMenus() {
  const raw = await request.get('/system/menu/tree')
  const walk = (nodes: any[]): any[] =>
      (nodes || []).map((n: any) => ({ id: Number(n.menu.id), name: n.menu.name, children: walk(n.children || []) }))
  exportMenuTree.value = walk(raw)
  const pkgs = await request.get('/tenant-package/list')
  packageMenuMap.value = Object.fromEntries((pkgs || []).map((row: any) => [row.id, row.menuIds || '']))
}

/** 树中叶子 id 集合（套餐回勾只落叶子，父勾选态交由联动推导） */
function leafIdsOf(nodes: any[]): Set<number> {
  const ids = new Set<number>()
  const walk = (list: any[]) => {
    for (const n of list) {
      if (n.children?.length) walk(n.children)
      else ids.add(n.id)
    }
  }
  walk(nodes)
  return ids
}

/** 切换租户：默认勾选重置为该租户套餐（只回勾叶子，父链由联动反推——直接 set 目录 id 会整链超选）并作废已签发凭证 */
watch(() => form.tenantId, async (tenantId) => {
  form.licenseId = ''
  form.licenseToken = ''
  await nextTick()
  const tree = exportMenuTreeRef.value
  if (!tree) return
  tree.setCheckedKeys([])
  if (!tenantId) return
  const tenant = tenants.value.find((t) => t.id === tenantId)
  const menuIds = (packageMenuMap.value[tenant?.packageId] || '').split(',')
      .map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && v > 0)
  const leaves = leafIdsOf(exportMenuTree.value)
  tree.setCheckedKeys(menuIds.filter((id) => leaves.has(id)))
  checkedExportMenuIds.value = menuIds
})

/** 联动勾选收割：全选 + 半选父目录一并入集（license 按字面 id 消费，父目录撑离线菜单祖先链，与套餐管理同口径） */
function onExportMenuCheck() {
  const tree = exportMenuTreeRef.value
  if (!tree) return
  checkedExportMenuIds.value = [...tree.getCheckedKeys(), ...tree.getHalfCheckedKeys()].map(Number)
}

function openExport() {
  Object.assign(form, {
    tenantId: undefined, packageType: 'FULL', includeData: true,
    licenseId: '', licenseToken: '', modules: [], pushStudio: false,
    patchTables: [], remark: ''
  })
  exportDialog.value = true
}

/** 先签发授权凭证（token 一次性返回，仅存内存随包提交） */
async function doIssue() {
  if (!form.tenantId) {
    ElMessage.warning('请先选择租户')
    return
  }
  if (!checkedExportMenuIds.value.length) {
    ElMessage.warning('请先勾选随包导出菜单（或为租户配置套餐）')
    return
  }
  issuing.value = true
  try {
    const issued = await request.post('/tenant/license/issue', {
      tenantId: form.tenantId, days: licenseDays.value, menuIds: checkedExportMenuIds.value
    })
    form.licenseId = issued.licenseId
    form.licenseToken = issued.token
    ElMessage.success(`凭证 ${issued.licenseId} 已签发（有效期至 ${issued.expireAt?.slice(0, 10) ?? '-'}）`)
  } finally {
    issuing.value = false
  }
}

async function doExport() {
  if (!form.tenantId) {
    ElMessage.warning('请选择租户')
    return
  }
  if (form.packageType === 'FULL' && form.includeData && !form.licenseId) {
    ElMessage.warning('全量附件包须先签发授权凭证')
    return
  }
  submitting.value = true
  try {
    await request.post('/tenant/deliver/package/export', { ...form })
    ElMessage.success('签发任务已提交，可在列表查看进度')
    exportDialog.value = false
    await loadPackages()
    ensurePolling()
  } finally {
    submitting.value = false
  }
}

/** 大文件下载走签名 URL 交浏览器原生下载：浏览器自己流式落盘（页面零内存占用）、下载管理器
 *  自带进度/暂停/断点续传（后端 206 + ETag 支撑），不受 15s 请求超时约束。
 *  新窗口承载下载；失败时错误 JSON 落在新页签，不会把当前应用页导航走。须在 await 前同步占位开窗，
 *  异步后再 window.open 会因丢失用户手势被浏览器当弹窗拦截 */
async function nativeDownload(url: string) {
  const win = window.open('', '_blank')
  try {
    const issued = await request.get<any>(url)
    if (win) win.location.href = `/api${issued.url}`
    ElMessage.success('已发起下载（新窗口），进度与暂停/续传见浏览器下载管理')
  } catch (e) {
    win?.close()
    throw e
  }
}

async function doDownload(row: any) {
  await nativeDownload(`/tenant/deliver/package/${row.id}/download-url`)
}

async function openDetail(row: any) {
  detail.value = await request.get(`/tenant/deliver/package/${row.id}`)
  detailManifest.value = detail.value?.manifestJson ? JSON.stringify(JSON.parse(detail.value.manifestJson), null, 2) : '-'
  detailDialog.value = true
}

onMounted(() => {
  loadPackages()
  loadTenants()
  loadMeta()
  loadExportMenus()
})

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer)
})
</script>

<style scoped>
.menu-export-box {
  width: 100%;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 6px 10px;
}

.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
  width: 100%;
  margin-top: 4px;
}
.tip.inline {
  width: auto;
  margin: 0 8px;
}
.license-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.progress {
  width: 160px;
}
.stage {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
.sha {
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
}
.detail-desc {
  margin-bottom: 12px;
}
.manifest-text :deep(textarea) {
  font-family: monospace;
  font-size: 12px;
}
</style>
