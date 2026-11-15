<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="字典名称"><el-input v-model="query.dictName" placeholder="请输入字典名称" clearable style="width: 200px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="字典类型">
          <el-select v-model="query.dictType" filterable clearable placeholder="请选择字典类型" style="width: 200px" @change="load">
            <el-option v-for="t in typeOptions" :key="t.dictType" :label="`${t.dictName}（${t.dictType}）`" :value="t.dictType" />
          </el-select>
        </el-form-item>
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
          <el-button v-permission="'system:dict:create'" type="primary" icon="Plus" @click="openCreate">新增</el-button>
          <el-button v-permission="'system:dict:update'" type="success" icon="EditPen" :disabled="selected.length !== 1" @click="openEdit(selected[0])">修改</el-button>
          <el-button v-permission="'system:dict:delete'" type="danger" icon="Delete" :disabled="!selected.length" @click="doDeleteBatch">删除</el-button>
          <el-button icon="Refresh" @click="refreshCache">刷新缓存</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="rows" @selection-change="selected = $event">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="id" label="字典主键" width="200" />
        <el-table-column prop="dictName" label="字典名称" />
        <el-table-column prop="dictType" label="字典类型">
          <template #default="{ row }">
            <el-link type="primary" @click="goData(row)">{{ row.dictType }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.status" :active-value="0" :inactive-value="1" :disabled="!canUpdate" @change="toggleStatus(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" show-overflow-tooltip />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'system:dict:update'" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
            <el-button v-permission="'system:dict:list'" link type="primary" icon="List" @click="goData(row)">列表</el-button>
            <el-button v-permission="'system:dict:delete'" link type="danger" icon="Delete" @click="doDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>

    <el-dialog v-model="dialog" :title="editing ? '编辑字典类型' : '新增字典类型'" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="字典名称" prop="dictName"><el-input v-model="form.dictName" placeholder="请输入字典名称" /></el-form-item>
        <el-form-item label="字典类型" prop="dictType">
          <el-input v-model="form.dictType" placeholder="如 sys_user_sex" :disabled="editing" />
        </el-form-item>
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
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import request from '../../api/request'
import { useDictStore } from '../../stores/dict'
import { useUserStore } from '../../stores/user'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../../components/RightToolbar.vue'

const router = useRouter()
const dictStore = useDictStore()
const userStore = useUserStore()
const normalDisable = ref<any[]>([])
const showSearch = ref(true)
const rows = ref<any[]>([])
const total = ref(0)
const selected = ref<any[]>([])
const query = reactive({ pageNum: 1, pageSize: 10, dictName: '', dictType: '', status: '' as number | '' })
const dialog = ref(false)
const editing = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ id: 0, dictName: '', dictType: '', status: '0', remark: '' })
const rules: FormRules = {
  dictName: [{ required: true, message: '字典名称不能为空', trigger: 'blur' }],
  dictType: [{ required: true, message: '字典类型不能为空', trigger: 'blur' }]
}
const canUpdate = computed(() => userStore.hasPermission('system:dict:update'))

/** 字典类型筛选下拉（与 DictData 子页同源；一次性拉取，编辑新建表单仍按原样手输编码） */
const typeOptions = ref<any[]>([])

async function loadTypeOptions() {
  try {
    const data = await request.get('/system/dict/type/page', { params: { pageNum: 1, pageSize: 200 } })
    typeOptions.value = data.records || []
  } catch {
    typeOptions.value = []
  }
}

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

async function load() {
  const data = await request.get('/system/dict/type/page', { params: { ...query, status: query.status === '' ? undefined : query.status } })
  rows.value = data.records
  total.value = Number(data.total)
}

function reset() {
  Object.assign(query, { pageNum: 1, dictName: '', dictType: '', status: '' })
  load()
}

function goData(row: any) {
  dictStore.clearDict(row.dictType)
  router.push(`/system/dict-data/${row.dictType}`)
}

function refreshCache() {
  dictStore.clearDict()
  ElMessage.success('字典缓存已刷新')
}

function openCreate() {
  editing.value = false
  Object.assign(form, { id: 0, dictName: '', dictType: '', status: '0', remark: '' })
  dialog.value = true
}

function openEdit(row: any) {
  editing.value = true
  Object.assign(form, { id: row.id, dictName: row.dictName, dictType: row.dictType, status: String(row.status), remark: row.remark })
  dialog.value = true
}

async function doSubmit() {
  await formRef.value?.validate()
  const payload = { ...form, status: Number(form.status) }
  if (editing.value) {
    await request.put('/system/dict/type', payload)
    dictStore.clearDict(form.dictType)
    ElMessage.success('保存成功')
  } else {
    await request.post('/system/dict/type', payload)
    ElMessage.success('创建成功')
  }
  dialog.value = false
  load()
}

async function toggleStatus(row: any) {
  try {
    await request.put('/system/dict/type', { id: row.id, dictName: row.dictName, dictType: row.dictType, status: row.status })
    dictStore.clearDict(row.dictType)
    ElMessage.success(row.status === 0 ? '已启用' : '已停用')
  } catch {
    row.status = row.status === 0 ? 1 : 0
  }
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确定删除字典「${row.dictName}」？`, '提示', { type: 'warning' })
  try {
    await request.delete(`/system/dict/type/${row.id}`)
  } catch {
    return
  }
  ElMessage.success('删除成功')
  load()
}

async function doDeleteBatch() {
  await ElMessageBox.confirm(`确定删除选中的 ${selected.value.length} 个字典类型？`, '提示', { type: 'warning' })
  for (const row of selected.value) {
    await request.delete(`/system/dict/type/${row.id}`).catch(() => {})
  }
  ElMessage.success('删除完成')
  load()
}

onMounted(async () => {
  normalDisable.value = await dictStore.getDict('sys_normal_disable')
  load()
  loadTypeOptions()
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
.dict-link {
  color: var(--el-color-primary);
  text-decoration: none;
}
.dict-link:hover {
  text-decoration: underline;
}
</style>
