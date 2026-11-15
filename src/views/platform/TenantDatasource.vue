<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="数据源key"><el-input v-model="query.dsKey" placeholder="请输入 key" clearable style="width: 180px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="库模式">
          <el-select v-model="query.dsMode" placeholder="全部" clearable style="width: 130px">
            <el-option label="共享库" value="shared" />
            <el-option label="独立库" value="dedicated" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属服务">
          <el-select v-model="query.serviceName" clearable filterable allow-create default-first-option
                     placeholder="全部" style="width: 160px" @change="load">
            <el-option label="*（通用）" value="*" />
            <el-option v-for="name in serviceNames" :key="name" :label="name" :value="name" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="load">搜索</el-button>
          <el-button icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-alert type="info" :closable="false" style="margin-bottom: 10px"
              title="配置文件/Nacos 中的默认数据源（master）为内置数据源：单体=通用一条；微服务=通用 + 每个已知服务一条（各服务各自主库）。可供共享租户绑定（tenant_id 行级隔离），内置行不可修改。其余租户库在此维护：共享库可绑定多个租户，独立库一库一租户独占；保存后运行时注册，无需重启服务。" />

    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="left">
          <el-button v-permission="'tenant:ds:create'" type="primary" icon="Plus" @click="openCreate">新增数据源</el-button>
          <el-button v-permission="'tenant:ds:sync'" icon="Refresh" :loading="batchLoading" @click="doBatchSync">批量同步</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="rows">
        <el-table-column label="key" width="150">
          <template #default="{ row }">
            <span>{{ row.dsKey }}</span>
            <el-tooltip v-if="row.builtIn" content="内置：配置文件/Nacos 默认主库，可供共享租户绑定，不可修改" placement="top">
              <el-tag type="info" size="small" style="margin-left: 4px">内置</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="库模式" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.dsMode === 'shared' ? 'success' : 'warning'" size="small">{{ row.dsMode === 'shared' ? '共享库' : '独立库' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">{{ typeLabel(row.dbType) }}</template>
        </el-table-column>
        <el-table-column label="所属服务" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="row.serviceName === '*' ? 'info' : 'primary'" size="small">{{ row.serviceName === '*' ? '通用' : row.serviceName }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="连接目标" min-width="200">
          <template #default="{ row }">
            <span v-if="row.builtIn && !row.host" style="color: var(--el-text-color-secondary)">由各服务 Nacos 配置</span>
            <span v-else>{{ row.host }}:{{ row.port }}/{{ row.dbName }}</span>
          </template>
        </el-table-column>
        <el-table-column label="绑定租户" min-width="140">
          <template #default="{ row }">
            <span v-if="row.boundTenants > 0">{{ row.boundTenantNames }}</span>
            <span v-else style="color: var(--el-text-color-secondary)">未绑定</span>
          </template>
        </el-table-column>
        <el-table-column label="运行状态" width="90" align="center">
          <template #default="{ row }">
            <el-tooltip v-if="row.registered != null" content="当前服务进程的运行时注册状态（其他服务进程经 Redis 广播各自同步）；未注册时该 key 的路由会回落平台库" placement="top">
              <el-tag :type="row.registered ? 'success' : 'danger'" size="small">{{ row.registered ? '运行中' : '未注册' }}</el-tag>
            </el-tooltip>
            <span v-else style="color: var(--el-text-color-secondary)">—</span>
          </template>
        </el-table-column>
        <el-table-column label="初始化" width="100" align="center">
          <template #default="{ row }">
            <el-tooltip v-if="row.initStatus === 0" content="初始化任务后台执行中（建库 + 全量脚本直建）" placement="top">
              <el-tag type="warning" size="small">初始化中</el-tag>
            </el-tooltip>
            <el-tooltip v-else-if="row.initStatus === 2" :content="row.initMessage || '初始化失败'" placement="top">
              <el-tag type="danger" size="small">失败</el-tag>
            </el-tooltip>
            <span v-else style="color: var(--el-text-color-secondary)">—</span>
          </template>
        </el-table-column>
        <el-table-column label="同步" width="100" align="center">
          <template #default="{ row }">
            <el-tooltip v-if="row.syncStatus === 0" content="结构同步任务后台执行中（迁移 + 结构比对）" placement="top">
              <el-tag type="warning" size="small">同步中</el-tag>
            </el-tooltip>
            <el-tooltip v-else-if="row.syncStatus === 2" :content="row.syncMessage || '同步失败'" placement="top">
              <el-tag type="danger" size="small">失败</el-tag>
            </el-tooltip>
            <span v-else style="color: var(--el-text-color-secondary)">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 0 ? 'success' : 'danger'" size="small">{{ row.status === 0 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="330" fixed="right">
          <template #default="{ row }">
            <template v-if="!row.builtIn">
              <el-button v-permission="'tenant:ds:list'" link type="primary" icon="Link" @click="doTest(row)">测试</el-button>
              <el-button v-permission="'tenant:ds:update'" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
              <el-button v-permission="'tenant:ds:update'" link :type="row.status === 0 ? 'danger' : 'success'" @click="toggle(row)">
                {{ row.status === 0 ? '停用' : '启用' }}
              </el-button>
              <el-button v-permission="'tenant:ds:delete'" link type="danger" icon="Delete" @click="doDelete(row)">删除</el-button>
              <!-- 低频维护操作折叠进更多：初始化/结构同步/结构状态/执行 SQL -->
              <el-dropdown v-permission="['tenant:ds:update', 'tenant:ds:sync', 'tenant:ds:execute']" trigger="click"
                           style="margin-left: 12px; vertical-align: middle"
                           @command="(cmd: string) => onRowCommand(cmd, row)">
                <el-button link type="primary">更多<el-icon><ArrowDown /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="row.dbType === 'mysql'" v-permission="'tenant:ds:update'" command="init">
                      <el-icon><MagicStick /></el-icon>初始化
                    </el-dropdown-item>
                    <el-dropdown-item v-permission="'tenant:ds:sync'" command="sync">
                      <el-icon><Refresh /></el-icon>结构同步
                    </el-dropdown-item>
                    <el-dropdown-item v-permission="'tenant:ds:sync'" command="plan">
                      <el-icon><View /></el-icon>迁移预演
                    </el-dropdown-item>
                    <el-dropdown-item v-permission="'tenant:ds:sync'" command="status">
                      <el-icon><InfoFilled /></el-icon>结构状态
                    </el-dropdown-item>
                    <el-dropdown-item v-permission="'tenant:ds:execute'" command="sql">
                      <el-icon><Document /></el-icon>执行 SQL
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
            <span v-else style="color: var(--el-text-color-secondary); font-size: 12px">内置不可改</span>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>

    <el-dialog v-model="dialog" :title="form.id ? '编辑数据源' : '新增数据源'" width="560px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="数据源key">
          <el-input v-model="form.dsKey" :disabled="!!form.id" placeholder="如 oa_tenant_c；租户隔离配置经该 key 绑定" />
        </el-form-item>
        <el-form-item label="所属服务">
          <el-select v-model="form.serviceName" filterable allow-create default-first-option
                     placeholder="仅该服务可注册此库；* = 所有服务通用" style="width: 100%">
            <el-option label="*（通用：所有服务）" value="*" />
            <el-option v-for="name in serviceNames" :key="name" :label="name" :value="name" />
          </el-select>
        </el-form-item>
        <el-form-item label="库模式">
          <el-radio-group v-model="form.dsMode">
            <el-radio value="shared">共享库（多租户绑定，行级隔离）</el-radio>
            <el-radio value="dedicated">独立库（一库一租户）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="数据库类型">
          <el-select v-model="form.dbType" style="width: 100%">
            <el-option label="MySQL" value="mysql" />
            <el-option label="达梦 DM" value="dm" />
            <el-option label="人大金仓" value="kingbase" />
          </el-select>
        </el-form-item>
        <el-form-item label="主机">
          <el-input v-model="form.host" placeholder="IP 或域名" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="form.port" :min="1" :max="65535" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="库名">
          <el-input v-model="form.dbName" :placeholder="form.dbType === 'dm' ? '达梦 schema（习惯大写），如 MSE_TENANT2' : 'database 名称，如 mse_tenant2'" />
        </el-form-item>
        <el-form-item label="额外参数">
          <el-input v-model="form.params" placeholder="选填；追加到 JDBC 连接串，如 useSSL=false" />
        </el-form-item>
        <el-form-item label="连接账号"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="连接密码">
          <el-input v-model="form.password" type="password" show-password
                    :placeholder="form.id ? '留空 = 保持原密码' : ''" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button icon="Link" :loading="testing" @click="testForm">测试连接</el-button>
        <el-button type="primary" @click="doSave">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="reportDialog" title="结构演进报告" width="680px">
      <pre class="report-pre">{{ reportText }}</pre>
      <template #footer>
        <el-button type="primary" @click="reportDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="statusDialog" title="结构状态" width="680px">
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="数据库类型">{{ typeLabel(status.dbType) }}</el-descriptions-item>
        <el-descriptions-item label="历史表">{{ status.historyReady ? '已建立' : '未建立（首次迁移/同步时创建）' }}</el-descriptions-item>
        <el-descriptions-item label="当前版本">{{ status.currentVersion || '—' }}</el-descriptions-item>
        <el-descriptions-item label="基线版本">{{ status.baselineVersion || '—' }}</el-descriptions-item>
      </el-descriptions>
      <template v-if="status.pending?.length">
        <div class="status-title">待执行脚本（{{ status.pending.length }}）</div>
        <div v-for="item in status.pending" :key="item" class="status-line">{{ item }}</div>
      </template>
      <template v-if="status.conflicts?.length">
        <div class="status-title status-warn">checksum 冲突（脚本已应用但内容被改动，请人工核对）</div>
        <div v-for="item in status.conflicts" :key="item" class="status-line">{{ item }}</div>
      </template>
      <template v-if="status.lastError">
        <div class="status-title status-warn">最近失败</div>
        <div class="status-line">{{ status.lastError }}</div>
      </template>
      <template #footer>
        <el-button type="primary" @click="statusDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="initDialog" title="初始化租户库" width="560px" :close-on-click-modal="false" @closed="onInitDialogClosed">
      <template v-if="!initTask.failed">
        <div class="init-running">
          <el-icon class="is-loading" :size="20"><Loading /></el-icon>
          <span>正在初始化 <b>{{ initTask.dsKey }}</b>：建库（若不存在）+「身份表 + 业务表 + base 副本」全量版本化脚本直建，全新库约 1~2 分钟。</span>
        </div>
      </template>
      <template v-else>
        <el-alert type="error" :closable="false" title="初始化失败（可修复后重新执行）" :description="initTask.message" />
      </template>
      <template #footer>
        <el-button v-if="initTask.failed" type="primary" @click="initDialog = false">关闭</el-button>
        <el-button v-else @click="initDialog = false">后台运行，关闭窗口</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchDialog" title="批量结构同步" width="820px" :close-on-click-modal="false" @closed="batchPolling = false">
      <template v-if="batchState.running">
        <div class="init-running">
          <el-icon class="is-loading" :size="20"><Loading /></el-icon>
          <span>批量同步后台执行中：已完成 <b>{{ batchState.done }}</b> / {{ batchState.total }} 个数据源，失败 <b class="status-warn">{{ batchState.failed }}</b> 个（逐库执行、失败不中断）。</span>
        </div>
      </template>
      <el-alert v-else-if="batchState.total > 0" :type="batchState.failed > 0 ? 'warning' : 'success'" :closable="false"
                :title="`批次完成：共 ${batchState.total} 个数据源，成功 ${batchState.done - batchState.failed} 个、失败 ${batchState.failed} 个`" />
      <el-table v-if="batchState.items.length" :data="batchState.items" size="small" max-height="380" style="margin-top: 10px">
        <el-table-column prop="dsKey" label="key" width="140" show-overflow-tooltip />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.status === 0" type="warning" size="small">同步中</el-tag>
            <el-tag v-else-if="row.status === 1" type="success" size="small">成功</el-tag>
            <el-tag v-else-if="row.status === 2" type="danger" size="small">失败</el-tag>
            <el-tag v-else type="info" size="small">排队</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="结果" min-width="420">
          <template #default="{ row }"><div class="report-pre">{{ row.message || '—' }}</div></template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button v-if="batchState.running" @click="batchDialog = false">后台运行，关闭窗口</el-button>
        <el-button v-else type="primary" @click="batchDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="planDialog" :title="`迁移预演（${planRow?.dsKey ?? ''}，只读）`" width="760px">
      <el-alert type="info" :closable="false" style="margin-bottom: 10px"
                title="预演与实际执行（迁移/结构同步）同一口径：以下为将要应用的脚本清单与基线判定，未执行任何语句。" />
      <template v-for="channel in planChannels" :key="channel.channel">
        <div class="status-title">{{ channel.channel }}：待执行 {{ channel.pendingCount }} 条</div>
        <template v-if="channel.pending.length">
          <div v-for="(item, idx) in channel.pending" :key="channel.channel + idx" class="status-line">{{ item }}</div>
        </template>
        <div v-else class="status-line" style="color: var(--el-text-color-secondary)">无待执行脚本（已是最新）</div>
        <template v-if="channel.conflicts.length">
          <div class="status-title status-warn">checksum 冲突（已应用脚本内容被改动，实际执行将阻断）</div>
          <div v-for="item in channel.conflicts" :key="'c' + item" class="status-line">{{ item }}</div>
        </template>
        <template v-if="channel.notes.length">
          <div class="status-title">基线/账本判定</div>
          <div v-for="note in channel.notes" :key="'n' + note" class="status-line">{{ note }}</div>
        </template>
      </template>
      <template #footer>
        <el-button type="primary" @click="planDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="sqlDialog" :title="`执行临时 SQL（${sqlRow?.dsKey ?? ''}）`" width="680px">
      <el-alert type="warning" :closable="false" style="margin-bottom: 10px"
                title="SQL 直接在目标租户库执行并记入迁移历史（ADHOC）。多条语句以分号分隔；不支持存储过程/触发器。" />
      <el-form label-width="70px">
        <el-form-item label="描述"><el-input v-model="sqlForm.description" placeholder="选填，记入历史便于追溯" /></el-form-item>
        <el-form-item label="SQL">
          <el-input v-model="sqlForm.sql" type="textarea" :rows="8" placeholder="如：ALTER TABLE xxx ADD COLUMN remark varchar(255)" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sqlDialog = false">取消</el-button>
        <el-button type="primary" :loading="sqlRunning" @click="doRunSql">执行</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/request'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../../components/RightToolbar.vue'

const showSearch = ref(true)
const rows = ref<any[]>([])
const total = ref(0)
const serviceNames = ref<string[]>([])
const query = reactive({ pageNum: 1, pageSize: 10, dsKey: '', dsMode: '', serviceName: '' })
const dialog = ref(false)
const testing = ref(false)
const form = reactive({
  id: null as number | null, dsKey: '', dsMode: 'dedicated', serviceName: '*', dbType: 'mysql', host: '', port: 3306,
  dbName: '', params: '', username: '', password: '', remark: ''
})
const reportDialog = ref(false)
const reportText = ref('')
const statusDialog = ref(false)
const status = ref<any>({})
const batchDialog = ref(false)
const batchLoading = ref(false)
/** 批量同步批次进度（轮询 /batch-sync/status 填充；running=false 表示最近批次已收尾） */
const batchState = reactive({ running: false, total: 0, done: 0, failed: 0, items: [] as any[] })
const batchPolling = ref(false)
const planDialog = ref(false)
const planRow = ref<any>(null)
const planChannels = ref<any[]>([])
const sqlDialog = ref(false)
const sqlRow = ref<any>(null)
const sqlRunning = ref(false)
const sqlForm = reactive({ sql: '', description: '' })
const initDialog = ref(false)
const initTask = reactive({ active: false, id: null as number | null, dsKey: '', failed: false, message: '' })

function typeLabel(type: string) {
  return { mysql: 'MySQL', dm: '达梦', kingbase: '金仓' }[type] ?? type
}

async function load() {
  const data = await request.get('/tenant/datasource/page', { params: query })
  rows.value = data.records
  total.value = Number(data.total)
}

function reset() {
  Object.assign(query, { pageNum: 1, dsKey: '', dsMode: '', serviceName: '' })
  load()
}

function openCreate() {
  Object.assign(form, {
    id: null, dsKey: '', dsMode: 'dedicated', serviceName: '*', dbType: 'mysql', host: '', port: 3306,
    dbName: '', params: '', username: '', password: '', remark: ''
  })
  dialog.value = true
}

function openEdit(row: any) {
  Object.assign(form, {
    id: row.id, dsKey: row.dsKey, dsMode: row.dsMode, serviceName: row.serviceName ?? '*', dbType: row.dbType,
    host: row.host, port: row.port, dbName: row.dbName, params: row.params ?? '', username: row.username,
    password: '', remark: row.remark ?? ''
  })
  dialog.value = true
}

function formPayload() {
  return {
    id: form.id, dsKey: form.dsKey, dsMode: form.dsMode, serviceName: form.serviceName || '*', dbType: form.dbType,
    host: form.host, port: form.port, dbName: form.dbName, params: form.params || null, username: form.username,
    password: form.password || null, remark: form.remark || null
  }
}

async function testForm() {
  testing.value = true
  try {
    const ms = await request.post('/tenant/datasource/test', formPayload(), { params: form.id ? { id: form.id } : {} })
    ElMessage.success(`连接成功（${ms}ms）`)
  } finally {
    testing.value = false
  }
}

async function doSave() {
  if (form.id) {
    await request.put('/tenant/datasource', formPayload())
    ElMessage.success('数据源已更新（运行时已重注册）')
  } else {
    await request.post('/tenant/datasource', formPayload())
    ElMessage.success('数据源已创建并注册')
  }
  dialog.value = false
  load()
}

async function doTest(row: any) {
  const ms = await request.post('/tenant/datasource/test', null, { params: { id: row.id } })
  ElMessage.success(`连接成功（${ms}ms）`)
}

/** 初始化（异步）：提交后台任务即返回，弹窗轮询状态直至完成/失败；关闭窗口=后台运行，列表「初始化」列可看状态 */
async function doInit(row: any) {
  if (initTask.active) {
    ElMessage.warning('已有初始化任务进行中，请等待完成')
    return
  }
  await ElMessageBox.confirm(
    `将对 ${row.host}:${row.port}/${row.dbName} 建库（若不存在）并后台执行「身份表 + 业务表 + base 副本」全量版本化脚本直建（全新库约 1~2 分钟）。幂等：仅补齐缺失表结构，不删不改已有表与数据，可重复执行。继续？`,
    '初始化租户库', { type: 'warning' }
  )
  await request.post(`/tenant/datasource/${row.id}/init`)
  Object.assign(initTask, { active: true, id: row.id, dsKey: row.dsKey, failed: false, message: '' })
  initDialog.value = true
  pollInitStatus()
}

/** 轮询初始化任务状态（2s 间隔，10 分钟上限）：1 成功提示并刷新；2 失败弹窗展示原因 */
async function pollInitStatus() {
  const started = Date.now()
  while (Date.now() - started < 10 * 60 * 1000) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    if (!initTask.active) return
    try {
      const st = await request.get(`/tenant/datasource/${initTask.id}/init-status`)
      if (st.status === 1) {
        initTask.active = false
        initDialog.value = false
        ElMessage.success(st.message || '初始化完成')
        load()
        return
      }
      if (st.status === 2) {
        Object.assign(initTask, { active: false, failed: true, message: st.message || '初始化失败' })
        load()
        return
      }
    } catch { /* 单次轮询失败忽略，下一轮重试 */ }
  }
  initTask.active = false
  initDialog.value = false
  ElMessage.warning('未在时限内收到初始化完成状态，请稍后用「结构状态」确认结果')
}

