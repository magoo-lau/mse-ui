<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="租户名称"><el-input v-model="query.name" placeholder="请输入租户名" clearable style="width: 200px" @keyup.enter="load" /></el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="load">搜索</el-button>
          <el-button icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="left">
          <el-button v-permission="'tenant:tenant:create'" type="primary" icon="Plus" @click="openCreate">开通租户</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="rows">
        <el-table-column prop="id" label="租户编号" width="200" />
        <el-table-column prop="code" label="编码" width="120" />
        <el-table-column prop="name" label="租户名" width="160" />
        <el-table-column label="套餐" width="130">
          <template #default="{ row }">{{ packageName(row.packageId) }}</template>
        </el-table-column>
        <el-table-column label="数据源绑定" width="180">
          <template #default="{ row }">
            <el-tooltip v-if="row.dsKey" content="全局默认绑定（各服务可用隔离策略按服务覆盖）" placement="top">
              <el-tag type="warning" size="small">{{ row.dsKey }}</el-tag>
            </el-tooltip>
            <el-tooltip v-else content="未绑定数据源（存量兼容：业务数据落各服务主库，tenant_id 行级隔离）；建议补绑租户库或内置 master" placement="top">
              <el-tag type="danger" size="small">未绑定</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="绑定域名" min-width="150">
          <template #default="{ row }">{{ row.domain || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.provisionStatus === 0" type="warning" size="small" effect="plain">初始化中</el-tag>
            <el-tooltip v-else-if="row.provisionStatus === 2" :content="row.provisionError || '开通失败'" placement="top">
              <el-tag type="danger" size="small" effect="plain">开通失败</el-tag>
            </el-tooltip>
            <el-tag v-else :type="row.status === 0 ? 'success' : 'danger'" size="small">{{ row.status === 0 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'tenant:tenant:update'" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="row.provisionStatus === 2" v-permission="'tenant:tenant:create'" link type="warning" @click="openRetry(row)">重试开通</el-button>
            <el-button v-else-if="row.provisionStatus === 1 || row.provisionStatus == null" v-permission="'tenant:tenant:reset-password'" link type="primary" icon="Key" @click="openReset(row)">重置密码</el-button>
            <el-button v-if="row.provisionStatus === 1 || row.provisionStatus == null" v-permission="'tenant:tenant:change-status'" link :type="row.status === 0 ? 'danger' : 'success'" @click="toggle(row)">
              {{ row.status === 0 ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>

    <el-dialog v-model="createDialog" title="开通租户" width="480px">
      <el-form ref="formRef" :model="form" :rules="createRules" label-width="110px">
        <el-form-item label="租户编码" prop="code"><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="租户名" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="套餐">
          <el-select v-model="form.packageId" clearable placeholder="不选 = 不裁剪（全部租户菜单）" style="width: 100%">
            <el-option v-for="pkg in packages" :key="pkg.id" :label="pkg.name" :value="pkg.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="默认数据源（全局兜底）" prop="dsKey">
          <el-select v-model="form.dsKey" filterable allow-create default-first-option clearable
                     placeholder="选择租户库（共享/独立/内置主库）；可输入存量静态 key" style="width: 100%">
            <el-option v-for="ds in globalDatasources" :key="ds.id" :value="ds.dsKey"
                       :disabled="ds.taken && ds.dsKey !== form.dsKey"
                       :label="ds.dsKey + '（' + (ds.builtIn ? '内置主库·' : '') + (ds.dsMode === 'shared' ? '共享库' : '独立库') + (ds.taken ? '·已占用' : '') + '）'" />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定域名">
          <el-input v-model="form.domain" placeholder="留空=不绑定；完整主机名如 demo.example.com" />
        </el-form-item>
        <el-form-item label="管理员账号" prop="adminUsername"><el-input v-model="form.adminUsername" /></el-form-item>
        <el-form-item label="管理员密码" prop="adminPassword"><el-input v-model="form.adminPassword" type="password" show-password placeholder="6-32 位" /></el-form-item>
        <el-form-item label="管理员邮箱"><el-input v-model="form.adminEmail" placeholder="选填；重置凭证投递地址" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="creating" @click="createDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="doCreate">开通</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editDialog" title="编辑租户" width="480px">
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="110px">
        <el-form-item label="租户编码"><el-input :model-value="editForm.code" disabled /></el-form-item>
        <el-form-item label="租户名" prop="name"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item label="套餐">
          <el-select v-model="editForm.packageId" clearable placeholder="不选 = 不裁剪（全部租户菜单）" style="width: 100%">
            <el-option v-for="pkg in packages" :key="pkg.id" :label="pkg.name" :value="pkg.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="默认数据源（全局兜底）">
          <el-select v-model="editForm.dsKey" filterable allow-create default-first-option clearable
                     placeholder="选择租户库；清空 = 保持未绑定（落各服务主库）" style="width: 100%">
            <el-option v-for="ds in globalDatasources" :key="ds.id" :value="ds.dsKey"
                       :disabled="ds.taken && ds.dsKey !== editForm.dsKey"
                       :label="ds.dsKey + '（' + (ds.builtIn ? '内置主库·' : '') + (ds.dsMode === 'shared' ? '共享库' : '独立库') + (ds.taken ? '·已占用' : '') + '）'" />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定域名">
          <el-input v-model="editForm.domain" placeholder="留空=不绑定；完整主机名如 demo.example.com" />
        </el-form-item>
        <el-form-item label="联系人"><el-input v-model="editForm.contactUserName" /></el-form-item>
        <el-form-item label="联系电话"><el-input v-model="editForm.contactPhone" /></el-form-item>
        <el-form-item label="过期时间">
          <el-date-picker v-model="editForm.expireTime" type="datetime" placeholder="留空=不过期"
                          value-format="YYYY-MM-DDTHH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="editForm.remark" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialog = false">取消</el-button>
        <el-button type="primary" @click="doUpdate">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resetDialog" title="重置租户管理员密码" width="420px">
      <el-form ref="resetFormRef" :model="resetForm" :rules="resetRules" label-width="100px">
        <el-form-item label="租户">
          <el-input :model-value="resetTenantName" disabled />
        </el-form-item>
        <el-form-item label="管理员账号" prop="username">
          <el-select v-model="resetForm.username" placeholder="请选择管理员" style="width: 100%">
            <el-option v-for="admin in admins" :key="admin.username" :value="admin.username"
                       :label="admin.username + (admin.email ? '（' + admin.email + '）' : '')" />
          </el-select>
        </el-form-item>
        <el-form-item label="新密码" prop="password">
          <el-input v-model="resetForm.password" type="password" show-password placeholder="6-32 位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetDialog = false">取消</el-button>
        <el-button :loading="totpResetting" @click="doResetAdminTotp">重置双因子</el-button>
        <el-button type="primary" @click="doReset">重置密码</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="retryDialog" title="重试开通" width="420px">
      <el-form ref="retryFormRef" :model="retryForm" :rules="retryRules" label-width="100px">
        <el-form-item label="租户">
          <el-input :model-value="retryTenantName" disabled />
        </el-form-item>
        <el-form-item label="管理员账号" prop="adminUsername"><el-input v-model="retryForm.adminUsername" /></el-form-item>
        <el-form-item label="管理员密码" prop="adminPassword">
          <el-input v-model="retryForm.adminPassword" type="password" show-password placeholder="重新录入 6-32 位（密码不落库，故需重输）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="retryDialog = false">取消</el-button>
        <el-button type="primary" :loading="retrying" @click="doRetry">重新开通</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, nextTick } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import request from '../api/request'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../components/RightToolbar.vue'

const showSearch = ref(true)
const rows = ref<any[]>([])
const total = ref(0)
const query = reactive({ pageNum: 1, pageSize: 10, name: '' })
const createDialog = ref(false)
const creating = ref(false)
const editDialog = ref(false)
const formRef = ref<FormInstance>()
const editFormRef = ref<FormInstance>()
const form = reactive({ code: '', name: '', packageId: null as number | null, dsKey: '', domain: '', adminUsername: '', adminPassword: '', adminEmail: '' })
// 必填规则与后端 TenantCreateRequest 的 @NotBlank/@Size 对齐；required 规则自动渲染红色星号与红色错误提示
const createRules: FormRules = {
  code: [{ required: true, message: '租户编码不能为空', trigger: 'blur' }],
  name: [{ required: true, message: '租户名不能为空', trigger: 'blur' }],
  dsKey: [{ required: true, message: '必须绑定租户数据源（共享库或独立库），请先在「平台管理 → 租户数据源」维护', trigger: 'change' }],
  adminUsername: [{ required: true, message: '管理员账号不能为空', trigger: 'blur' }],
  adminPassword: [{ required: true, min: 6, max: 32, message: '密码长度须为 6-32 位', trigger: 'blur' }]
}
const editRules: FormRules = {
  name: [{ required: true, message: '租户名不能为空', trigger: 'blur' }]
}
const editForm = reactive({
  id: 0, code: '', name: '', packageId: null as number | null, dsKey: '', domain: '',
  contactUserName: '', contactPhone: '', expireTime: '' as string | null, remark: ''
})
const packages = ref<any[]>([])
const datasources = ref<any[]>([])
// 全局默认绑定只接受 '*' 通用数据源（含内置主库行）；服务专属库走「隔离策略」按服务绑定
const globalDatasources = computed(() => datasources.value.filter((ds) => ds.serviceName === '*'))

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

function packageName(id: number | null) {
  return id == null ? '-' : (packages.value.find((p) => p.id === id)?.name ?? id)
}

async function load() {
  const data = await request.get('/tenant/page', { params: query })
  rows.value = data.records
  total.value = Number(data.total)
  try { packages.value = await request.get('/tenant-package/list') } catch { packages.value = [] }
  try { datasources.value = await request.get('/tenant/datasource/list') } catch { datasources.value = [] }
  schedulePoll()
}

// ===== 初始化中轮询：开通已异步化，列表里存在「初始化中」租户时每 3s 刷新一次，直到全部完成 =====
// autoPolls 上限防僵死（如进程重启丢了后台任务导致状态停在初始化中）——达上限后停止自动刷新，
// 用户手动搜索/重试会把计数清零重新开始
let pollTimer: ReturnType<typeof setTimeout> | null = null
let autoPolls = 0

function schedulePoll() {
  if (pollTimer != null || autoPolls >= 100) return
  if (!rows.value.some((row) => row.provisionStatus === 0)) {
    autoPolls = 0
    return
  }
  pollTimer = setTimeout(async () => {
    pollTimer = null
    autoPolls++
    await load()
  }, 3000)
}

function reset() {
  Object.assign(query, { pageNum: 1, name: '' })
  autoPolls = 0
  load()
}

/** 默认选中：缺省共享库 → 内置主库（配置文件/Nacos 默认数据源）→ 空 */
function defaultDsKey() {
  // 0.1.0 内置缺省共享库：ds_key 留空 = 各服务本地内置共享库（mse.tenant.shared-main.* 每服务自declare，
  // 键默认=本服务应用名、显式 '*'=通用）；显式登记行仍可选（按行路由）
  return ''
}

function openCreate() {
  Object.assign(form, { code: '', name: '', packageId: null, dsKey: defaultDsKey(), domain: '', adminUsername: '', adminPassword: '', adminEmail: '' })
  createDialog.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function doCreate() {
  await formRef.value?.validate()
  // 开通已异步化：接口只落「初始化中」的租户行即返回，管理员创建与独立库首次克隆
  // （耗时随业务表数量增长）全部在后台执行，进度经列表「状态」列轮询展示
  creating.value = true
  try {
    await request.post('/tenant', form)
    ElMessage.success('租户已创建，后台开通中（开通完成后管理员即可登录）')
    createDialog.value = false
    autoPolls = 0
    load()
  } finally {
    creating.value = false
  }
}

function openEdit(row: any) {
  Object.assign(editForm, {
    id: row.id, code: row.code, name: row.name, packageId: row.packageId ?? null, dsKey: row.dsKey ?? '',
    domain: row.domain ?? '', contactUserName: row.contactUserName ?? '', contactPhone: row.contactPhone ?? '',
    expireTime: row.expireTime ?? null, remark: row.remark ?? ''
  })
  editDialog.value = true
  nextTick(() => editFormRef.value?.clearValidate())
}

async function doUpdate() {
  await editFormRef.value?.validate()
  const { id, code, ...payload } = editForm
  await request.put('/tenant', { id, ...payload })
  ElMessage.success('租户已更新')
  editDialog.value = false
  load()
}

async function toggle(row: any) {
  await request.put(`/tenant/${row.id}/status/${row.status === 0 ? 1 : 0}`)
  load()
}

const resetDialog = ref(false)
const resetFormRef = ref<FormInstance>()
const resetTenantId = ref<number | null>(null)
const resetTenantName = ref('')
const admins = ref<any[]>([])
const resetForm = reactive({ username: '', password: '' })
const resetRules: FormRules = {
  username: [{ required: true, message: '请选择管理员', trigger: 'change' }],
  password: [{ required: true, min: 6, max: 32, message: '密码长度须为 6-32 位', trigger: 'blur' }]
}

async function openReset(row: any) {
  resetTenantId.value = row.id
  resetTenantName.value = row.name
  Object.assign(resetForm, { username: '', password: '' })
  admins.value = []
  resetDialog.value = true
  nextTick(() => resetFormRef.value?.clearValidate())
  try {
    admins.value = await request.get(`/tenant/${row.id}/admins`)
  } catch {
    admins.value = []
  }
}

async function doReset() {
  await resetFormRef.value?.validate()
  if (resetTenantId.value == null || !resetForm.username) return
  await request.put(`/tenant/${resetTenantId.value}/admin-password`, {
    username: resetForm.username,
    password: resetForm.password
  })
  ElMessage.success('密码已重置')
  resetDialog.value = false
}

// ===== 重置租户管理员双因子（管理员丢失验证器被锁死时的恢复手段；与重置密码同权限点） =====
const totpResetting = ref(false)

async function doResetAdminTotp() {
  if (resetTenantId.value == null || !resetForm.username) {
    ElMessage.warning('请先选择管理员')
    return
  }
  await ElMessageBox.confirm(
    `确定清除管理员 ${resetForm.username} 的双因子验证器绑定？清除后其下次登录可直接凭密码进入。`,
    '重置双因子',
    { type: 'warning' }
  )
  totpResetting.value = true
  try {
    await request.put(`/tenant/${resetTenantId.value}/admin-totp-reset`, { username: resetForm.username })
    ElMessage.success('已重置双因子')
  } finally {
    totpResetting.value = false
  }
}

// ===== 重试开通（开通失败/中断的租户）：密码不落库，需运营重新录入 =====
const retryDialog = ref(false)
const retryFormRef = ref<FormInstance>()
const retryTenantId = ref<number | null>(null)
const retryTenantName = ref('')
const retrying = ref(false)
const retryForm = reactive({ adminUsername: '', adminPassword: '' })
const retryRules: FormRules = {
  adminUsername: [{ required: true, message: '管理员账号不能为空', trigger: 'blur' }],
  adminPassword: [{ required: true, min: 6, max: 32, message: '密码长度须为 6-32 位', trigger: 'blur' }]
}

function openRetry(row: any) {
  retryTenantId.value = row.id
  retryTenantName.value = row.name
  Object.assign(retryForm, { adminUsername: row.adminUsername || 'admin', adminPassword: '' })
  retryDialog.value = true
  nextTick(() => retryFormRef.value?.clearValidate())
}

async function doRetry() {
  await retryFormRef.value?.validate()
  if (retryTenantId.value == null) return
  retrying.value = true
  try {
    await request.post(`/tenant/${retryTenantId.value}/provision`, retryForm)
    ElMessage.success('已重新提交开通任务，状态将在列表中自动刷新')
    retryDialog.value = false
    autoPolls = 0
    load()
  } finally {
    retrying.value = false
  }
}

onMounted(load)
onUnmounted(() => {
  if (pollTimer != null) clearTimeout(pollTimer)
})
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
</style>
