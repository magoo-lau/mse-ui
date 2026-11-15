<template>
  <div class="page">
    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="left">
          <el-button v-permission="'tenant:package:create'" type="primary" icon="Plus" @click="openCreate">新增套餐</el-button>
          <el-button v-permission="'tenant:package:update'" icon="RefreshRight" @click="refreshCache">刷新权限缓存</el-button>
          <el-button icon="Refresh" @click="load">刷新</el-button>
        </div>
        <right-toolbar @refresh="load" />
      </div>

      <el-table :data="rows" border>
        <el-table-column prop="id" label="套餐编号" width="100" />
        <el-table-column prop="name" label="套餐名" width="160" />
        <el-table-column label="菜单范围" min-width="300">
          <template #default="{ row }">
            <span v-if="!menuIdsOf(row.menuIds ?? '').length">-</span>
            <span v-else-if="!menuTree.length">共 {{ menuIdsOf(row.menuIds).length }} 项菜单</span>
            <template v-else>
              <!-- 向下弹出 + 内容限高内滚：菜单范围列靠表格上部，向上弹会被视口裁掉 -->
              <el-popover v-if="topSummaryOf(row.menuIds).length" placement="bottom-start" :width="380"
                          trigger="hover" :show-after="150">
                <template #reference>
                  <span class="menu-scope-tags">
                    <el-tag v-for="g in topSummaryOf(row.menuIds)" :key="g.name" size="small" class="menu-scope-tag">
                      {{ g.name }}<span v-if="g.count > 1">（{{ g.count }}）</span>
                    </el-tag>
                  </span>
                </template>
                <div class="scope-tree">
                  <el-tree :data="selectedTreeOf(row.menuIds)" :props="{ label: 'name', children: 'children' }"
                           default-expand-all />
                </div>
              </el-popover>
              <el-tag v-for="id in staleIdsOf(row.menuIds)" :key="id" size="small" type="danger" effect="plain"
                      class="menu-scope-tag">失效 #{{ id }}</el-tag>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 0 ? 'success' : 'danger'" size="small">{{ row.status === 0 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" show-overflow-tooltip />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'tenant:package:update'" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
            <el-button v-permission="'tenant:package:delete'" link type="danger" icon="Delete" @click="doDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialog" :title="editing ? '编辑套餐' : '新增套餐'" width="560px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="套餐名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="包含菜单">
          <el-tabs v-model="activeClient" class="package-tabs">
            <el-tab-pane label="PC 端" name="1" />
            <el-tab-pane label="移动端" name="2" />
          </el-tabs>
          <el-tree ref="menuTreeRef" :data="activeMenuOptions" show-checkbox node-key="id" :key="activeClient"
                   :props="{ label: 'name', children: 'children' }" default-expand-all
                   :default-checked-keys="checkedMenuIds" @check="onMenuCheck"
                   style="width: 100%; border: 1px solid var(--el-border-color); padding: 4px" />
          <div class="tip">PC 与移动端菜单分别圈定：勾选子应用页面菜单即对该套餐租户启用对应端上的对应子应用（页面级裁剪）；未登记页面菜单的子应用对所有租户可用。</div>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" /></el-form-item>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/request'
import RightToolbar from '../../components/RightToolbar.vue'

const rows = ref<any[]>([])
const menuTree = ref<any[]>([])
const dialog = ref(false)
const editing = ref(false)
const menuTreeRef = ref()
const checkedMenuIds = ref<number[]>([])
const form = reactive({ id: 0, name: '', menuIds: '', remark: '', status: 0 })
/** 套餐树按客户端分页签：1 PC / 2 移动端（菜单入口分离，域裁剪同域） */
const activeClient = ref<'1' | '2'>('1')

/**
 * 租户域菜单树（display 基准，双 client 合并）：后端 Long 序列化为字符串，此处统一归一为 number。
 * 租户域 = 租户端(2) + 双端(3)；双端目录（如 AI 平台）本身无租户语义，但要作为其下租户页面的父链保留；
 * 平台端(1)叶子剔除，平台端目录仅在还挂着租户域后代时保留。
 */
const tenantMenuOptions = computed(() => filterScope(() => true))

