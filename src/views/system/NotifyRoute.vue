<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="业务来源">
          <el-select v-model="query.bizCode" placeholder="全部" clearable filterable style="width: 170px">
            <el-option v-for="s in sources" :key="s.bizCode" :label="`${s.bizCode}（${s.bizName}）`" :value="s.bizCode" />
          </el-select>
        </el-form-item>
        <el-form-item label="消息类型">
          <el-select v-model="query.msgType" placeholder="全部" clearable filterable style="width: 170px">
            <el-option v-for="t in allTypes" :key="t.code" :label="`${t.code} ${t.name}`" :value="t.code" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="load">搜索</el-button>
          <el-button icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="main-card">
      <div class="table-toolbar">
        <div class="left tip">
          通知按业务动作路由到所勾选渠道（未配置默认仅站内信）；业务来源与渠道由各业务模块动态注册，
          投递日志在「日志管理 → 通知投递日志」查看
        </div>
        <div class="right">
          <el-button v-permission="'system:notify:route:save'" type="primary" icon="Plus" @click="openSave()">新建路由</el-button>
          <el-button v-permission="'system:notify:route:save'" type="success" icon="Promotion" @click="openTest">发送测试</el-button>
          <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="loadAll" />
        </div>
      </div>

      <el-table :data="rows" v-loading="loading">
        <el-table-column label="业务来源" width="140">
          <template #default="{ row }">
            <el-tag size="small" :type="row.bizCode === '*' ? 'info' : 'primary'">{{ bizLabel(row.bizCode) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="消息类型" width="130">
          <template #default="{ row }">
            <el-tag size="small" :type="row.msgType === '*' ? 'info' : 'warning'">{{ typeLabel(row.msgType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="投递渠道" min-width="200">
          <template #default="{ row }">
            <el-tag v-for="code in split(row.channels)" :key="code" size="small" class="tag"
                    :type="channelName(code) ? 'success' : 'danger'">
              {{ channelName(code) || code + '（已失效）' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-switch :model-value="row.status === 0" @change="(v: boolean) => doToggle(row, v)" />
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
        <el-table-column prop="createTime" label="创建时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'system:notify:route:save'" link type="primary" icon="Edit" @click="openSave(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>

    <!-- 渠道总览（框架目录：登记 + 授权 + 可用三态） -->
    <el-card shadow="never" class="main-card">
      <template #header>
        <span class="pane-title">已登记渠道（框架通知中枢目录）</span>
      </template>
      <el-table :data="channels" size="small" border>
        <el-table-column prop="name" label="渠道" width="140" />
        <el-table-column prop="code" label="编码" width="100" />
        <el-table-column prop="description" label="说明" min-width="200" show-overflow-tooltip />
        <el-table-column label="接收人" width="110" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.receiverRequired ? 'primary' : 'info'">
              {{ row.receiverRequired ? '按接收人投递' : '群发（无需接收人）' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="授权" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.authorized ? 'success' : 'danger'">
              {{ row.authorized ? '已授权' : '未授权' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="可用" width="110" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.available ? 'success' : (row.authorized ? 'warning' : 'info')">
              {{ availabilityText(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="provider" label="提供方" width="110" />
      </el-table>
    </el-card>

    <!-- 新建/编辑路由 -->
    <el-dialog v-model="saveDialog" :title="saveForm.id ? '编辑路由' : '新建路由'" width="560px">
      <el-form label-width="90px">
        <el-form-item label="业务来源" required>
          <el-select v-model="saveForm.bizCode" style="width: 100%">
            <el-option label="＊ 全部业务（通配）" value="*" />
            <el-option v-for="s in sources" :key="s.bizCode" :label="`${s.bizCode}（${s.bizName}）`" :value="s.bizCode" />
          </el-select>
        </el-form-item>
        <el-form-item label="消息类型" required>
          <el-select v-model="saveForm.msgType" style="width: 100%">
            <el-option label="＊ 全部类型（通配）" value="*" />
            <el-option v-for="t in saveTypeOptions" :key="t.code" :label="`${t.code} ${t.name}`" :value="t.code" />
          </el-select>
          <div v-if="!saveTypeOptions.length" class="tip">该来源未声明消息类型（可仅用通配）</div>
        </el-form-item>
        <el-form-item label="投递渠道" required>
          <el-checkbox-group v-model="saveForm.channels">
            <el-checkbox v-for="ch in channels" :key="ch.code" :value="ch.code" :disabled="!ch.authorized">
              {{ ch.name }}
              <span v-if="!ch.authorized" class="muted">（未授权）</span>
              <span v-else-if="!ch.available" class="muted">（实例未就绪）</span>
            </el-checkbox>
          </el-checkbox-group>
          <div class="tip">未授权渠道需平台开通对应权益；同一组合可同时勾选多个渠道</div>
          <!-- Webhook 内联配置（租户级，勾选即出现；本租户全部路由共用一份地址） -->
          <div v-if="saveForm.channels.includes('webhook')" class="webhook-panel">
            <div class="pane-title">Webhook 机器人（共用一份配置）</div>
            <el-input v-model="webhookConfig.webhookUrl" clearable
                      placeholder="https://oapi.dingtalk.com/robot/send?access_token=…">
              <template #prepend>地址</template>
            </el-input>
            <el-select v-model="webhookConfig.webhookFormat" style="width: 140px; margin-top: 6px">
              <el-option label="钉钉" value="dingtalk" />
              <el-option label="企业微信" value="wecom" />
              <el-option label="飞书" value="feishu" />
            </el-select>
            <div class="tip">随路由保存生效；其他路由勾选 Webhook 时投递至同一群机器人</div>
          </div>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="saveEnabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="saveForm.remark" placeholder="如：待办同时推站内与 IM" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 发送测试 -->
    <el-dialog v-model="testDialog" title="发送测试" width="520px">
      <el-form label-width="90px">
        <el-form-item label="测试渠道" required>
          <el-checkbox-group v-model="testChannels">
            <el-checkbox v-for="ch in selectableChannels" :key="ch.code" :value="ch.code">{{ ch.name }}</el-checkbox>
          </el-checkbox-group>
          <div class="tip">向当前登录人发送一条测试通知，经框架通知中枢验证渠道连通性（群发渠道在勾选处配置地址）</div>
          <!-- Webhook 内联配置（与路由勾选处同一份租户级配置，发送前先保存） -->
          <div v-if="testChannels.includes('webhook')" class="webhook-panel">
            <div class="pane-title">Webhook 机器人（共用一份配置）</div>
            <el-input v-model="webhookConfig.webhookUrl" clearable
                      placeholder="https://oapi.dingtalk.com/robot/send?access_token=…">
              <template #prepend>地址</template>
            </el-input>
            <el-select v-model="webhookConfig.webhookFormat" style="width: 140px; margin-top: 6px">
              <el-option label="钉钉" value="dingtalk" />
              <el-option label="企业微信" value="wecom" />
              <el-option label="飞书" value="feishu" />
            </el-select>
            <div class="tip">发送前自动保存；与路由勾选处为同一份配置</div>
          </div>
        </el-form-item>
      </el-form>
      <div v-if="testResults" class="test-results">
        <div v-for="(result, code) in testResults" :key="code" class="test-result">
          <el-tag size="small" :type="result === '发送成功' ? 'success' : 'danger'">{{ channelName(String(code)) || code }}</el-tag>
          <span>{{ result }}</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="testDialog = false">关闭</el-button>
        <el-button type="primary" :loading="testing" @click="doTest">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../../api/request'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../../components/RightToolbar.vue'

interface NotifyType { code: string; name: string }
interface NotifySource { bizCode: string; bizName: string; types: NotifyType[]; providerGroup: string }
interface NotifyChannel {
  code: string; name: string; description: string; authRequired: boolean
  authorized: boolean; available: boolean; receiverRequired: boolean; provider: string
}

const showSearch = ref(true)
const loading = ref(false)
const rows = ref<any[]>([])
const total = ref(0)
const query = reactive({ pageNum: 1, pageSize: 10, bizCode: '', msgType: '' })

const sources = ref<NotifySource[]>([])
const channels = ref<NotifyChannel[]>([])

const saveDialog = ref(false)
const saving = ref(false)
const saveEnabled = ref(true)
const saveForm = ref<{ id?: string; bizCode: string; msgType: string; channels: string[]; remark?: string }>({
  bizCode: '*', msgType: '*', channels: ['inbox']
})

/** Webhook 内联配置（租户级，勾选 webhook 的路由共用；随路由保存同步提交） */
const webhookConfig = reactive({ webhookUrl: '', webhookFormat: 'dingtalk' })
const webhookLoaded = ref(false)

const testDialog = ref(false)
const testing = ref(false)
const testChannels = ref<string[]>(['inbox'])
const testResults = ref<Record<string, string> | null>(null)

/** 全部来源类型并集（筛选下拉 / 通配时的保存下拉） */
const allTypes = computed<NotifyType[]>(() => {
  const map = new Map<string, NotifyType>()
  for (const s of sources.value) {
    for (const t of s.types || []) map.set(t.code, t)
  }
  return [...map.values()]
})

/** 保存对话框类型下拉：按所选来源过滤（通配 = 全集） */
const saveTypeOptions = computed<NotifyType[]>(() => {
  if (saveForm.value.bizCode === '*') return allTypes.value
  return sources.value.find((s) => s.bizCode === saveForm.value.bizCode)?.types || []
})

/** 可勾选测试渠道（已授权） */
const selectableChannels = computed(() => channels.value.filter((ch) => ch.authorized))

const channelName = (code: string) => channels.value.find((ch) => ch.code === code)?.name || ''
const split = (csv: string | null) => (csv ? csv.split(',').filter(Boolean) : [])
const bizLabel = (code: string) => code === '*' ? '*' : (code + (bizNameOf(code) ? `（${bizNameOf(code)}）` : ''))
const bizNameOf = (code: string) => sources.value.find((s) => s.bizCode === code)?.bizName || ''
const typeLabel = (code: string) => code === '*' ? '*' : (code + (typeNameOf(code) ? ` ${typeNameOf(code)}` : ''))
const typeNameOf = (code: string) => allTypes.value.find((t) => t.code === code)?.name || ''
const availabilityText = (ch: NotifyChannel) =>
  !ch.authorized ? '待授权' : (ch.available ? '正常' : '实例未就绪')

function formatTime(value?: string) {
  if (!value) return '-'
  return String(value).replace('T', ' ').slice(0, 19)
}

async function loadSources() {
  sources.value = ((await request.get('/system/notify/source/list')) as NotifySource[]) || []
}

async function loadChannels() {
  channels.value = ((await request.get('/system/notify/channel/list')) as NotifyChannel[]) || []
}

async function load() {
  loading.value = true
  try {
    const data: any = await request.get('/system/notify/route/page', {
      params: { ...query, bizCode: query.bizCode || undefined, msgType: query.msgType || undefined }
    })
    rows.value = data.records || []
    total.value = Number(data.total || 0)
  } finally {
    loading.value = false
  }
}

function loadAll() {
  load()
  loadSources()
  loadChannels()
}

function reset() {
  query.bizCode = ''
  query.msgType = ''
  load()
}

function openSave(row?: any) {
  saveForm.value = row
    ? { id: row.id, bizCode: row.bizCode, msgType: row.msgType, channels: split(row.channels), remark: row.remark || '' }
    : { bizCode: '*', msgType: '*', channels: ['inbox'] }
  saveEnabled.value = row ? row.status === 0 : true
  if (saveForm.value.channels.includes('webhook')) {
    loadWebhookConfig()
  }
  saveDialog.value = true
}

/** 懒加载 Webhook 租户级配置（勾选 webhook / 编辑含 webhook 路由时预填，缓存一次） */
async function loadWebhookConfig() {
  if (webhookLoaded.value) return
  const data: any = await request.get('/system/notify/webhook/config')
  webhookConfig.webhookUrl = data?.webhookUrl || ''
  webhookConfig.webhookFormat = data?.webhookFormat || 'dingtalk'
  webhookLoaded.value = true
}

// 对话框内勾选 webhook 时同样懒加载预填（路由编辑与发送测试共用一份配置）
watch(() => saveForm.value.channels.includes('webhook'), (included) => {
  if (included) loadWebhookConfig()
})
watch(() => testChannels.value.includes('webhook'), (included) => {
  if (included) loadWebhookConfig()
})

/** 校验并保存 Webhook 租户级配置（路由保存/发送测试勾选 webhook 时共用）；非法返回 false */
async function saveWebhookConfigChecked(): Promise<boolean> {
  const url = webhookConfig.webhookUrl.trim()
  if (!url) {
    ElMessage.warning('勾选 Webhook 渠道须配置群机器人地址')
    return false
  }
  if (!/^https?:\/\//.test(url)) {
    ElMessage.warning('Webhook 地址必须以 http(s):// 开头')
    return false
  }
  await request.put('/system/notify/webhook/config', {
    webhookUrl: url, webhookFormat: webhookConfig.webhookFormat
  })
  return true
}

async function doSave() {
  if (!saveForm.value.channels.length) {
    ElMessage.warning('至少选择一个投递渠道')
    return
  }
  if (saveForm.value.channels.includes('webhook') && !(await saveWebhookConfigChecked())) {
    return
  }
  saving.value = true
  try {
    await request.post('/system/notify/route/save', { ...saveForm.value, status: saveEnabled.value ? 0 : 1 })
    ElMessage.success('已保存')
    saveDialog.value = false
    await load()
  } finally {
    saving.value = false
  }
}

async function doToggle(row: any, enabled: boolean) {
  await request.post('/system/notify/route/save', {
    id: row.id, bizCode: row.bizCode, msgType: row.msgType,
    channels: split(row.channels), status: enabled ? 0 : 1, remark: row.remark || ''
  })
  ElMessage.success(enabled ? '已启用' : '已停用')
  await load()
}

function openTest() {
  testResults.value = null
  testChannels.value = selectableChannels.value.length ? [selectableChannels.value[0].code] : []
  testDialog.value = true
}

async function doTest() {
  if (!testChannels.value.length) {
    ElMessage.warning('至少选择一个测试渠道')
    return
  }
  if (testChannels.value.includes('webhook') && !(await saveWebhookConfigChecked())) {
    return
  }
  testing.value = true
  try {
    testResults.value = (await request.post('/system/notify/test', { channels: testChannels.value })) as any
  } finally {
    testing.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadSources(), loadChannels(), load()])
})
</script>

<style scoped>
.main-card {
  margin-bottom: 12px;
}

.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.table-toolbar .right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag {
  margin-right: 4px;
}

.tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.pane-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.webhook-panel {
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.test-results {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.test-result {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
</style>
