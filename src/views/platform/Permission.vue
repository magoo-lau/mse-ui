<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="权限名称"><el-input v-model="query.name" placeholder="请输入权限名" clearable style="width: 200px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="权限标识"><el-input v-model="query.code" placeholder="如 system:user:create" clearable style="width: 220px" @keyup.enter="load" /></el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="load">搜索</el-button>
          <el-button icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="left">
          <el-button v-permission="'system:permission:create'" type="primary" icon="Plus" @click="openCreate">新增权限点</el-button>
          <el-button icon="Sort" @click="toggleExpand">{{ expanded ? '折叠' : '展开' }}</el-button>
          <el-button icon="Refresh" @click="load">刷新</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <!-- 按挂靠菜单层级分组：目录 → 菜单 → 权限点；通用权限（menu_id 为空）与已失效挂靠单列成组 -->
      <el-table :data="tableRows" row-key="id" border :default-expand-all="expanded" :key="expandKey"
                :tree-props="{ children: 'children' }">
        <el-table-column prop="name" label="名称 / 权限名" min-width="220" />
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">
            <template v-if="row.kind === 'menu'">
              <el-tag v-if="row.menuType === 1" type="info" size="small">目录</el-tag>
              <el-tag v-else-if="row.menuType === 2" type="success" size="small">菜单</el-tag>
              <el-tag v-else type="warning" size="small">分组</el-tag>
            </template>
            <el-tag v-else type="primary" size="small">权限点</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="module" label="模块" width="90" />
        <el-table-column prop="code" label="权限标识" min-width="220">
          <template #default="{ row }">{{ row.kind === 'perm' ? row.code : '' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.kind === 'perm'" :type="row.status === 0 ? 'success' : 'danger'" size="small">{{ row.status === 0 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <template v-if="row.kind === 'perm'">
              <el-button v-permission="'system:permission:update'" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
              <el-button v-permission="'system:permission:delete'" link type="danger" icon="Delete" @click="doDelete(row)">删除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialog" :title="editing ? '编辑权限点' : '新增权限点'" width="500px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="所属模块">
          <el-select v-model="form.module" allow-create filterable default-first-option style="width: 100%">
            <el-option v-for="m in modules" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="权限名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="权限标识"><el-input v-model="form.code" placeholder="module:resource:action" /></el-form-item>
        <el-form-item label="挂靠菜单">
          <el-tree-select v-model="form.menuId" :data="menuOptions" check-strictly clearable node-key="id"
                          :props="{ label: 'name', children: 'children' }" style="width: 100%"
                          placeholder="留空 = 通用权限（不受套餐裁剪）" />
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" /></el-form-item>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/request'
import RightToolbar from '../../components/RightToolbar.vue'

interface PermRow {
  id: string
  kind: 'menu' | 'perm'
  name: string
  /** 仅菜单组行：1 目录 2 菜单 0 虚拟分组（通用权限/失效挂靠） */
  menuType?: number
  module?: string
  code?: string
  status?: number
  raw?: any
  children?: PermRow[]
}

const showSearch = ref(true)
const rows = ref<any[]>([])
const menuTree = ref<any[]>([])
const query = reactive({ name: '', code: '' })
const expanded = ref(true)
const expandKey = ref(0)
const dialog = ref(false)
const editing = ref(false)
const form = reactive({ id: 0, module: 'system', name: '', code: '', menuId: null as number | null, sort: 0, status: 0, remark: '' })

/** 所属模块候选：已登记权限点的模块 distinct（新模块接入自动跟进；allow-create 兜底全新模块） */
const modules = computed(() => {
  const set = new Set<string>()
  for (const p of rows.value) if (p.module) set.add(p.module)
  return [...set].sort()
})

const menuOptions = computed(() => {
  const toOptions = (nodes: any[]): any[] => (nodes || []).map((n) => ({
    id: n.menu.id,
    name: n.menu.name,
    children: toOptions(n.children || [])
  }))
  return toOptions(menuTree.value)
})

