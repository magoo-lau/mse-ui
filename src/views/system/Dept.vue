<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="部门名称"><el-input v-model="query.name" placeholder="请输入部门名称" clearable style="width: 220px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="部门状态">
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
          <el-button v-permission="createCode" type="primary" icon="Plus" @click="openCreate(0)">新增部门</el-button>
          <el-button icon="Sort" @click="toggleExpand">{{ expanded ? '折叠' : '展开' }}</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="tableRows" row-key="id" border :default-expand-all="expanded" :key="expandKey"
                :tree-props="{ children: 'children' }">
        <el-table-column prop="name" label="部门名称" min-width="200" />
        <el-table-column label="负责人" width="120">
          <template #default="{ row }">{{ row.leaderName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 0 ? 'success' : 'danger'" size="small">{{ row.status === 0 ? '正常' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="createCode" link type="primary" icon="Plus" @click="openCreate(row.id)">加子部门</el-button>
            <el-button v-permission="updateCode" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
            <el-button v-permission="deleteCode" link type="danger" icon="Delete" @click="doDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialog" :title="editing ? '编辑部门' : '新增部门'" width="440px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="部门名称"><el-input v-model="form.name" placeholder="请输入部门名称" /></el-form-item>
        <el-form-item v-if="!editing" label="父部门"><el-input :model-value="parentName" disabled /></el-form-item>
        <el-form-item label="显示排序"><el-input-number v-model="form.sort" :min="0" /></el-form-item>
        <el-form-item label="部门状态">
          <el-radio-group v-model="form.status">
            <el-radio v-for="d in normalDisable" :key="d.dictValue" :value="d.dictValue">{{ d.dictLabel }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="form.leaderUserId" placeholder="未设置" clearable filterable remote
                     :remote-method="searchLeaders" :loading="leaderLoading" style="width: 100%">
            <el-option v-for="u in leaderOptions" :key="u.id" :label="`${u.nickname || u.username}（${u.username}）`" :value="u.id" />
          </el-select>
        </el-form-item>
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
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/request'
import { useDictStore } from '../../stores/dict'
import RightToolbar from '../../components/RightToolbar.vue'

const route = useRoute()
const dictStore = useDictStore()
const normalDisable = ref<any[]>([])
const showSearch = ref(true)
const platformMode = computed(() => route.path.startsWith('/platform'))
const base = computed(() => platformMode.value ? '/system/dept/platform' : '/system/dept')
const createCode = computed(() => platformMode.value ? 'system:dept:platform-create' : 'system:dept:create')
const updateCode = computed(() => platformMode.value ? 'system:dept:platform-update' : 'system:dept:update')
const deleteCode = computed(() => platformMode.value ? 'system:dept:platform-delete' : 'system:dept:delete')

const tree = ref<any[]>([])
const tableRows = ref<any[]>([])
const query = reactive({ name: '', status: '' as number | '' })
const expanded = ref(true)
// el-table 树表展开状态在数据替换后不可控，改 key 强制以 default-expand-all 重建
const expandKey = ref(0)
const dialog = ref(false)
const editing = ref(false)
const parentName = ref('根部门')
const form = reactive({ id: 0, parentId: 0, name: '', sort: 0, status: '0', leaderUserId: null as number | null })
const leaderOptions = ref<any[]>([])
const leaderLoading = ref(false)

/** 负责人候选：本域启用用户远程搜索（平台端走 platform/page） */
async function searchLeaders(keyword: string) {
  leaderLoading.value = true
  try {
    const url = platformMode.value ? '/system/user/platform/page' : '/system/user/page'
    const data = await request.get(url, { params: { pageNum: 1, pageSize: 50, username: keyword || undefined, status: 0 } })
    const records = data.records || []
    // 当前负责人不在候选页时补入，保证回显有 label
    if (form.leaderUserId && !records.some((u: any) => u.id === form.leaderUserId)) {
      const cur = leaderOptions.value.find((u) => u.id === form.leaderUserId)
      if (cur) records.unshift(cur)
    }
    leaderOptions.value = records
  } finally {
    leaderLoading.value = false
  }
}

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

/** 后端 DeptTreeNode({dept, children, leaderName}) → el-table 树行 */
function toRows(nodes: any[]): any[] {
  return (nodes || []).map((n) => ({
    id: n.dept?.id ?? n.id,
    name: n.dept?.name ?? n.name,
    sort: n.dept?.sort ?? n.sort,
    status: n.dept?.status ?? n.status,
    createTime: n.dept?.createTime ?? n.createTime,
    leaderUserId: n.dept?.leaderUserId ?? null,
    leaderName: n.leaderName ?? '',
    children: toRows(n.children || [])
  }))
}

async function load() {
  tree.value = await request.get(`${base.value}/tree`)
  let rows = toRows(tree.value)
  const keyword = query.name.trim()
  const statusFilter = query.status === '' ? null : query.status
  if (keyword || statusFilter != null) {
    // 过滤保留命中节点的祖先链（树表语义）
    const keep = (nodes: any[]): any[] => nodes
      .map((node) => {
        const children = keep(node.children || [])
        const hit = (!keyword || node.name.includes(keyword)) && (statusFilter == null || node.status === statusFilter)
        return hit || children.length ? { ...node, children } : null
      })
      .filter(Boolean) as any[]
    rows = keep(rows)
  }
  tableRows.value = rows
}

function reset() {
  Object.assign(query, { name: '', status: '' })
  load()
}

function toggleExpand() {
  expanded.value = !expanded.value
  expandKey.value++
}

function findDept(id: number): any | null {
  let hit: any = null
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      if ((n.dept?.id ?? n.id) === id) { hit = n; return }
      if (n.children?.length) walk(n.children)
    }
  }
  walk(tree.value)
  return hit
}

function openCreate(parentId: number) {
  editing.value = false
  parentName.value = parentId === 0 ? '根部门' : (findDept(parentId)?.dept?.name ?? String(parentId))
  Object.assign(form, { id: 0, parentId, name: '', sort: 0, status: '0', leaderUserId: null })
  leaderOptions.value = []
  searchLeaders('')
  dialog.value = true
}

function openEdit(row: any) {
  editing.value = true
  Object.assign(form, { id: row.id, parentId: 0, name: row.name, sort: row.sort, status: String(row.status), leaderUserId: row.leaderUserId || null })
  leaderOptions.value = []
  searchLeaders('')
  // 当前负责人不在首页候选时补一个回显项
  if (row.leaderUserId && row.leaderName && !leaderOptions.value.some((u) => u.id === row.leaderUserId)) {
    leaderOptions.value.unshift({ id: row.leaderUserId, username: row.leaderName, nickname: row.leaderName })
  }
  dialog.value = true
}

async function doSubmit() {
  const status = Number(form.status)
  // 负责人：清空提交 0（后端 0=清空语义），未选不传
  const leader = form.leaderUserId || (editing.value ? 0 : null)
  if (editing.value) {
    await request.put(base.value, { id: form.id, name: form.name, sort: form.sort, status, leaderUserId: leader })
  } else {
    await request.post(base.value, { parentId: form.parentId, name: form.name, sort: form.sort, leaderUserId: leader })
  }
  ElMessage.success('保存成功')
  dialog.value = false
  load()
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确定删除部门「${row.name}」？`, '提示', { type: 'warning' })
  await request.delete(`${base.value}/${row.id}`)
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