/** 对话框页签树：在租户域基础上再按客户端过滤（client 缺省按 PC，兼容历史行） */
const menuOptionsByClient = computed<Record<'1' | '2', any[]>>(() => ({
  1: filterScope((n: any) => Number(n.menu.client ?? 1) === 1),
  2: filterScope((n: any) => Number(n.menu.client ?? 1) === 2)
}))
const activeMenuOptions = computed(() => menuOptionsByClient.value[activeClient.value])

function filterScope(clientMatch: (n: any) => boolean): any[] {
  const walk = (nodes: any[]): any[] => (nodes || [])
    .map((n) => ({ id: Number(n.menu.id), name: n.menu.name, scope: Number(n.menu.menuScope), children: walk(n.children || []), keep: clientMatch(n) }))
    // 平台端(1)叶子剔除（仅作租户后代父链保留）；client 不匹配的叶子同样剔除（仅作匹配后代的父链保留）
    .filter((n) => (n.scope !== 1 || n.children.length > 0) && (n.keep || n.children.length > 0))
    .map(({ id, name, children }) => ({ id, name, children }))
  return walk(menuTree.value)
}

const tenantIdSet = computed(() => {
  const ids = new Set<number>()
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      ids.add(n.id)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(tenantMenuOptions.value)
  return ids
})

function menuIdsOf(menuIds: string): number[] {
  return (menuIds || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number)
}

function selectedIdSet(menuIds: string) {
  return new Set(menuIdsOf(menuIds))
}

/** 展示树：仅保留套餐选中的节点及其祖先链（基于租户域菜单树） */
function selectedTreeOf(menuIds: string): any[] {
  const ids = selectedIdSet(menuIds)
  const prune = (nodes: any[]): any[] => nodes
    .map((n) => ({ id: n.id, name: n.name, children: prune(n.children || []) }))
    .filter((n) => ids.has(n.id) || n.children.length > 0)
  return prune(tenantMenuOptions.value)
}

/** 一级菜单摘要：菜单名 + 其下选中条目数，用于表格单元格紧凑展示 */
function topSummaryOf(menuIds: string) {
  const ids = selectedIdSet(menuIds)
  const count = (n: any): number => (ids.has(n.id) ? 1 : 0) + (n.children || []).reduce((sum: number, c: any) => sum + count(c), 0)
  return selectedTreeOf(menuIds).map((n) => ({ name: n.name, count: count(n) }))
}

/** 套餐内已不在租户域菜单树中的编号（菜单已删除或误配平台菜单），标红提示 */
function staleIdsOf(menuIds: string) {
  return menuIdsOf(menuIds).filter((id) => !tenantIdSet.value.has(id))
}

async function load() {
  rows.value = await request.get('/tenant-package/list')
}

async function loadMenus() {
  menuTree.value = await request.get('/system/menu/tree')
}

function openCreate() {
  editing.value = false
  Object.assign(form, { id: 0, name: '', menuIds: '', remark: '', status: 0 })
  harvested['1'] = { checked: [], half: [] }
  harvested['2'] = { checked: [], half: [] }
  activeClient.value = '1'
  checkedMenuIds.value = []
  dialog.value = true
}

/** 各页签勾选状态（切换时从树上收割暂存，保存时合并两页签） */
const harvested = reactive<Record<'1' | '2', { checked: number[]; half: number[] }>>({
  '1': { checked: [], half: [] },
  '2': { checked: [], half: [] }
})

/** 页签树中的叶子集合：回显只喂叶子，父节点勾选/半选由子节点反推，避免历史父 id 级联误勾 */
function leafIdsOf(nodes: any[]): Set<number> {
  const ids = new Set<number>()
  const walk = (list: any[]) => {
    for (const n of list) {
      if (!n.children?.length) ids.add(n.id)
      else walk(n.children)
    }
  }
  walk(nodes)
  return ids
}