/** 权限点按名称/标识过滤（命中才保留） */
function permHit(p: any): boolean {
  const name = query.name.trim()
  const code = query.code.trim()
  return (!name || (p.name || '').includes(name)) && (!code || (p.code || '').includes(code))
}

function toPermRow(p: any): PermRow {
  return { id: `p${p.id}`, kind: 'perm', name: p.name, module: p.module, code: p.code, status: p.status, raw: p }
}

/** 菜单树 + 权限点 → 树表行：目录 → 菜单 → 其挂靠权限点；空分支剪掉，保留命中权限点的祖先链 */
function buildRows(perms: any[], menus: any[]): PermRow[] {
  const byMenu = new Map<number, any[]>()
  const general: any[] = []
  for (const p of perms) {
    if (p.menuId == null) { general.push(p); continue }
    const list = byMenu.get(p.menuId) || []
    list.push(p)
    byMenu.set(p.menuId, list)
  }
  const sortPerms = (list: any[]) => [...list].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id)
  const attachedRows = (menuId: number) => sortPerms(byMenu.get(menuId) || []).filter(permHit).map(toPermRow)

  const walk = (nodes: any[]): PermRow[] => (nodes || [])
    .map((n: any) => {
      const children = [...walk(n.children || []), ...attachedRows(n.menu.id)]
      if (!children.length) return null
      return { id: `m${n.menu.id}`, kind: 'menu' as const, name: n.menu.name, menuType: n.menu.type, children }
    })
    .filter(Boolean) as PermRow[]

  const table = walk(menus)
  // 挂靠菜单已被删除的权限点（后端删菜单不清理 menu_id）收进「失效挂靠」组，避免凭空消失
  const knownMenus = new Set<number>()
  const collectIds = (nodes: any[]) => (nodes || []).forEach((n: any) => { knownMenus.add(n.menu.id); collectIds(n.children || []) })
  collectIds(menus)
  const orphan = sortPerms(perms.filter((p) => p.menuId != null && !knownMenus.has(p.menuId))).filter(permHit).map(toPermRow)
  if (orphan.length) table.push({ id: 'orphan', kind: 'menu', name: '失效挂靠', menuType: 0, children: orphan })

  const generalRows = sortPerms(general).filter(permHit).map(toPermRow)
  if (generalRows.length) table.push({ id: 'general', kind: 'menu', name: '通用权限', menuType: 0, children: generalRows })
  return table
}

const tableRows = computed(() => buildRows(rows.value, menuTree.value))

async function load() {
  rows.value = await request.get('/system/permission/list')
}

async function loadMenus() {
  menuTree.value = await request.get('/system/menu/tree')
}

function reset() {
  Object.assign(query, { name: '', code: '' })
}

function toggleExpand() {
  expanded.value = !expanded.value
  expandKey.value++
}

function openCreate() {
  editing.value = false
  Object.assign(form, { id: 0, module: 'system', name: '', code: '', menuId: null, sort: 0, status: 0, remark: '' })
  dialog.value = true
}

function openEdit(row: PermRow) {
  const p = row.raw
  editing.value = true
  Object.assign(form, { id: p.id, module: p.module, name: p.name, code: p.code, menuId: p.menuId, sort: p.sort ?? 0, status: p.status ?? 0, remark: p.remark ?? '' })
  dialog.value = true
}

async function doSubmit() {
  if (editing.value) {
    await request.put('/system/permission', { ...form })
  } else {
    await request.post('/system/permission', { ...form })
  }
  ElMessage.success('保存成功')
  dialog.value = false
  load()
}

async function doDelete(row: PermRow) {
  await ElMessageBox.confirm(`确定删除权限点「${row.name}」？`, '提示', { type: 'warning' })
  await request.delete(`/system/permission/${row.raw.id}`)
  ElMessage.success('删除成功')
  load()
}

onMounted(() => {
  load()
  loadMenus()
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
