<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="岗位编码"><el-input v-model="query.postCode" placeholder="请输入岗位编码" clearable style="width: 200px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="岗位名称"><el-input v-model="query.postName" placeholder="请输入岗位名称" clearable style="width: 200px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="所有" clearable style="width: 160px">
            <el-option v-for="d in normalDisable" :key="d.dictValue" :label="d.dictLabel" :value="d.dictValue" />
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
          <el-button v-permission="'system:post:create'" type="primary" icon="Plus" @click="openCreate">新增</el-button>
          <el-button v-permission="'system:post:update'" type="success" icon="EditPen" :disabled="selected.length !== 1" @click="openEdit(selected[0])">修改</el-button>
          <el-button v-permission="'system:post:delete'" type="danger" icon="Delete" :disabled="!selected.length" @click="doDeleteBatch">删除</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="rows" @selection-change="selected = $event">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="id" label="岗位编号" width="200" />
        <el-table-column prop="postCode" label="岗位编码" />
        <el-table-column prop="postName" label="岗位名称" />
        <el-table-column prop="postSort" label="显示顺序" width="100" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.status" :active-value="0" :inactive-value="1"
                       :disabled="!canUpdate" @change="toggleStatus(row)" />
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'system:post:update'" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
            <el-button v-permission="'system:post:delete'" link type="danger" icon="Delete" @click="doDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>

    <el-dialog v-model="dialog" :title="editing ? '编辑岗位' : '新增岗位'" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="岗位名称" prop="postName"><el-input v-model="form.postName" placeholder="请输入岗位名称" /></el-form-item>
        <el-form-item label="岗位编码" prop="postCode"><el-input v-model="form.postCode" placeholder="请输入岗位编码" /></el-form-item>
        <el-form-item label="显示顺序" prop="postSort"><el-input-number v-model="form.postSort" :min="0" /></el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio v-for="d in normalDisable" :key="d.dictValue" :value="d.dictValue">{{ d.dictLabel }}</el-radio>
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
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import request from '../../api/request'
import { useDictStore } from '../../stores/dict'
import { useUserStore } from '../../stores/user'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../../components/RightToolbar.vue'

const dictStore = useDictStore()
const userStore = useUserStore()
const normalDisable = ref<any[]>([])
const canUpdate = computed(() => userStore.hasPermission('system:post:update'))

const showSearch = ref(true)
const rows = ref<any[]>([])
const total = ref(0)
const selected = ref<any[]>([])
const query = reactive({ pageNum: 1, pageSize: 10, postCode: '', postName: '', status: '' as number | '' })
const dialog = ref(false)
const editing = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ id: 0, postCode: '', postName: '', postSort: 0, status: '0', remark: '' })
const rules: FormRules = {
  postName: [{ required: true, message: '岗位名称不能为空', trigger: 'blur' }],
  postCode: [{ required: true, message: '岗位编码不能为空', trigger: 'blur' }]
}

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

async function load() {
  const data = await request.get('/system/post/page', { params: { ...query, status: query.status === '' ? undefined : query.status } })
  rows.value = data.records
  total.value = Number(data.total)
}

function reset() {
  Object.assign(query, { pageNum: 1, postCode: '', postName: '', status: '' })
  load()
}

function openCreate() {
  editing.value = false
  Object.assign(form, { id: 0, postCode: '', postName: '', postSort: 0, status: '0', remark: '' })
  dialog.value = true
}

function openEdit(row: any) {
  editing.value = true
  Object.assign(form, { id: row.id, postCode: row.postCode, postName: row.postName, postSort: row.postSort, status: String(row.status), remark: row.remark })
  dialog.value = true
}

async function doSubmit() {
  await formRef.value?.validate()
  const payload = { ...form, status: Number(form.status) }
  if (editing.value) {
    await request.put('/system/post', payload)
    ElMessage.success('保存成功')
  } else {
    await request.post('/system/post', payload)
    ElMessage.success('创建成功')
  }
  dialog.value = false
  load()
}

async function toggleStatus(row: any) {
  try {
    await request.put('/system/post', { id: row.id, postCode: row.postCode, postName: row.postName, postSort: row.postSort, status: row.status })
    ElMessage.success(row.status === 0 ? '已启用' : '已停用')
  } catch {
    row.status = row.status === 0 ? 1 : 0
  }
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确定删除岗位「${row.postName}」？`, '提示', { type: 'warning' })
  await request.delete(`/system/post/${row.id}`)
  ElMessage.success('删除成功')
  load()
}

async function doDeleteBatch() {
  await ElMessageBox.confirm(`确定删除选中的 ${selected.value.length} 个岗位？`, '提示', { type: 'warning' })
  for (const row of selected.value) {
    await request.delete(`/system/post/${row.id}`)
  }
  ElMessage.success('删除成功')
  load()
}

onMounted(async () => {
  normalDisable.value = await dictStore.getDict('sys_normal_disable')
  load()
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
</style>
