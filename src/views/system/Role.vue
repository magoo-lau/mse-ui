<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="角色名称"><el-input v-model="query.name" placeholder="请输入角色名称" clearable style="width: 200px" @keyup.enter="load" /></el-form-item>
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
          <el-button v-permission="createCode" type="primary" icon="Plus" @click="openCreate">新增</el-button>
          <el-button v-permission="updateCode" type="success" icon="EditPen" :disabled="selected.length !== 1" @click="openEdit(selected[0])">修改</el-button>
          <el-button v-if="!platformMode" v-permission="deleteCode" type="danger" icon="Delete" :disabled="!selected.length" @click="doDeleteBatch">删除</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="rows" @selection-change="selected = $event">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="name" label="角色名称" width="160" />
        <el-table-column prop="code" label="权限字符" width="140" />
        <el-table-column label="数据范围" width="140">
          <template #default="{ row }">
            <el-tag :type="row.dataScope === 1 ? 'danger' : row.dataScope === 2 ? 'warning' : 'primary'" size="small">
              {{ dataScopeLabel(row.dataScope) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="显示顺序" width="100" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.status" :active-value="0" :inactive-value="1" :disabled="!canUpdate" @change="toggleStatus(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" show-overflow-tooltip />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="assignCode" link type="primary" icon="Key" @click="openGrants(row)">授权</el-button>
            <el-button v-permission="updateCode" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="!platformMode" v-permission="deleteCode" link type="danger" icon="Delete" @click="doDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
    </el-card>

    <el-dialog v-model="dialog" :title="editing ? '编辑角色' : '新增角色'" width="500px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="角色名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="权限字符"><el-input v-model="form.code" placeholder="如 editor" /></el-form-item>
        <el-form-item label="显示顺序"><el-input-number v-model="form.sort" :min="0" /></el-form-item>
        <el-form-item label="数据范围">
          <el-select v-model="form.dataScope" style="width: 100%">
            <el-option v-for="(label, value) in DATA_SCOPES" :key="value" :label="label" :value="Number(value)" />
          </el-select>
        </el-form-item>
        <!-- v-show 而非 v-if：编辑中途切走数据范围再切回时保留已勾选部门 -->
        <el-form-item v-show="form.dataScope === 2" label="数据部门">
          <div class="dept-tree-box">
            <el-tree ref="dialogDeptTreeRef" :data="formDeptTree" show-checkbox check-strictly node-key="id"
                     :props="{ label: 'name', children: 'children' }" default-expand-all />
          </div>
          <div class="dept-tip">勾选的部门即数据可见范围（不含下级，需含下级请逐个勾选）</div>
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

    <!-- 授权抽屉：菜单与权限点聚合为一棵授权树（目录/菜单/权限点以图标区分）；自定义数据部门在编辑对话框中勾选 -->
    <el-drawer v-model="grantsDrawer" :title="`角色授权：${currentRole?.name ?? ''}`" size="480px">
      <el-divider content-position="left">菜单与功能权限</el-divider>
      <!-- PC/移动端入口分离：菜单树按客户端分页签独立勾选，权限点（能力）两页签共享同一份勾选 -->
      <el-tabs v-model="activeClient" class="grant-tabs">
        <el-tab-pane label="PC 端" name="1" />
        <el-tab-pane label="移动端" name="2" />
      </el-tabs>
      <el-tree ref="menuTreeRef" :data="grantTreeData" show-checkbox :check-strictly="treeStrict" node-key="key"
               :props="{ label: 'label', children: 'children' }" default-expand-all class="grant-tree">
        <template #default="{ data }">
          <el-icon :size="14" :color="GRANT_ICONS[data.kind].color" class="grant-icon">
            <component :is="GRANT_ICONS[data.kind].name" />
          </el-icon>
          <span>{{ data.label }}</span>
          <span v-if="data.code" class="grant-code">{{ data.code }}</span>
        </template>
      </el-tree>
      <div class="grant-tip">
        <div>· 目录/菜单控制导航可见，钥匙为按钮与接口权限点；勾选菜单会连带其下全部权限点</div>
        <div>· 保存时自动补齐半选的上级导航；通用权限（未挂菜单）登录即自动授予</div>
        <div>· PC 端与移动端菜单分别授权（移动端菜单仅在移动基站工作台渲染）；挂靠另一端菜单的权限点归入「通用权限」分组，仍可勾选</div>
      </div>
      <template #footer>
        <el-button @click="grantsDrawer = false">取消</el-button>
        <el-button type="primary" @click="saveGrants">保存授权</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/request'
import { useDictStore } from '../../stores/dict'
import { useUserStore } from '../../stores/user'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../../components/RightToolbar.vue'

const DATA_SCOPES: Record<number, string> = { 1: '全部数据权限', 2: '自定义数据权限', 3: '本部门', 4: '本部门及以下', 5: '仅本人' }
function dataScopeLabel(v: number) { return DATA_SCOPES[v] ?? v }

const dictStore = useDictStore()
const userStore = useUserStore()
const normalDisable = ref<any[]>([])
const showSearch = ref(true)
const canUpdate = computed(() => userStore.hasPermission(platformMode.value ? 'system:role:platform-update' : 'system:role:update'))

// 双端复用：/system/role（租户内）与 /platform/role（tenant_id=0 域）
const route = useRoute()
const platformMode = computed(() => route.path.startsWith('/platform'))
const base = computed(() => platformMode.value ? '/system/role/platform' : '/system/role')
const createCode = computed(() => platformMode.value ? 'system:role:platform-create' : 'system:role:create')
const updateCode = computed(() => platformMode.value ? 'system:role:platform-update' : 'system:role:update')
const deleteCode = computed(() => 'system:role:delete')
const assignCode = computed(() => platformMode.value ? 'system:role:platform-assign' : 'system:role:assign')

const rows = ref<any[]>([])
const total = ref(0)
const selected = ref<any[]>([])
const query = reactive({ pageNum: 1, pageSize: 10, name: '', status: '' as number | '' })
const dialog = ref(false)
const editing = ref(false)
const form = reactive({ id: 0, name: '', code: '', sort: 0, dataScope: 1, status: '0', remark: '' })

const grantsDrawer = ref(false)
const currentRole = ref<any>(null)
const menuTreeRef = ref()
const grants = reactive({ menuIds: [] as number[], permissionIds: [] as number[] })
// 回填已授权节点期间保持严格模式，回填后再开级联，避免父节点勾选把未授权的权限点连带勾上
const treeStrict = ref(true)
/** 授权页签：1 PC / 2 移动端（菜单入口按端分离，两页签各自独立勾选） */
const activeClient = ref<'1' | '2'>('1')
/** 各端授权选项树（assign-options?client=N）：menus 按端过滤，permissions 域内全量（能力双端共享） */
const grantOptions = reactive<Record<'1' | '2', { menus: any[]; permissions: any[] }>>({
  '1': { menus: [], permissions: [] },
  '2': { menus: [], permissions: [] }
})
/** 各页签勾选收割（切换页签时从树上暂存，保存时合并两页签） */
const harvested = reactive<Record<'1' | '2', { checked: string[]; half: string[] }>>({
  '1': { checked: [], half: [] },
  '2': { checked: [], half: [] }
})

// 编辑对话框内的自定义数据部门树：仅 dataScope=2 时显示，树数据首次用到时才加载
const dialogDeptTreeRef = ref()
const formDeptTree = ref<any[]>([])
const formDeptIds = ref<number[]>([])

// 菜单与权限点分属两张表、编号空间独立，树节点 key 加前缀隔离，保存时再拆回两份 id
const toMenuKey = (id: number) => `m-${id}`
const toPermKey = (id: number) => `p-${id}`

/** 节点图标：目录/菜单为导航授权，钥匙为功能权限点 */
const GRANT_ICONS: Record<string, { name: string; color: string }> = {
  dir: { name: 'Folder', color: '#e6a23c' },
  menu: { name: 'Document', color: '#409eff' },
  perm: { name: 'Key', color: '#67c23a' },
  common: { name: 'Key', color: '#909399' }
}

/** 授权树：目录/菜单沿用菜单树结构，权限点按 menuId 挂到所属菜单下；未挂菜单或挂靠另一端菜单的归入「通用权限」虚拟分组 */
const grantTreeData = computed(() => {
  const { menus: menuTreeData, permissions: permissionList } = grantOptions[activeClient.value]
  const byMenu = new Map<number, any[]>()
  const common: any[] = []
  for (const p of permissionList) {
    const node = { key: toPermKey(p.id), kind: 'perm', label: p.name, code: p.code }
    if (p.menuId == null) {
      common.push(node)
    } else {
      if (!byMenu.has(p.menuId)) byMenu.set(p.menuId, [])
      byMenu.get(p.menuId)!.push(node)
    }
  }
  const seenMenus = new Set<number>()
  const build = (nodes: any[]): any[] => nodes.map((n) => {
    seenMenus.add(n.menu.id)
    return {
      key: toMenuKey(n.menu.id),
      kind: n.menu.type === 1 ? 'dir' : 'menu',
      label: n.menu.name,
      children: [...build(n.children || []), ...(byMenu.get(n.menu.id) ?? [])]
    }
  })
  const tree = build(menuTreeData)
  // 挂靠菜单不在本端树内的权限点（另一端菜单/历史越权数据）兜底进通用分组，避免授权项凭空消失
  for (const [menuId, items] of byMenu) {
    if (!seenMenus.has(menuId)) common.push(...items)
  }
  if (common.length) {
    tree.push({ key: 'common', kind: 'common', label: '通用权限（未挂菜单）', children: common })
  }
  return tree
})

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

async function load() {
  const data = await request.get(`${base.value}/page`, { params: { ...query, status: query.status === '' ? undefined : query.status } })
  rows.value = data.records
  total.value = Number(data.total)
}

function reset() {
  Object.assign(query, { pageNum: 1, name: '', status: '' })
  load()
}

async function openCreate() {
  editing.value = false
  Object.assign(form, { id: 0, name: '', code: '', sort: 0, dataScope: 1, status: '0', remark: '' })
  formDeptIds.value = []
  dialog.value = true
  await nextTick()
  // 对话框内容关闭后仍保持挂载，清掉上一次会话残留的部门勾选
  dialogDeptTreeRef.value?.setCheckedKeys([])
}

async function openEdit(row: any) {
  editing.value = true
  Object.assign(form, {
    id: row.id, name: row.name, code: row.code, sort: row.sort ?? 0,
    dataScope: row.dataScope ?? 1, status: String(row.status ?? 0), remark: row.remark
  })
  formDeptIds.value = []
  dialog.value = true
  await nextTick()
  dialogDeptTreeRef.value?.setCheckedKeys([])
  if (form.dataScope === 2) {
    await ensureFormDeptTree()
    // 回显已勾选部门；无角色查询权限时降级为空（后端 null 语义保证不会误清授权）
    try {
      const roleGrants = await request.get(`${base.value}/${row.id}/grants`)
      formDeptIds.value = roleGrants.deptIds || []
    } catch { formDeptIds.value = [] }
    await nextTick()
    dialogDeptTreeRef.value?.setCheckedKeys(formDeptIds.value)
  }
}

/** 编辑期间把数据范围切换为自定义时，懒加载部门树 */
watch(() => form.dataScope, async (scope) => {
  if (scope === 2 && dialog.value) await ensureFormDeptTree()
})

async function ensureFormDeptTree() {
  if (formDeptTree.value.length) return
  try {
    const deptTree = await request.get(platformMode.value ? '/system/dept/platform/tree' : '/system/dept/tree')
    formDeptTree.value = toDeptOptions(deptTree)
  } catch { formDeptTree.value = [] }
}

async function doSubmit() {
  const payload: any = { ...form, status: Number(form.status) }
  if (form.dataScope === 2) {
    const deptIds: number[] = dialogDeptTreeRef.value?.getCheckedKeys(false) ?? []
    if (!deptIds.length) {
      await ElMessageBox.confirm('未勾选任何部门，该角色将看不到任何业务数据，确定继续？', '提示', { type: 'warning' })
    }
    payload.deptIds = deptIds
  }
  if (editing.value) {
    await request.put(base.value, payload)
    ElMessage.success('保存成功')
  } else {
    await request.post(base.value, payload)
    ElMessage.success('创建成功')
  }
  dialog.value = false
  load()
}

async function toggleStatus(row: any) {
  try {
    await request.put(base.value, {
      id: row.id, name: row.name, code: row.code, sort: row.sort,
      dataScope: row.dataScope, status: row.status, remark: row.remark
    })
    ElMessage.success(row.status === 0 ? '已启用' : '已停用')
  } catch {
    row.status = row.status === 0 ? 1 : 0
  }
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确定删除角色 ${row.name}？`, '提示', { type: 'warning' })
  await request.delete(`${base.value}/${row.id}`)
  ElMessage.success('删除成功')
  load()
}

async function doDeleteBatch() {
  await ElMessageBox.confirm(`确定删除选中的 ${selected.value.length} 个角色？`, '提示', { type: 'warning' })
  for (const row of selected.value) {
    await request.delete(`${base.value}/${row.id}`)
  }
  ElMessage.success('删除成功')
  load()
}

async function openGrants(row: any) {
  currentRole.value = row
  // 双端选项树一次拉齐（menus 按端过滤；permissions 域内全量，两页签共享同一份权限点勾选）
  const [pc, mobile, roleGrants] = await Promise.all([
    request.get(`${base.value}/assign-options`, { params: { client: 1 } }),
    request.get(`${base.value}/assign-options`, { params: { client: 2 } }),
    request.get(`${base.value}/${row.id}/grants`)
  ])
  grantOptions['1'] = { menus: pc.menus || [], permissions: pc.permissions || [] }
  grantOptions['2'] = { menus: mobile.menus || [], permissions: mobile.permissions || [] }
  Object.assign(grants, {
    menuIds: roleGrants.menuIds || [],
    permissionIds: roleGrants.permissionIds || []
  })
  harvested['1'] = { checked: [], half: [] }
  harvested['2'] = { checked: [], half: [] }
  // 重置页签不触发收割（watch 回调经 nextTick 异步执行，须跨过整个回填流程）
  suppressTabWatch = true
  activeClient.value = '1'
  grantsDrawer.value = true
  treeStrict.value = true
  await nextTick()
  menuTreeRef.value?.setCheckedKeys([
    ...grants.menuIds.map(toMenuKey),
    ...grants.permissionIds.map(toPermKey)
  ])
  await nextTick()
  treeStrict.value = false
  suppressTabWatch = false
}

/** 打开抽屉重置页签期间抑制切换收割（watch 异步时机会在回填完成后才跑） */
let suppressTabWatch = false

/** 切换页签：收割离开页签勾选 → 严格模式回填目标页签勾选（权限点两页签共享，勾选状态天然一致） */
watch(activeClient, async (next, prev) => {
  if (suppressTabWatch || !grantsDrawer.value) return
  harvested[prev] = {
    checked: menuTreeRef.value?.getCheckedKeys() ?? [],
    half: menuTreeRef.value?.getHalfCheckedKeys() ?? []
  }
  treeStrict.value = true
  await nextTick()
  menuTreeRef.value?.setCheckedKeys([...harvested[next].checked])
  await nextTick()
  treeStrict.value = false
})

async function saveGrants() {
  // 收割当前页签后合并两个页签的勾选（PC/移动端入口分离，同一角色双端入口各自独立授权）
  harvested[activeClient.value] = {
    checked: menuTreeRef.value?.getCheckedKeys() ?? [],
    half: menuTreeRef.value?.getHalfCheckedKeys() ?? []
  }
  const allKeys = new Set<string>()
  for (const tab of ['1', '2'] as const) {
    for (const k of [...harvested[tab].checked, ...harvested[tab].half]) allKeys.add(k)
  }
  // 半选的上级目录/菜单一并提交：用户菜单按 parentId 组树，缺父级的子菜单不会出现在导航里
  const menuIds = [...allKeys].filter((k) => k.startsWith('m-')).map((k) => Number(k.slice(2)))
  const permissionIds = [...allKeys].filter((k) => k.startsWith('p-')).map((k) => Number(k.slice(2)))
  // 不传 deptIds = 保持已有自定义部门集合不变（部门勾选在编辑对话框中维护）
  await request.put(base.value, {
    id: currentRole.value.id,
    name: currentRole.value.name,
    code: currentRole.value.code,
    sort: currentRole.value.sort,
    dataScope: currentRole.value.dataScope,
    status: currentRole.value.status,
    remark: currentRole.value.remark,
    menuIds,
    permissionIds
  })
  ElMessage.success('授权已保存（相关用户权限即刻生效）')
  grantsDrawer.value = false
  load()
}

function toDeptOptions(nodes: any[]): any[] {
  return (nodes || []).map((n) => ({
    id: n.dept?.id ?? n.id,
    name: n.dept?.name ?? n.name,
    children: toDeptOptions(n.children || [])
  }))
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
.grant-tabs {
  margin-bottom: 6px;
}
.grant-tabs :deep(.el-tabs__header) {
  margin-bottom: 6px;
}
.grant-tree {
  border: 1px solid var(--el-border-color);
  padding: 4px;
}
.grant-tree :deep(.el-tree-node__content) {
  height: 28px;
}
.grant-icon {
  margin-right: 5px;
}
.grant-code {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.grant-tip {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--el-text-color-secondary);
}
.dept-tree-box {
  width: 100%;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--el-border-color);
  padding: 4px;
}
.dept-tree-box :deep(.el-tree-node__content) {
  height: 28px;
}
.dept-tip {
  width: 100%;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>
