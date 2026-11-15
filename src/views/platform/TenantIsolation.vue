<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form inline label-width="80px" @submit.prevent>
        <el-form-item label="租户">
          <el-select v-model="tenantId" filterable placeholder="选择租户" style="width: 240px" @change="load">
            <el-option v-for="t in tenants" :key="t.id" :label="t.name + '（' + t.code + '）'" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="load" :disabled="!tenantId">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-alert type="info" :closable="false" style="margin-bottom: 10px"
              title="解析顺序：服务级配置 → 全局默认绑定（租户表单的默认数据源，shared = SHARED_FIELD + 共享池路由，dedicated = 独立库）→ 无绑定 = SHARED_FIELD 字段隔离。独立库 = @TenantDatasource 实体整体路由；共享库分表 = 逻辑表按后缀改写（order → order_0001）；字段隔离 = 追加 tenant_id 条件。表级策略可覆盖服务级默认。" />

    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="left">
          <el-button v-permission="'tenant:route:save'" type="primary" icon="Plus" :disabled="!tenantId" @click="openCreate">新增配置</el-button>
        </div>
        <right-toolbar :searchable="false" @refresh="load" />
      </div>

      <el-table :data="rows">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div style="padding: 0 24px 12px 48px">
              <div class="policy-header">
                <span style="font-weight: 600">表级策略（覆盖服务级默认）</span>
                <el-button v-permission="'tenant:route:save'" link type="primary" icon="Plus"
                           @click="openPolicyCreate(row)">新增策略</el-button>
                <el-button v-permission="'tenant:route:generate'" link type="primary" icon="MagicStick"
                           @click="generateSplitTables(row)">生成分表</el-button>
              </div>
              <el-table :data="policies[row.serviceName] || []" size="small" border>
                <el-table-column prop="tableName" label="逻辑表名" width="220" />
                <el-table-column label="模式" width="180">
                  <template #default="{ row: p }">{{ modeLabel(p.mode) }}</template>
                </el-table-column>
                <el-table-column label="分表后缀" width="160">
                  <template #default="{ row: p }">{{ p.tableSuffix || '（服务级后缀）' }}</template>
                </el-table-column>
                <el-table-column label="物理表名">
                  <template #default="{ row: p }">{{ physicalName(row, p) }}</template>
                </el-table-column>
                <el-table-column label="操作" width="90" align="center">
                  <template #default="{ row: p }">
                    <el-button v-permission="'tenant:route:delete'" link type="danger" @click="deletePolicy(row, p)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="serviceName" label="服务" width="160" />
        <el-table-column label="隔离模式" width="200">
          <template #default="{ row }">
            <el-tag :type="row.isolationMode === 'INDEPENDENT_DB' ? 'warning' : (row.isolationMode === 'SHARED_TABLE_SPLIT' ? 'success' : 'info')" size="small">
              {{ modeLabel(row.isolationMode) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="路由数据源" width="180">
          <template #default="{ row }">{{ row.dsKey || '本服务业务主库' }}</template>
        </el-table-column>
        <el-table-column label="分表后缀" width="140">
          <template #default="{ row }">{{ row.tableSuffix || '-' }}</template>
        </el-table-column>
        <el-table-column label="隔离列" width="140">
          <template #default="{ row }">{{ row.tenantColumn || 'tenant_id' }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'tenant:route:save'" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
            <el-button v-permission="'tenant:route:delete'" link type="danger" @click="doDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialog" :title="form.id ? '编辑隔离配置' : '新增隔离配置'" width="560px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="服务名">
          <el-select v-model="form.serviceName" :disabled="!!form.id" filterable allow-create
                     default-first-option placeholder="目标服务，如 mse-oa / mse-mp" style="width: 100%">
            <el-option v-for="name in serviceNames" :key="name" :label="name" :value="name" />
          </el-select>
        </el-form-item>
        <el-form-item label="隔离模式">
          <el-radio-group v-model="form.isolationMode">
            <el-radio value="SHARED_FIELD">字段隔离</el-radio>
            <el-radio value="SHARED_TABLE_SPLIT">共享库分表</el-radio>
            <el-radio value="INDEPENDENT_DB">独立库</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="路由数据源">
          <el-select v-model="form.dsKey" clearable filterable allow-create placeholder="空 = 本服务业务主库；可选内置主库" style="width: 100%"
                     :disabled="form.isolationMode === 'SHARED_FIELD' && !form.dsKey">
            <el-option v-for="ds in datasources" :key="ds.id" :value="ds.dsKey"
                       :disabled="(ds.taken && ds.dsKey !== form.dsKey) || (ds.builtIn && ds.serviceName !== '*' && ds.serviceName !== form.serviceName)"
                       :label="ds.dsKey + '（' + (ds.builtIn ? '内置·' : '') + ds.serviceName + '·' + (ds.dsMode === 'shared' ? '共享' : '独立') + (ds.taken ? '·已占用' : '') + '）'" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.isolationMode === 'SHARED_TABLE_SPLIT'" label="分表后缀">
          <el-input v-model="form.tableSuffix" placeholder="如 _0001（按租户区分，建议含租户号）" />
        </el-form-item>
        <el-form-item label="隔离列">
          <el-input v-model="form.tenantColumn" placeholder="留空 = tenant_id" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="doSave">保存（分表模式自动补建后缀表）</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="policyDialog" title="新增表级策略" width="480px">
      <el-form :model="policyForm" label-width="100px">
        <el-form-item label="逻辑表名"><el-input v-model="policyForm.tableName" placeholder="如 order（不带后缀）" /></el-form-item>
        <el-form-item label="模式">
          <el-radio-group v-model="policyForm.mode">
            <el-radio value="SPLIT">分表</el-radio>
            <el-radio value="FIELD">字段隔离</el-radio>
            <el-radio value="GLOBAL">全局共享</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="policyForm.mode === 'SPLIT'" label="分表后缀">
          <el-input v-model="policyForm.tableSuffix" placeholder="留空 = 服务级后缀" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="policyDialog = false">取消</el-button>
        <el-button type="primary" @click="doSavePolicy">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/request'
import RightToolbar from '../../components/RightToolbar.vue'

const showSearch = ref(true)
const tenantId = ref<number | null>(null)
const tenants = ref<any[]>([])
const rows = ref<any[]>([])
const datasources = ref<any[]>([])
const serviceNames = ref<string[]>([])
const policies = ref<Record<string, any[]>>({})
const dialog = ref(false)
const policyDialog = ref(false)
const form = reactive({
  id: null as number | null, tenantId: null as number | null, serviceName: '', isolationMode: 'SHARED_FIELD',
  dsKey: '', tableSuffix: '', tenantColumn: '', remark: ''
})
const policyForm = reactive({ tenantId: null as number | null, serviceName: '', tableName: '', mode: 'SPLIT', tableSuffix: '' })

function modeLabel(mode: string) {
  return { INDEPENDENT_DB: '独立库', SHARED_TABLE_SPLIT: '共享库分表', SHARED_FIELD: '字段隔离', SPLIT: '分表', FIELD: '字段隔离', GLOBAL: '全局共享' }[mode] ?? mode
}

function physicalName(config: any, policy: any) {
  if (policy.mode !== 'SPLIT') return policy.tableName
  const suffix = policy.tableSuffix || config.tableSuffix
  return suffix ? policy.tableName + suffix : policy.tableName + '（后缀未配置）'
}

async function load() {
  if (!tenantId.value) return
  const data = await request.get('/tenant/service-config/list', { params: { tenantId: tenantId.value } })
  rows.value = data
  datasources.value = await request.get('/tenant/datasource/list')
  for (const row of rows.value) {
    await loadPolicies(row)
  }
}

async function loadPolicies(row: any) {
  policies.value[row.serviceName] = await request.get('/tenant/service-config/policies',
    { params: { tenantId: tenantId.value, serviceName: row.serviceName } })
}

function openCreate() {
  Object.assign(form, {
    id: null, tenantId: tenantId.value, serviceName: '', isolationMode: 'SHARED_FIELD',
    dsKey: '', tableSuffix: '', tenantColumn: '', remark: ''
  })
  dialog.value = true
}

function openEdit(row: any) {
  Object.assign(form, {
    id: row.id, tenantId: row.tenantId, serviceName: row.serviceName, isolationMode: row.isolationMode,
    dsKey: row.dsKey ?? '', tableSuffix: row.tableSuffix ?? '', tenantColumn: row.tenantColumn ?? '', remark: row.remark ?? ''
  })
  dialog.value = true
}

async function doSave() {
  await request.post('/tenant/service-config', {
    id: form.id, tenantId: form.tenantId, serviceName: form.serviceName, isolationMode: form.isolationMode,
    dsKey: form.dsKey || null, tableSuffix: form.isolationMode === 'SHARED_TABLE_SPLIT' ? (form.tableSuffix || null) : null,
    tenantColumn: form.tenantColumn || null, remark: form.remark || null
  })
  ElMessage.success('隔离配置已保存（运行时 30s 内生效；分表模式已自动补建后缀表）')
  dialog.value = false
  load()
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确定删除 ${row.serviceName} 的隔离配置？其表级策略将一并删除。`, '删除确认', { type: 'warning' })
  await request.delete(`/tenant/service-config/${row.id}`)
  load()
}

function openPolicyCreate(config: any) {
  Object.assign(policyForm, {
    tenantId: tenantId.value, serviceName: config.serviceName, tableName: '', mode: 'SPLIT', tableSuffix: ''
  })
  policyDialog.value = true
}

async function doSavePolicy() {
  await request.post('/tenant/service-config/policy', { ...policyForm, tableSuffix: policyForm.tableSuffix || null })
  ElMessage.success('表级策略已保存')
  policyDialog.value = false
  load()
}

async function deletePolicy(config: any, policy: any) {
  await request.delete(`/tenant/service-config/policy/${policy.id}`)
  loadPolicies(config)
}

async function generateSplitTables(config: any) {
  const summary = await request.post(`/tenant/service-config/${tenantId.value}/generate-split-tables`, null,
    { params: { serviceName: config.serviceName } })
  ElMessage.success(summary || '分表已生成')
}

onMounted(async () => {
  try {
    const data = await request.get('/tenant/page', { params: { pageNum: 1, pageSize: 999 } })
    tenants.value = data.records ?? []
  } catch { tenants.value = [] }
  try {
    serviceNames.value = await request.get('/tenant/service-config/service-names')
  } catch { serviceNames.value = [] }
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
.policy-header {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
}
</style>
