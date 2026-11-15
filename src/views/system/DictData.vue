<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="字典类型">
          <el-select v-model="query.dictType" filterable style="width: 220px" @change="load">
            <el-option v-for="t in types" :key="t.dictType" :label="`${t.dictName}（${t.dictType}）`" :value="t.dictType" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据标签"><el-input v-model="query.dictLabel" placeholder="请输入数据标签" clearable style="width: 180px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="所有" clearable style="width: 140px">
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
          <el-button icon="Back" @click="router.back()">返回</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="rows" @selection-change="selected = $event">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="id" label="数据主键" width="200" />
        <el-table-column prop="dictLabel" label="数据标签">
          <template #default="{ row }">
            <el-tag :type="tagType(row.listClass)" size="small">{{ row.dictLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="dictValue" label="数据键值" />
        <el-table-column prop="dictSort" label="显示顺序" width="100" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.status" :active-value="0" :inactive-value="1" :disabled="!canUpdate" @change="toggleStatus(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" show-overflow-tooltip />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'system:dict:update'" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
            <el-button v-permission="'system:dict:delete'" link type="danger" icon="Delete" @click="doDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>

    <el-dialog v-model="dialog" :title="editing ? '编辑字典数据' : '新增字典数据'" width="500px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="字典类型">
          <el-select v-model="form.dictType" filterable style="width: 100%">
            <el-option v-for="t in types" :key="t.dictType" :label="`${t.dictName}（${t.dictType}）`" :value="t.dictType" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据标签" prop="dictLabel"><el-input v-model="form.dictLabel" placeholder="如：男" /></el-form-item>
        <el-form-item label="数据键值" prop="dictValue"><el-input v-model="form.dictValue" placeholder="如：0" /></el-form-item>
        <el-form-item label="显示顺序" prop="dictSort"><el-input-number v-model="form.dictSort" :min="0" /></el-form-item>
        <el-form-item label="标签样式">
          <el-select v-model="form.listClass" clearable placeholder="默认" style="width: 100%">
            <el-option v-for="c in LIST_CLASSES" :key="c.value" :label="c.label" :value="c.value" />
          </el-select>
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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import request from '../../api/request'
import { useDictStore } from '../../stores/dict'
import { useUserStore } from '../../stores/user'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../../components/RightToolbar.vue'

const LIST_CLASSES = [
  { label: '默认（default）', value: 'default' },
  { label: '主要（primary）', value: 'primary' },
  { label: '成功（success）', value: 'success' },
  { label: '信息（info）', value: 'info' },
  { label: '警告（warning）', value: 'warning' },
  { label: '危险（danger）', value: 'danger' }
]

const route = useRoute()
const router = useRouter()
const dictStore = useDictStore()
const userStore = useUserStore()
const normalDisable = ref<any[]>([])
const types = ref<any[]>([])
const showSearch = ref(true)
const rows = ref<any[]>([])
const total = ref(0)
const selected = ref<any[]>([])
const query = reactive({ pageNum: 1, pageSize: 10, dictType: '', dictLabel: '', status: '' as number | '' })
const dialog = ref(false)
const editing = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ id: 0, dictType: '', dictLabel: '', dictValue: '', dictSort: 0, listClass: '', status: '0', remark: '' })
const rules: FormRules = {
  dictLabel: [{ required: true, message: '数据标签不能为空', trigger: 'blur' }],
  dictValue: [{ required: true, message: '数据键值不能为空', trigger: 'blur' }]
}
const canUpdate = computed(() => userStore.hasPermission('system:dict:update'))

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

function tagType(listClass: string | null) {
  const allowed = ['primary', 'success', 'info', 'warning', 'danger']
  return allowed.includes(listClass || '') ? (listClass as any) : 'info'
}

/** 字典类型下拉：有管理权限拉全量分页，否则退化为当前路由类型 */
async function loadTypes() {
  try {
    const data = await request.get('/system/dict/type/page', { params: { pageNum: 1, pageSize: 200 } })
    types.value = data.records
  } catch {
    types.value = query.dictType ? [{ dictType: query.dictType, dictName: query.dictType }] : []
  }
}

async function load() {
  if (!query.dictType) return
  const data = await request.get('/system/dict/data/page', { params: { ...query, status: query.status === '' ? undefined : query.status } })
  rows.value = data.records
  total.value = Number(data.total)
}

function reset() {
  Object.assign(query, { pageNum: 1, dictLabel: '', status: '' })
  load()
}

function openCreate() {
  editing.value = false
  Object.assign(form, { id: 0, dictType: query.dictType, dictLabel: '', dictValue: '', dictSort: 0, listClass: '', status: '0', remark: '' })
  dialog.value = true
}

function openEdit(row: any) {
  editing.value = true
  Object.assign(form, {
    id: row.id, dictType: row.dictType, dictLabel: row.dictLabel, dictValue: row.dictValue,
    dictSort: row.dictSort, listClass: row.listClass || '', status: String(row.status), remark: row.remark
  })
  dialog.value = true
}

async function doSubmit() {
  await formRef.value?.validate()
  const payload = {
    id: form.id, dictType: form.dictType, dictLabel: form.dictLabel, dictValue: form.dictValue,
    dictSort: form.dictSort, listClass: form.listClass || null,
    isDefault: false, status: Number(form.status), remark: form.remark
  }
  if (editing.value) {
    await request.put('/system/dict/data', payload)
    ElMessage.success('保存成功')
  } else {
    await request.post('/system/dict/data', payload)
    ElMessage.success('创建成功')
  }
  dictStore.clearDict(form.dictType)
  dialog.value = false
  load()
}

async function toggleStatus(row: any) {
  try {
    await request.put('/system/dict/data', {
      id: row.id, dictType: row.dictType, dictLabel: row.dictLabel, dictValue: row.dictValue,
      dictSort: row.dictSort, listClass: row.listClass, isDefault: false, status: row.status, remark: row.remark
    })
    dictStore.clearDict(row.dictType)
    ElMessage.success(row.status === 0 ? '已启用' : '已停用')
  } catch {
    row.status = row.status === 0 ? 1 : 0
  }
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确定删除数据「${row.dictLabel}」？`, '提示', { type: 'warning' })
  await request.delete(`/system/dict/data/${row.id}`)
  dictStore.clearDict(row.dictType)
  ElMessage.success('删除成功')
  load()
}

async function doDeleteBatch() {
  await ElMessageBox.confirm(`确定删除选中的 ${selected.value.length} 条字典数据？`, '提示', { type: 'warning' })
  for (const row of selected.value) {
    await request.delete(`/system/dict/data/${row.id}`)
  }
  dictStore.clearDict(query.dictType)
  ElMessage.success('删除成功')
  load()
}

watch(() => route.params.dictType, (value) => {
  if (value) {
    query.dictType = String(value)
    loadTypes()
    load()
  }
})

onMounted(async () => {
  normalDisable.value = await dictStore.getDict('sys_normal_disable')
  query.dictType = String(route.params.dictType || '')
  await loadTypes()
  if (!types.value.some((t) => t.dictType === query.dictType) && types.value.length) {
    query.dictType = types.value[0].dictType
  }
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