/** 页签树中的全部节点集合：收割时甄别存量目录 id（已删除的失效 id 不回收） */
function allIdsOf(nodes: any[]): Set<number> {
  const ids = new Set<number>()
  const walk = (list: any[]) => {
    for (const n of list) {
      ids.add(n.id)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return ids
}

function openEdit(row: any) {
  editing.value = true
  Object.assign(form, { id: row.id, name: row.name, menuIds: row.menuIds ?? '', remark: row.remark ?? '', status: row.status ?? 0 })
  const ids = menuIdsOf(row.menuIds)
  for (const tab of ['1', '2'] as const) {
    const leaves = leafIdsOf(menuOptionsByClient.value[tab])
    const known = allIdsOf(menuOptionsByClient.value[tab])
    // 存量目录 id 必须留进 half：提交时未激活页签只回收 checked+half，
    // 若此处把目录剥掉（half 恒空），保存后套餐域只剩叶子、buildTree 组不出根，租户端侧边栏整树消失
    harvested[tab] = { checked: ids.filter((id) => leaves.has(id)), half: ids.filter((id) => !leaves.has(id) && known.has(id)) }
  }
  activeClient.value = '1'
  checkedMenuIds.value = harvested['1'].checked
  dialog.value = true
}

/** 切换页签：恢复目标页签勾选（default-checked-keys 随 :key 重挂生效）；离开页签勾选已由 @check 即时收割，无需再读树 */
watch(activeClient, (next) => {
  checkedMenuIds.value = harvested[next].checked
})

/** 勾选即时收割进所属页签：切换往返/保存合并均以此为据；checked 只留叶子供回显（父节点由子节点反推），目录 id 并入 half 参与提交撑父链 */
function onMenuCheck(_node: any, { checkedKeys, halfCheckedKeys }: { checkedKeys: number[]; halfCheckedKeys: number[] }) {
  const leaves = leafIdsOf(menuOptionsByClient.value[activeClient.value])
  const ids = new Set<number>([...checkedKeys, ...halfCheckedKeys].map(Number))
  harvested[activeClient.value] = {
    checked: [...ids].filter((id) => leaves.has(id)),
    half: [...ids].filter((id) => !leaves.has(id)),
  }
}

async function doSubmit() {
  // 半选父节点（目录祖先链）一并入域：后端按字面 id 集合消费（目录 id 不影响叶子裁剪，仅撑列表摘要展示与失效提示）；
  // 另一页签的收割勾选合并提交（PC/移动端菜单分别圈定，同一份 menuIds）
  const other = activeClient.value === '1' ? '2' : '1'
  const checked = [
    ...(menuTreeRef.value?.getCheckedKeys(false) ?? []),
    ...(menuTreeRef.value?.getHalfCheckedKeys() ?? []),
  ]
  const merged = new Set<number>([...checked, ...harvested[other].checked, ...harvested[other].half])
  const payload = { ...form, menuIds: [...merged].join(',') }
  if (editing.value) {
    await request.put('/tenant-package', payload)
  } else {
    await request.post('/tenant-package', payload)
  }
  ElMessage.success('保存成功（使用该套餐的租户权限域即刻刷新）')
  dialog.value = false
  load()
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确定删除套餐「${row.name}」？`, '提示', { type: 'warning' })
  await request.delete(`/tenant-package/${row.id}`)
  ElMessage.success('删除成功')
  load()
}

/** 权限点/菜单脚本随业务 jar 直接落库（base 通道重放）不触发缓存失效，此处手动自增全局版本立即收敛，免等 30 分钟 TTL */
async function refreshCache() {
  await ElMessageBox.confirm('自增权限缓存全局版本，所有租户的权限缓存立即失效（用于权限点直接落库后免等 30 分钟 TTL）。确定刷新？', '刷新权限缓存', { type: 'warning' })
  await request.post('/tenant-package/refresh-cache')
  ElMessage.success('权限缓存已刷新，各租户用户下次鉴权即取最新权限')
}

onMounted(() => {
  load()
  loadMenus()
})
</script>

<style scoped>
.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.menu-scope-tag {
  margin: 2px 4px 2px 0;
  cursor: default;
}
.scope-tree {
  max-height: 300px;
  overflow: auto;
}
.tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
  width: 100%;
}
.package-tabs {
  width: 100%;
}
.package-tabs :deep(.el-tabs__header) {
  margin-bottom: 6px;
}
</style>
