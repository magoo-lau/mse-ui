<template>
  <div class="page">
    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="left">
          <span class="title">登录设备</span>
          <span class="hint">同一账号在不同设备/浏览器的登录会话；被顶下线或被强制下线时会收到相应提示</span>
        </div>
        <div>
          <el-button type="danger" icon="SwitchButton" :disabled="otherCount === 0" @click="doLogoutOthers">下线其他设备</el-button>
          <el-button icon="Refresh" @click="load">刷新</el-button>
        </div>
      </div>

      <el-table :data="rows" v-loading="loading">
        <el-table-column label="本机" width="70" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.current" type="success" size="small">当前</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="设备" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ (row.deviceType || 'pc').toUpperCase() }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="登录 IP" width="150">
          <template #default="{ row }">{{ row.ip || '-' }}</template>
        </el-table-column>
        <el-table-column label="浏览器 / 系统" min-width="150">
          <template #default="{ row }">{{ row.browser || '-' }} / {{ row.os || '-' }}</template>
        </el-table-column>
        <el-table-column label="登录时间" width="170">
          <template #default="{ row }">{{ formatTime(row.loginTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button v-if="!row.current" link type="danger" icon="SwitchButton" @click="doLogout(row)">下线</el-button>
            <span v-else class="hint">-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/request'

interface SessionItem {
  sessionId: string
  deviceType: string
  ip: string
  browser: string
  os: string
  loginTime: string
  current: boolean
}

const rows = ref<SessionItem[]>([])
const loading = ref(false)
const otherCount = computed(() => rows.value.filter((r) => !r.current).length)

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

async function load() {
  loading.value = true
  try {
    rows.value = await request.get('/auth/session/list')
  } finally {
    loading.value = false
  }
}

async function doLogout(row: SessionItem) {
  await ElMessageBox.confirm(
    `确定下线该会话？（${(row.deviceType || 'pc').toUpperCase()} · ${row.ip || '-'}）`,
    '下线登录设备', { type: 'warning' })
  await request.post('/auth/session/logout', { sessionId: row.sessionId })
  ElMessage.success('已下线')
  load()
}

async function doLogoutOthers() {
  await ElMessageBox.confirm(`确定下线其他 ${otherCount.value} 个会话？仅保留当前设备。`, '下线其他设备', { type: 'warning' })
  await request.post('/auth/session/logout-others')
  ElMessage.success('其他设备已下线')
  load()
}

onMounted(load)
</script>

<style scoped>
.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.title {
  font-weight: bold;
  margin-right: 10px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
