<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="关键字">
          <el-input v-model="query.keyword" placeholder="用户名 / 昵称" clearable style="width: 180px" @keyup.enter="load" />
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
          <el-button v-permission="kickCode" type="danger" icon="SwitchButton" :disabled="selected.length !== 1" @click="doKickSession(selected[0])">下线会话</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="rows" @selection-change="selected = $event">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="username" label="登录名称" width="110" />
        <el-table-column prop="nickname" label="用户昵称" width="110" />
        <el-table-column label="设备" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ (row.deviceType || 'pc').toUpperCase() }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="登录 IP" width="140">
          <template #default="{ row }">{{ row.ip || '-' }}</template>
        </el-table-column>
        <el-table-column label="浏览器 / 系统" min-width="130">
          <template #default="{ row }">{{ row.browser || '-' }} / {{ row.os || '-' }}</template>
        </el-table-column>
        <el-table-column label="登录时间" width="170">
          <template #default="{ row }">{{ formatTime(row.loginTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="kickCode" link type="danger" icon="SwitchButton" @click="doKickSession(row)">下线会话</el-button>
            <el-button v-permission="kickCode" link type="danger" icon="CircleClose" @click="doKickUser(row)">下线全部</el-button>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/request'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../../components/RightToolbar.vue'

// 双端复用：/system/online（租户内）与 /system/online/platform（世界 0，仅平台自身会话）按路由前缀切换 API 与权限码
const route = useRoute()
const platformMode = computed(() => route.path.startsWith('/platform'))
const kickCode = computed(() => platformMode.value ? 'system:online:platform-kick' : 'system:online:kick')
const pageApi = computed(() => platformMode.value ? '/system/online/platform/page' : '/system/online/page')

const showSearch = ref(true)
const rows = ref<any[]>([])
const total = ref(0)
const selected = ref<any[]>([])
const query = reactive({ pageNum: 1, pageSize: 10, keyword: '' })

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

async function load() {
  const data = await request.get(pageApi.value, {
    params: { pageNum: query.pageNum, pageSize: query.pageSize, keyword: query.keyword || undefined }
  })
  rows.value = data.records
  total.value = Number(data.total)
}

function reset() {
  Object.assign(query, { pageNum: 1, keyword: '' })
  load()
}

async function doKickSession(row: any) {
  await ElMessageBox.confirm(
    `确定下线 ${row.username} 在「${(row.deviceType || 'pc').toUpperCase()}」端的这条会话？`,
    '强制下线', { type: 'warning' })
  await request.post(kickApi('kick'), { loginType: row.loginType, tenantId: row.tenantId, userId: row.userId, sessionId: row.sessionId })
  ElMessage.success('会话已下线')
  load()
}

async function doKickUser(row: any) {
  await ElMessageBox.confirm(
    `确定将 ${row.username} 的全部登录会话强制下线？该账号所有设备将收到强制下线提示。`,
    '强制下线', { type: 'warning' })
  await request.post(kickApi('kick-user'), { loginType: row.loginType, tenantId: row.tenantId, userId: row.userId })
  ElMessage.success('该账号已全部下线')
  load()
}

function kickApi(action: string) {
  return platformMode.value ? `/system/online/platform/${action}` : `/system/online/${action}`
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
</style>