/** 进度窗口关闭即停止轮询（后台任务继续执行，列表「初始化」列/「结构状态」可看结果） */
function onInitDialogClosed() {
  initTask.active = false
}

async function doSync(row: any) {
  await ElMessageBox.confirm(
    `将连接 ${row.dbName} 应用 pending 迁移脚本${row.dbType === 'mysql' ? '并做结构比对补缺' : ''}。幂等：迁移按历史续跑，比对只增不改不删，漂移仅报告。继续？`,
    '结构同步', { type: 'warning' }
  )
  const text = await request.post(`/tenant/datasource/${row.id}/sync-schema`, null, { timeout: 300000 })
  reportText.value = text || '完成'
  reportDialog.value = true
}

async function doStatus(row: any) {
  status.value = await request.get(`/tenant/datasource/${row.id}/schema-status`)
  statusDialog.value = true
}

/** 批量同步（异步）：提交批次即返回，弹窗轮询进度直至批次收尾；关闭窗口=后台运行，列表「同步」列可看逐库状态 */
async function doBatchSync() {
  await ElMessageBox.confirm(
    '将对全部启用的租户数据源依次执行「迁移 + 结构比对同步」（后台逐库执行、失败不中断）。幂等：迁移按历史续跑，比对只增不改不删。继续？',
    '批量结构同步', { type: 'warning' }
  )
  batchLoading.value = true
  try {
    const message = await request.post('/tenant/datasource/batch-sync')
    ElMessage.success(message || '批量同步任务已提交')
    Object.assign(batchState, { running: true, total: 0, done: 0, failed: 0, items: [] })
    batchDialog.value = true
    pollBatchStatus()
  } finally {
    batchLoading.value = false
  }
}

