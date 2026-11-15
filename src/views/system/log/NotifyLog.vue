<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="业务来源"><el-input v-model="query.bizCode" placeholder="如 oa / mes" clearable style="width: 160px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="消息类型"><el-input v-model="query.msgType" placeholder="如 TODO / CC / RESULT" clearable style="width: 160px" @keyup.enter="load" /></el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="load">搜索</el-button>
          <el-button icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="left tip">消息通知经框架中枢多渠道派发的留痕：逐渠道结果与失败原因（渠道配置在各业务端维护）</div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="rows" v-loading="loading">
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column prop="bizCode" label="业务" width="90" />
        <el-table-column prop="msgType" label="类型" width="100" />
        <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
        <el-table-column prop="receiverCount" label="接收人" width="80" align="center" />
        <el-table-column label="成功渠道" min-width="110">
          <template #default="{ row }">
            <template v-if="row.okChannels">
              <el-tag v-for="c in split(row.okChannels)" :key="c" type="success" size="small" class="tag">{{ c }}</el-tag>
            </template>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="失败渠道" min-width="120">
          <template #default="{ row }">
            <template v-if="row.failChannels">
              <el-tooltip :content="row.error || '—'" placement="top">
                <span>
                  <el-tag v-for="c in split(row.failChannels)" :key="c" type="danger" size="small" class="tag">{{ c }}</el-tag>
                </span>
              </el-tooltip>
            </template>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'system:notify:log'" link type="primary" icon="View" @click="current = row; detail = true">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>

    <el-drawer v-model="detail" title="投递详情" size="460px">
      <el-descriptions :column="1" border label-width="90px">
        <el-descriptions-item label="日志编号">{{ current.id }}</el-descriptions-item>
        <el-descriptions-item label="时间">{{ formatTime(current.createTime) }}</el-descriptions-item>
        <el-descriptions-item label="业务来源">{{ current.bizCode || '-' }}</el-descriptions-item>
        <el-descriptions-item label="消息类型">{{ current.msgType || '-' }}</el-descriptions-item>
        <el-descriptions-item label="标题">{{ current.title || '-' }}</el-descriptions-item>
        <el-descriptions-item label="接收人数">{{ current.receiverCount ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="计划渠道">
          <el-tag v-for="c in split(current.channels)" :key="c" size="small" class="tag">{{ c }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="成功渠道">
          <template v-if="current.okChannels">
            <el-tag v-for="c in split(current.okChannels)" :key="c" type="success" size="small" class="tag">{{ c }}</el-tag>
          </template>
          <span v-else class="muted">—</span>
        </el-descriptions-item>
        <el-descriptions-item label="失败渠道">
          <template v-if="current.failChannels">
            <el-tag v-for="c in split(current.failChannels)" :key="c" type="danger" size="small" class="tag">{{ c }}</el-tag>
          </template>
          <span v-else class="muted">—</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="current.error" label="失败原因">
          <span class="error-text">{{ current.error }}</span>
        </el-descriptions-item>
      </el-descriptions>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import request from '../../../api/request'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../../../components/RightToolbar.vue'

const showSearch = ref(true)
const loading = ref(false)
const rows = ref<any[]>([])
const total = ref(0)
const query = reactive({ pageNum: 1, pageSize: 10, bizCode: '', msgType: '' })

const detail = ref(false)
const current = ref<any>({})

const split = (csv: string | null) => (csv ? csv.split(',').filter(Boolean) : [])

function formatTime(value?: string) {
  if (!value) return '-'
  return String(value).replace('T', ' ').slice(0, 19)
}

async function load() {
  loading.value = true
  try {
    const data: any = await request.get('/system/notify/log/page', {
      params: { ...query, bizCode: query.bizCode || undefined, msgType: query.msgType || undefined }
    })
    rows.value = data.records || []
    total.value = Number(data.total || 0)
  } finally {
    loading.value = false
  }
}

function reset() {
  query.bizCode = ''
  query.msgType = ''
  load()
}

onMounted(load)
</script>

<style scoped>
.tag {
  margin-right: 4px;
}

.muted {
  color: var(--el-text-color-secondary);
}

.tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.error-text {
  color: var(--el-color-danger);
  word-break: break-all;
}
</style>
