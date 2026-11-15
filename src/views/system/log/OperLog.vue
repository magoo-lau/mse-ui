<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="系统模块"><el-input v-model="query.module" placeholder="按代码模糊匹配，如 system:user" clearable style="width: 200px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="操作人员"><el-input v-model="query.operUsername" placeholder="请输入操作账号" clearable style="width: 160px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="query.operType" placeholder="所有" clearable style="width: 130px">
            <el-option v-for="t in OPER_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="所有" clearable style="width: 130px">
            <el-option label="成功" :value="0" />
            <el-option label="失败" :value="1" />
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
          <el-button v-permission="'system:operlog:delete'" type="danger" icon="Delete" :disabled="!selected.length" @click="doDeleteBatch">删除</el-button>
          <el-button v-permission="'system:operlog:delete'" type="danger" icon="DeleteFilled" @click="doClean">清空</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="rows" @selection-change="selected = $event">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="id" label="日志编号" width="200" />
        <el-table-column label="系统模块" width="130">
          <template #default="{ row }">{{ moduleLabel(row.module) }}</template>
        </el-table-column>
        <el-table-column prop="operType" label="操作类型" width="90" align="center" />
        <el-table-column label="操作人员" width="130">
          <template #default="{ row }">{{ row.operUsername || '-' }}</template>
        </el-table-column>
        <el-table-column prop="operIp" label="操作 IP" width="130" />
        <el-table-column label="操作地点" width="110">
          <template #default>{{ '内网' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 0 ? 'success' : 'danger'" size="small">{{ row.status === 0 ? '成功' : '失败' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="消耗时间" width="90" align="center">
          <template #default="{ row }">{{ row.costMs != null ? row.costMs + ' ms' : '-' }}</template>
        </el-table-column>
        <el-table-column label="操作时间" width="180">
          <template #default="{ row }">{{ formatTime(row.operTime || row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'system:operlog:list'" link type="primary" icon="View" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>

    <el-drawer v-model="detail" title="操作日志详情" size="480px">
      <el-descriptions :column="1" border label-width="90px" class="detail-descriptions">
        <el-descriptions-item label="日志编号">{{ current.id }}</el-descriptions-item>
        <el-descriptions-item label="系统模块">
          {{ moduleLabel(current.module) }}<span v-if="current.module && moduleLabels[current.module]" class="module-code">（{{ current.module }}）</span>
        </el-descriptions-item>
        <el-descriptions-item label="操作类型">{{ current.operType || '-' }}</el-descriptions-item>
        <el-descriptions-item label="操作方法">{{ current.method }}</el-descriptions-item>
        <el-descriptions-item label="请求地址">{{ current.operUrl }}</el-descriptions-item>
        <el-descriptions-item label="请求方式">{{ current.requestMethod }}</el-descriptions-item>
        <el-descriptions-item label="操作人员">{{ current.operUsername || '-' }}（{{ current.operUserId ?? '-' }}）</el-descriptions-item>
        <el-descriptions-item label="操作 IP">{{ current.operIp }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="current.status === 0 ? 'success' : 'danger'" size="small">{{ current.status === 0 ? '成功' : '失败' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="消耗时间">{{ current.costMs != null ? current.costMs + ' ms' : '-' }}</el-descriptions-item>
        <el-descriptions-item label="操作时间">{{ formatTime(current.operTime || current.createTime) }}</el-descriptions-item>
        <el-descriptions-item v-if="current.errorMsg" label="错误消息">
          <span class="error-text">{{ current.errorMsg }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="请求参数">
          <pre class="param-pre">{{ prettyParam }}</pre>
        </el-descriptions-item>
      </el-descriptions>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../../api/request'
import { useDictStore } from '../../../stores/dict'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../../../components/RightToolbar.vue'

const OPER_TYPES = ['新增', '修改', '删除', '导入', '导出', '重置密码']

/** 系统模块翻译：@OperLog(module) 落库为代码（system:user 等），显示经 sys_oper_module 字典翻译，未登记回退原代码 */
const dictStore = useDictStore()
const moduleLabels = ref<Record<string, string>>({})
function moduleLabel(code?: string) {
  if (!code) return '-'
  return moduleLabels.value[code] || code
}

const showSearch = ref(true)
const rows = ref<any[]>([])
const total = ref(0)
const selected = ref<any[]>([])
const query = reactive({ pageNum: 1, pageSize: 10, module: '', operUsername: '', operType: '', status: '' as number | '' })
const detail = ref(false)
const current = ref<any>({})

const prettyParam = computed(() => {
  try {
    return JSON.stringify(JSON.parse(current.value.operParam || '{}'), null, 2)
  } catch {
    return current.value.operParam || '-'
  }
})

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

async function load() {
  const data = await request.get('/system/operlog/page', { params: { ...query, status: query.status === '' ? undefined : query.status } })
  rows.value = data.records
  total.value = Number(data.total)
}

function reset() {
  Object.assign(query, { pageNum: 1, module: '', operUsername: '', operType: '', status: '' })
  load()
}

function openDetail(row: any) {
  current.value = row
  detail.value = true
}

async function doDeleteBatch() {
  await ElMessageBox.confirm(`确定删除选中的 ${selected.value.length} 条操作日志？`, '提示', { type: 'warning' })
  await request.delete(`/system/operlog/${selected.value.map((row) => row.id).join(',')}`)
  ElMessage.success('删除成功')
  load()
}

async function doClean() {
  await ElMessageBox.confirm('确定清空当前租户全部操作日志？该操作不可恢复！', '警告', { type: 'warning' })
  await request.delete('/system/operlog/clean')
  ElMessage.success('已清空')
  load()
}

onMounted(async () => {
  load()
  const list = await dictStore.getDict('sys_oper_module')
  moduleLabels.value = Object.fromEntries(list.map((item) => [item.dictValue, item.dictLabel]))
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
.detail-descriptions :deep(.el-descriptions__table) {
  /* 请求参数等超长内容会把自动布局的标签列挤成竖排，固定布局 + label-width 锁死标签列宽 */
  table-layout: fixed;
}
.param-pre {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
.error-text {
  color: var(--el-color-danger);
}
.module-code {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