/** 轮询批量同步批次进度（2s 间隔，10 分钟上限）：批次收尾即刷新列表；窗口关闭停止轮询（后台照常执行） */
async function pollBatchStatus() {
  batchPolling.value = true
  const started = Date.now()
  while (Date.now() - started < 10 * 60 * 1000) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    if (!batchPolling.value) return
    try {
      const st = await request.get('/tenant/datasource/batch-sync/status')
      Object.assign(batchState, { running: st.running, total: st.total, done: st.done, failed: st.failed, items: st.items || [] })
      if (!st.running && st.total > 0) {
        load()
        return
      }
    } catch { /* 单次轮询失败忽略，下一轮重试 */ }
  }
  batchPolling.value = false
  ElMessage.warning('未在时限内收到批次完成状态，请稍后刷新列表查看逐库「同步」状态')
}

/** 迁移预演（只读）：三通道将执行清单 + 冲突 + 基线判定，不执行任何语句 */
async function doPlan(row: any) {
  const data = await request.get(`/tenant/datasource/${row.id}/schema-plan`, { timeout: 120000 })
  planRow.value = row
  planChannels.value = data.channels || []
  planDialog.value = true
}

function openSql(row: any) {
  sqlRow.value = row
  Object.assign(sqlForm, { sql: '', description: '' })
  sqlDialog.value = true
}

