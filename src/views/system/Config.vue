<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="参数名称"><el-input v-model="query.configName" placeholder="请输入参数名称" clearable style="width: 200px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="参数键名"><el-input v-model="query.configKey" placeholder="请输入参数键名" clearable style="width: 200px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="系统内置">
          <el-select v-model="query.configType" placeholder="所有" clearable style="width: 140px">
            <el-option label="是" :value="0" />
            <el-option label="否" :value="1" />
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
          <el-button v-permission="perm('create')" type="primary" icon="Plus" @click="openCreate">新增</el-button>
          <el-button v-permission="perm('update')" type="success" icon="EditPen" :disabled="selected.length !== 1" @click="openEdit(selected[0])">修改</el-button>
          <el-button v-permission="perm('delete')" type="danger" icon="Delete" :disabled="!selected.length" @click="doDeleteBatch">删除</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="rows" @selection-change="selected = $event">
        <!-- 内置参数（configType=0）不可删除：禁选，批量删除天然只含自定义参数 -->
        <el-table-column type="selection" width="50" :selectable="(row: any) => row.configType !== 0" />
        <el-table-column prop="id" label="参数主键" width="200" />
        <el-table-column prop="configName" label="参数名称" />
        <el-table-column prop="configKey" label="参数键名" />
        <el-table-column prop="configValue" label="参数键值" show-overflow-tooltip />
        <el-table-column label="系统内置" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.configType === 0 ? 'primary' : 'info'" size="small">{{ row.configType === 0 ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" show-overflow-tooltip />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="perm('update')" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
            <!-- 内置参数不可删除（后端同样拦截），只隐藏按钮不弹错误 -->
            <el-button v-if="row.configType !== 0" v-permission="perm('delete')" link type="danger" icon="Delete" @click="doDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>

    <el-dialog v-model="dialog" :title="editing ? '编辑参数' : '新增参数'" width="500px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="参数名称" prop="configName"><el-input v-model="form.configName" placeholder="请输入参数名称" /></el-form-item>
        <el-form-item label="参数键名" prop="configKey">
          <el-input v-model="form.configKey" placeholder="如 sys.user.initPassword" :disabled="editing" />
        </el-form-item>
        <el-form-item label="参数键值" prop="configValue"><el-input v-model="form.configValue" placeholder="请输入参数键值" /></el-form-item>
        <!-- 内置标识仅系统种子可设：新建固定自定义，仅编辑时展示（禁改） -->
        <el-form-item v-if="editing" label="系统内置">
          <el-radio-group v-model="form.configType" :disabled="editing">
            <el-radio :value="0">是</el-radio>
            <el-radio :value="1">否</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="doSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import request from '../../api/request'
import { IS_PLATFORM } from '../../config/side'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../../components/RightToolbar.vue'

/** 双端复用本页面：平台端走 /platform 端点组（tenant_id=0 域），权限码带 platform- 前缀 */
const apiBase = IS_PLATFORM ? '/system/config/platform' : '/system/config'
function perm(action: string) {
  return IS_PLATFORM ? `system:config:platform-${action}` : `system:config:${action}`
}

const showSearch = ref(true)
const rows = ref<any[]>([])
const total = ref(0)
const selected = ref<any[]>([])
const query = reactive({ pageNum: 1, pageSize: 10, configName: '', configKey: '', configType: '' as number | '' })
const dialog = ref(false)
const editing = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ id: 0, configName: '', configKey: '', configValue: '', configType: 1, remark: '' })
const rules: FormRules = {
  configName: [{ required: true, message: '参数名称不能为空', trigger: 'blur' }],
  configKey: [{ required: true, message: '参数键名不能为空', trigger: 'blur' }],
  configValue: [{ required: true, message: '参数键值不能为空', trigger: 'blur' }]
}

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

async function load() {
  const data = await request.get(`${apiBase}/page`, { params: { ...query, configType: query.configType === '' ? undefined : query.configType } })
  rows.value = data.records
  total.value = Number(data.total)
}

function reset() {
  Object.assign(query, { pageNum: 1, configName: '', configKey: '', configType: '' })
  load()
}

function openCreate() {
  editing.value = false
  Object.assign(form, { id: 0, configName: '', configKey: '', configValue: '', configType: 1, remark: '' })
  dialog.value = true
}

function openEdit(row: any) {
  editing.value = true
  Object.assign(form, { id: row.id, configName: row.configName, configKey: row.configKey, configValue: row.configValue, configType: row.configType, remark: row.remark })
  dialog.value = true
}

async function doSubmit() {
  await formRef.value?.validate()
  if (editing.value) {
    await request.put(apiBase, { id: form.id, configName: form.configName, configValue: form.configValue, remark: form.remark })
    ElMessage.success('保存成功')
  } else {
    await request.post(apiBase, form)
    ElMessage.success('创建成功')
  }
  dialog.value = false
  load()
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确定删除参数「${row.configName}」？`, '提示', { type: 'warning' })
  await request.delete(`${apiBase}/${row.id}`)
  ElMessage.success('删除成功')
  load()
}

async function doDeleteBatch() {
  await ElMessageBox.confirm(`确定删除选中的 ${selected.value.length} 个参数？`, '提示', { type: 'warning' })
  for (const row of selected.value) {
    await request.delete(`${apiBase}/${row.id}`)
  }
  ElMessage.success('删除成功')
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
