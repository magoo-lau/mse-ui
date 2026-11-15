<template>
  <div class="page">
    <!-- 租户端非 standalone 形态：极简提示（本页仅面向离线/私部租户；SaaS/单体租户的定时任务在各业务模块内管理） -->
    <el-card v-if="formChecked && !opsView" shadow="never">
      <el-empty :image-size="90" description="任务调度仅面向私有化（离线）部署开放：租户定时任务请在各业务模块内管理" />
    </el-card>

    <template v-else-if="formChecked">
      <el-card shadow="never" class="search-card" v-show="showSearch && query.category !== 'console'">
        <el-form inline label-width="70px" @submit.prevent>
          <el-form-item label="关键词">
            <el-input v-model="query.keyword" placeholder="编号/名称/说明" clearable style="width: 220px" @keyup.enter="search" />
          </el-form-item>
          <el-form-item label="所属服务">
            <el-select v-model="query.serviceName" placeholder="全部" clearable filterable style="width: 180px" @change="search">
              <el-option v-for="s in serviceNames" :key="s" :label="s" :value="s" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" icon="Search" @click="search">搜索</el-button>
            <el-button icon="Refresh" @click="reset">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never">
        <el-alert type="info" :closable="false" style="margin-bottom: 10px"
                  title="各服务内置后台任务（统一调度中心 local 模式）按「系统任务/业务任务」分域展示：系统任务=控制面（目录扇出/权益对账/基座与自注册推送等），业务任务=各业务积木的扫描/重试/采集。清单由各服务启动时注册、任务运行后事件上报（无周期心跳，任务禁用期间零上报）；启停/编辑落库后写透 Redis 控制缓存，全域实例 5s 级收敛，触发经踢键即时抢占、恰好一个实例执行（约 5-10s 生效）。平台端另有「调度器」页签提供总览与租户并发闸门热更。生效调度统一为 cron 展示；编辑经图形化生成器修改并回填当前值，清空恢复代码默认；执行日志每任务保留最近 200 条。xxl-job 等外部调度模式的任务不经本页管理。" />

        <el-tabs v-model="query.category" @tab-change="onTabChange" class="category-tabs">
          <el-tab-pane label="系统任务" name="platform" />
          <el-tab-pane label="业务任务" name="biz" />
          <el-tab-pane v-if="IS_PLATFORM" label="调度器" name="console" />
        </el-tabs>

        <!-- 调度器页签（仅平台端）：总览 + 租户并发闸门热更 -->
        <div v-if="query.category === 'console'" class="console-wrap">
          <el-row :gutter="12">
            <el-col :span="10">
              <div class="console-card">
                <div class="console-title">总览</div>
                <el-descriptions :column="1" border size="small">
                  <el-descriptions-item label="系统任务">{{ overview.platformCount }} 项（控制面）</el-descriptions-item>
                  <el-descriptions-item label="业务任务">{{ overview.bizCount }} 项（业务域扫描）</el-descriptions-item>
                  <el-descriptions-item label="上报实例">
                    <span v-if="overview.instances.length">
                      <el-tag v-for="i in overview.instances" :key="i.service" size="small" style="margin-right: 4px">
                        {{ i.service }}（{{ fmtTime(i.reportTime) }}）</el-tag>
                    </span>
                    <span v-else>-</span>
                  </el-descriptions-item>
                  <el-descriptions-item label="调度模式">{{ overview.modes.join('、') || '-' }}</el-descriptions-item>
                  <el-descriptions-item label="线程池 / 防重">
                    <span class="form-tip">mse.scheduling.pool-size / guard-enabled：yaml 静态，重启生效</span>
                  </el-descriptions-item>
                </el-descriptions>
              </div>
            </el-col>
            <el-col :span="14">
              <div class="console-card">
                <div class="console-title">租户并发闸门（防噪声邻居：单租户占满执行资源的上限）</div>
                <el-form label-width="190px">
                  <el-form-item v-for="g in gateDefs" :key="g.key" :label="g.label">
                    <el-input-number v-model="gateForm[g.key]" :min="1" :max="64" />
                    <span class="form-tip" style="margin-left: 8px">{{ g.hint }}</span>
                  </el-form-item>
                </el-form>
                <div class="console-actions">
                  <el-button type="primary" :loading="savingSettings" v-permission="'schedule:task:edit'"
                             @click="saveSettings">保存并下发</el-button>
                  <span class="form-tip">各实例经 Redis 控制通道 5s 级差量应用；仅影响后续占用，运行中的执行不被剥夺</span>
                </div>
              </div>
            </el-col>
          </el-row>
        </div>

        <template v-else>
          <div class="table-toolbar">
            <div class="left">
              <el-checkbox v-model="autoRefresh" style="margin-right: 8px">自动刷新（15s）</el-checkbox>
            </div>
            <right-toolbar :searchable="true" :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
          </div>

          <el-table :data="rows">
            <el-table-column prop="taskKey" label="任务编号" width="200" show-overflow-tooltip />
            <el-table-column prop="taskName" label="名称" width="130" show-overflow-tooltip />
            <el-table-column label="说明" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <span>{{ row.remark || row.description || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="85" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="typeTag(row.taskType)">{{ typeLabel(row.taskType) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="生效调度(cron)" width="170" show-overflow-tooltip>
              <template #default="{ row }">
                <el-tag v-if="row.exprOverride" size="small" type="warning" style="margin-right: 4px">已覆盖</el-tag>
                <code class="cron-text">{{ row.scheduleExpr || '-' }}</code>
              </template>
            </el-table-column>
            <el-table-column label="所属服务" width="115" align="center">
              <template #default="{ row }">
                <el-tag size="small" type="primary">{{ row.ownerService || '-' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="启用" width="65" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" :active-value="1" :inactive-value="0"
                           @change="toggle(row)" v-permission="'schedule:task:toggle'" />
              </template>
            </el-table-column>
            <el-table-column label="最近执行" width="140" align="center">
              <template #default="{ row }">{{ fmtTime(row.lastRunTime) }}</template>
            </el-table-column>
            <el-table-column label="结果" width="75" align="center">
              <template #default="{ row }">
                <el-tooltip v-if="row.lastResult === 'FAILED' && row.lastError" :content="row.lastError" placement="top">
                  <el-tag size="small" type="danger">失败</el-tag>
                </el-tooltip>
                <el-tag v-else-if="row.lastResult === 'SUCCESS'" size="small" type="success">成功</el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="执行/失败" width="85" align="center">
              <template #default="{ row }">{{ row.runCount ?? 0 }} / {{ row.errorCount ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="操作" width="220" align="center" fixed="right">
              <template #default="{ row }">
                <el-button v-permission="'schedule:task:trigger'" link type="primary" icon="CaretRight"
                           @click="trigger(row)">触发</el-button>
                <el-button v-permission="'schedule:task:edit'" link type="primary" icon="Edit"
                           :disabled="row.taskType === 'STARTUP'" @click="openEdit(row)">编辑</el-button>
                <el-button link type="primary" icon="Document" @click="openLogs(row)">日志</el-button>
                <el-button link type="info" icon="View" @click="openDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
        </template>
      </el-card>

      <el-dialog v-model="editVisible" :title="`编辑任务：${editRow?.taskKey || ''}`" width="680px">
        <el-form label-width="96px">
          <el-form-item label="调度(cron)">
            <cron-input v-model="editForm.exprOverride" :preview-url="`${apiBase}/cron-preview`"
                        placeholder="Spring cron：秒 分 时 日 月 周；清空=恢复代码默认" />
            <div class="form-tip">当前生效：{{ editRow?.scheduleExpr || '-' }}{{ editRow?.exprOverride ? '（覆盖值 ' + editRow.exprOverride + '）' : '（代码默认）' }}；清空输入框并保存即恢复代码默认</div>
          </el-form-item>
          <el-form-item label="详细说明">
            <el-input v-model="editForm.remark" type="textarea" :rows="4" maxlength="1000" show-word-limit
                      placeholder="任务的详细说明：作用、扫描对象、停用影响、建议周期（落库持久，上报不覆盖）" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="editVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
        </template>
      </el-dialog>

      <el-drawer v-model="detailVisible" :title="`任务详情：${detailRow?.taskKey || ''}`" size="420px">
        <el-descriptions :column="1" border size="small" v-if="detailRow">
          <el-descriptions-item label="任务编号">{{ detailRow.taskKey }}</el-descriptions-item>
          <el-descriptions-item label="名称">{{ detailRow.taskName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ typeLabel(detailRow.taskType) }}</el-descriptions-item>
          <el-descriptions-item label="分类">{{ detailRow.taskCategory === 'platform' ? '系统任务' : '业务任务' }}</el-descriptions-item>
          <el-descriptions-item label="生效调度(cron)">
            <code class="cron-text">{{ detailRow.scheduleExpr || '-' }}</code>
          </el-descriptions-item>
          <el-descriptions-item label="调度覆盖">{{ detailRow.exprOverride || '（代码默认）' }}</el-descriptions-item>
          <el-descriptions-item label="所属服务">{{ detailRow.ownerService || '-' }}</el-descriptions-item>
          <el-descriptions-item label="调度模式">{{ detailRow.schedulerMode || '-' }}</el-descriptions-item>
          <el-descriptions-item label="详细说明">
            <div style="white-space: pre-wrap">{{ detailRow.remark || detailRow.description || '-' }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="最近执行">{{ fmtTime(detailRow.lastRunTime) }}
            <span v-if="detailRow.lastDurationMs">（{{ detailRow.lastDurationMs }}ms）</span>
          </el-descriptions-item>
          <el-descriptions-item label="最近结果">
            <span v-if="detailRow.lastResult === 'FAILED'">失败：{{ detailRow.lastError }}</span>
            <span v-else>{{ detailRow.lastResult === 'SUCCESS' ? '成功' : '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="累计执行">{{ detailRow.runCount ?? 0 }} 次（失败 {{ detailRow.errorCount ?? 0 }} 次）</el-descriptions-item>
        </el-descriptions>
      </el-drawer>

      <el-drawer v-model="logsVisible" :title="`执行日志：${logRow?.taskKey || ''}`" size="720px">
        <div class="logs-toolbar">
          <el-radio-group v-model="logQuery.result" @change="searchLogs">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="SUCCESS">成功</el-radio-button>
            <el-radio-button value="FAILED">失败</el-radio-button>
          </el-radio-group>
          <el-button icon="Refresh" circle size="small" @click="loadLogs" style="margin-left: 10px" />
        </div>
        <el-table :data="logRows" size="small" border>
          <el-table-column label="执行时间" width="160" align="center">
            <template #default="{ row }">{{ fmtTime(row.startTime) }}</template>
          </el-table-column>
          <el-table-column label="结果" width="80" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="row.result === 'SUCCESS' ? 'success' : 'danger'">
                {{ row.result === 'SUCCESS' ? '成功' : '失败' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="90" align="center">
            <template #default="{ row }">{{ row.durationMs ?? 0 }}ms</template>
          </el-table-column>
          <el-table-column label="执行实例" width="120" align="center">
            <template #default="{ row }">{{ row.serviceName || '-' }}</template>
          </el-table-column>
          <el-table-column label="错误信息" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <el-tooltip v-if="row.error" :content="row.error" placement="top">
                <span class="log-error">{{ row.error }}</span>
              </el-tooltip>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
        <pagination v-model:page="logQuery.pageNum" v-model:size="logQuery.pageSize" :total="logTotal" @change="loadLogs" />
      </el-drawer>
    </template>

    <div v-else v-loading="true" style="min-height: 200px" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../../api/request'
import RightToolbar from '../../components/RightToolbar.vue'
import { Pagination } from 'mse-ui-shared/pc'
import { CronInput } from 'mse-ui-shared/pc'
import { IS_PLATFORM } from '../../config/side'

interface ScheduleTask {
  taskKey: string
  taskName: string
  description: string | null
  taskType: string
  taskCategory: string | null
  scheduleExpr: string | null
  ownerService: string | null
  schedulerMode: string | null
  enabled: number
  exprOverride: string | null
  remark: string | null
  lastRunTime: string | null
  lastDurationMs: number | null
  lastResult: string | null
  lastError: string | null
  runCount: number | null
  errorCount: number | null
  reportTime: string | null
}

interface TaskLog {
  startTime: string | null
  durationMs: number | null
  result: string
  serviceName: string | null
  error: string | null
}

/** 双端同页（参照 system/Config）：平台端走 /tenant/schedule（直连），租户端走 /system/schedule（仅 standalone 部署存在） */
const apiBase = IS_PLATFORM ? '/tenant/schedule' : '/system/schedule'

/** 租户端形态探测：standalone 私部渲染运维页（私部租户即运维，无「调度器」页签）；SaaS/单体仅渲染一行极简提示 */
const formChecked = ref(false)
const tenantStandalone = ref(false)
const opsView = computed(() => IS_PLATFORM || tenantStandalone.value)

const showSearch = ref(true)
const rows = ref<ScheduleTask[]>([])
const total = ref(0)
const serviceNames = ref<string[]>([])
const autoRefresh = ref(true)
let timer: number | undefined
const query = reactive({ pageNum: 1, pageSize: 20, keyword: '', serviceName: '', category: 'platform' })

// ---- 调度器页签（总览 + 租户并发闸门热更） ----
// 目录 = 内置行 + 后端 gate-defs 动态合并（第三方业务积木经自有平台域种子脚本自注册：
// sys_schedule_setting 行 gates.<key>，remark=「名称（每租户）｜说明」，无需改前端）
const builtinGateDefs = [
  { key: 'data', label: '数据同步/质量（每租户）', hint: '扫描到期提交执行的上限' }
]
const gateDefs = ref([...builtinGateDefs])
const gateForm = reactive<Record<string, number>>({ data: 2 })
function ensureGateForm(key: string) {
  if (gateForm[key] === undefined) gateForm[key] = 2
}
const savingSettings = ref(false)
const overview = reactive({
  platformCount: 0,
  bizCount: 0,
  instances: [] as { service: string; reportTime: string | null }[],
  modes: [] as string[]
})

async function loadOverview() {
  const page = await request.get(`${apiBase}/page`, { params: { pageNum: 1, pageSize: 200 } })
  const records: ScheduleTask[] = page.records || []
  overview.platformCount = records.filter((r) => r.taskCategory === 'platform').length
  overview.bizCount = records.filter((r) => r.taskCategory !== 'platform').length
  const byService = new Map<string, string | null>()
  const modes = new Set<string>()
  records.forEach((r) => {
    if (r.ownerService && (!byService.has(r.ownerService) || (r.reportTime ?? '') > (byService.get(r.ownerService) ?? ''))) {
      byService.set(r.ownerService, r.reportTime)
    }
    if (r.schedulerMode) modes.add(r.schedulerMode)
  })
  overview.instances = [...byService.entries()].map(([service, reportTime]) => ({ service, reportTime }))
  overview.modes = [...modes]
}

async function loadGateDefs() {
  try {
    const defs = await request.get(`${apiBase}/settings/gate-defs`)
    const extra = Object.keys(defs || {})
      .filter((k) => k && !builtinGateDefs.some((g) => g.key === k))
      .map((k) => {
        const [name, desc] = String(defs[k] || '').split('｜')
        return { key: k, label: name || k, hint: desc || `gates.${k}` }
      })
    gateDefs.value = [...builtinGateDefs, ...extra]
    gateDefs.value.forEach((g) => ensureGateForm(g.key))
  } catch {
    // 目录接口不可用（旧后端）：保持内置三行
  }
}

async function loadSettings() {
  await loadGateDefs()
  try {
    const settings = await request.get(`${apiBase}/settings`)
    gateDefs.value.forEach((g) => {
      const raw = settings?.[`gates.${g.key}`]
      const parsed = Number.parseInt(raw, 10)
      gateForm[g.key] = Number.isFinite(parsed) && parsed >= 1 ? parsed : 2
    })
  } catch {
    // 设置未配置（空表）：保持默认展示
  }
}

async function saveSettings() {
  savingSettings.value = true
  try {
    const body: Record<string, number> = {}
    gateDefs.value.forEach((g) => { body[g.key] = gateForm[g.key] })
    const ok = await request.put(`${apiBase}/settings`, body)
    if (!ok) {
      ElMessage.error('保存失败：参数非法（上限须 ≥ 1）')
      return
    }
    ElMessage.success('已保存并写透控制通道：各实例 5s 级差量应用')
  } finally {
    savingSettings.value = false
  }
}

function onTabChange() {
  query.pageNum = 1
  if (query.category === 'console') {
    loadOverview()
    loadSettings()
  } else {
    load()
  }
}

async function load() {
  if (query.category === 'console') {
    await loadOverview()
    return
  }
  const page = await request.get(`${apiBase}/page`, {
    params: {
      ...query,
      keyword: query.keyword || undefined,
      serviceName: query.serviceName || undefined,
      category: query.category || undefined
    }
  })
  rows.value = page.records || []
  total.value = Number(page.total || 0)
  // 服务下拉选项（当前页去重并集，翻页自然补全）
  const names = new Set(serviceNames.value)
  rows.value.forEach((r) => r.ownerService && names.add(r.ownerService))
  serviceNames.value = [...names].sort()
}

function search() {
  query.pageNum = 1
  if (query.category !== 'console') load()
}

function reset() {
  query.keyword = ''
  query.serviceName = ''
  search()
}

async function toggle(row: ScheduleTask) {
  const enabled = row.enabled === 1
  const ok = await request.post(`${apiBase}/${encodeURIComponent(row.taskKey)}/toggle`, null, { params: { enabled } })
  if (!ok) {
    row.enabled = enabled ? 0 : 1
    ElMessage.warning('任务不存在（可能已随版本下线或被静态开关禁用）')
    return
  }
  ElMessage.success(`${enabled ? '已恢复' : '已暂停'}：全域实例将经 Redis 控制缓存 5s 级收敛`)
}

async function trigger(row: ScheduleTask) {
  const ok = await request.post(`${apiBase}/${encodeURIComponent(row.taskKey)}/trigger`)
  if (!ok) {
    ElMessage.warning('任务不存在（可能已随版本下线或被静态开关禁用）')
    return
  }
  ElMessage.success('已下发触发：由其中一个实例抢占执行，稍后刷新查看结果')
}

function openEdit(row: ScheduleTask) {
  editRow.value = row
  // 回填：优先覆盖值，其次当前生效 cron（以现状为起点，改完保存即建覆盖）
  editForm.exprOverride = row.exprOverride || row.scheduleExpr || ''
  editForm.remark = row.remark || ''
  editVisible.value = true
}

async function saveEdit() {
  if (!editRow.value) return
  const override = editForm.exprOverride.trim()
  if (/^\d+$/.test(override) && Number(override) < 1000) {
    ElMessage.error('调度覆盖毫秒数不得低于 1000（防误配打爆调度）')
    return
  }
  saving.value = true
  try {
    const ok = await request.put(`${apiBase}/${encodeURIComponent(editRow.value.taskKey)}`, {
      exprOverride: override || null,
      remark: editForm.remark
    })
    if (!ok) {
      ElMessage.error('保存失败：任务不存在或覆盖表达式非法（合法 cron，或清空恢复默认）')
      return
    }
    ElMessage.success('已保存：全域实例将经 Redis 控制缓存 5s 级按新调度执行')
    editVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

function openDetail(row: ScheduleTask) {
  detailRow.value = row
  detailVisible.value = true
}

function openLogs(row: ScheduleTask) {
  logRow.value = row
  logQuery.pageNum = 1
  logQuery.result = ''
  logsVisible.value = true
  loadLogs()
}

function searchLogs() {
  logQuery.pageNum = 1
  loadLogs()
}

async function loadLogs() {
  if (!logRow.value) return
  const page = await request.get(`${apiBase}/${encodeURIComponent(logRow.value.taskKey)}/logs`, {
    params: { pageNum: logQuery.pageNum, pageSize: logQuery.pageSize, result: logQuery.result || undefined }
  })
  logRows.value = page.records || []
  logTotal.value = Number(page.total || 0)
}

function typeLabel(type: string) {
  if (type === 'FIXED_DELAY') return '固定间隔'
  if (type === 'CRON') return 'cron'
  if (type === 'STARTUP') return '启动一次'
  return type
}

function typeTag(type: string) {
  if (type === 'FIXED_DELAY') return 'primary'
  if (type === 'CRON') return 'warning'
  return 'info'
}

function fmtTime(value: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 19)
}

const editVisible = ref(false)
const saving = ref(false)
const editRow = ref<ScheduleTask | null>(null)
const editForm = reactive({ exprOverride: '', remark: '' })
const detailVisible = ref(false)
const detailRow = ref<ScheduleTask | null>(null)

const logsVisible = ref(false)
const logRow = ref<ScheduleTask | null>(null)
const logRows = ref<TaskLog[]>([])
const logTotal = ref(0)
const logQuery = reactive({ pageNum: 1, pageSize: 10, result: '' })

onMounted(async () => {
  if (!IS_PLATFORM) {
    // 租户端先探形态：standalone 渲染运维页（无「调度器」页签），SaaS/单体渲染极简提示
    try {
      const factor = await request.get(`${apiBase}/form-factor`)
      tenantStandalone.value = !!(factor && factor.standalone)
    } catch {
      tenantStandalone.value = false
    }
  }
  formChecked.value = true
  if (!opsView.value) return
  await load()
  timer = window.setInterval(() => {
    if (autoRefresh.value && document.visibilityState === 'visible' && !logsVisible.value && !editVisible.value
        && query.category !== 'console') load()
  }, 15_000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<style scoped>
.category-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}

.cron-text {
  font-family: var(--el-font-family, inherit);
  font-size: 12px;
  color: var(--el-text-color-primary);
  letter-spacing: 0.5px;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  margin-top: 4px;
}

.logs-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.log-error {
  color: var(--el-color-danger);
}

.console-wrap {
  padding: 4px 0;
}

.console-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
  min-height: 320px;
}

.console-title {
  font-weight: 600;
  margin-bottom: 10px;
}

.console-actions {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