async function doRunSql() {
  if (!sqlForm.sql.trim()) {
    ElMessage.warning('请输入 SQL')
    return
  }
  sqlRunning.value = true
  try {
    const text = await request.post(`/tenant/datasource/${sqlRow.value.id}/execute-sql`, {
      sql: sqlForm.sql, description: sqlForm.description || null
    })
    sqlDialog.value = false
    reportText.value = text || '执行成功'
    reportDialog.value = true
  } finally {
    sqlRunning.value = false
  }
}

async function toggle(row: any) {
  if (row.status === 0 && row.boundTenants > 0) {
    ElMessage.warning(`数据源已被 ${row.boundTenantNames} 绑定，请先解绑租户再停用`)
    return
  }
  await request.put(`/tenant/datasource/${row.id}/status/${row.status === 0 ? 1 : 0}`)
  load()
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确定删除数据源 ${row.dsKey}？`, '删除确认', { type: 'warning' })
  await request.delete(`/tenant/datasource/${row.id}`)
  ElMessage.success('数据源已删除')
  load()
}

/** 「更多」下拉分发：初始化/结构同步/迁移预演/结构状态/执行 SQL */
function onRowCommand(command: string, row: any) {
  if (command === 'init') doInit(row)
  else if (command === 'sync') doSync(row)
  else if (command === 'plan') doPlan(row)
  else if (command === 'status') doStatus(row)
  else if (command === 'sql') openSql(row)
}

onMounted(async () => {
  load()
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
.report-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  line-height: 1.7;
  font-family: inherit;
  max-height: 460px;
  overflow: auto;
}
.status-title {
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 6px;
}
.status-warn {
  color: var(--el-color-danger);
}
.status-line {
  font-size: 12px;
  line-height: 1.8;
  color: var(--el-text-color-regular);
}
.init-running {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  line-height: 1.7;
  color: var(--el-text-color-regular);
}
.init-running .el-icon {
  flex-shrink: 0;
  color: var(--el-color-primary);
}
</style>
