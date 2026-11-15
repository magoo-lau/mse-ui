<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="登录账号"><el-input v-model="query.username" placeholder="请输入登录账号" clearable style="width: 180px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="登录 IP"><el-input v-model="query.ip" placeholder="请输入登录 IP" clearable style="width: 160px" @keyup.enter="load" /></el-form-item>
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
          <el-button v-permission="'system:logininfor:delete'" type="danger" icon="Delete" :disabled="!selected.length" @click="doDeleteBatch">删除</el-button>
          <el-button v-permission="'system:logininfor:delete'" type="danger" icon="DeleteFilled" @click="doClean">清空</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="rows" @selection-change="selected = $event">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="id" label="日志编号" width="200" />
        <el-table-column prop="username" label="登录账号" width="130" />
        <el-table-column prop="ip" label="登录 IP" width="140" />
        <el-table-column prop="browser" label="浏览器" width="110" />
        <el-table-column prop="os" label="操作系统" width="110" />
        <el-table-column label="登录状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 0 ? 'success' : 'danger'" size="small">{{ row.status === 0 ? '成功' : '失败' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="msg" label="提示消息" show-overflow-tooltip />
        <el-table-column label="登录时间" width="180">
          <template #default="{ row }">{{ formatTime(row.loginTime || row.createTime) }}</template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../../api/request'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../../../components/RightToolbar.vue'

const showSearch = ref(true)
const rows = ref<any[]>([])
const total = ref(0)
const selected = ref<any[]>([])
const query = reactive({ pageNum: 1, pageSize: 10, username: '', ip: '', status: '' as number | '' })

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

async function load() {
  const data = await request.get('/system/logininfor/page', { params: { ...query, status: query.status === '' ? undefined : query.status } })
  rows.value = data.records
  total.value = Number(data.total)
}

function reset() {
  Object.assign(query, { pageNum: 1, username: '', ip: '', status: '' })
  load()
}

async function doDeleteBatch() {
  await ElMessageBox.confirm(`确定删除选中的 ${selected.value.length} 条登录日志？`, '提示', { type: 'warning' })
  await request.delete(`/system/logininfor/${selected.value.map((row) => row.id).join(',')}`)
  ElMessage.success('删除成功')
  load()
}

async function doClean() {
  await ElMessageBox.confirm('确定清空当前租户全部登录日志？该操作不可恢复！', '警告', { type: 'warning' })
  await request.delete('/system/logininfor/clean')
  ElMessage.success('已清空')
  load()
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
