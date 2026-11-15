<template>
  <div class="page user-page">
    <!-- 左侧组织机构树（仅租户端展示；平台域仅平台总部一个部门，无需部门树） -->
    <el-card v-if="!platformMode" shadow="never" class="dept-panel">
      <template #header>
        <div class="dept-header">
          <span>组织机构</span>
          <div class="dept-actions">
            <el-tooltip content="展开全部"><el-button link type="primary" icon="Expand" @click="expandAll(true)" /></el-tooltip>
            <el-tooltip content="折叠全部"><el-button link type="primary" icon="Fold" @click="expandAll(false)" /></el-tooltip>
          </div>
        </div>
      </template>
      <el-tree ref="deptTreeRef" :data="deptOptions" node-key="id" highlight-current default-expand-all
               :props="{ label: 'name', children: 'children' }" :expand-on-click-node="false"
               @node-click="onDeptClick" />
    </el-card>

    <div class="user-main">
      <el-card shadow="never" class="search-card" v-show="showSearch">
        <el-form :model="query" inline label-width="80px" @submit.prevent>
          <el-form-item label="登录名称"><el-input v-model="query.username" placeholder="请输入登录名称" clearable style="width: 180px" @keyup.enter="load" /></el-form-item>
          <el-form-item label="手机号码"><el-input v-model="query.mobile" placeholder="请输入手机号码" clearable style="width: 180px" @keyup.enter="load" /></el-form-item>
          <el-form-item label="用户状态">
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
            <el-button v-permission="createCode" type="primary" icon="Plus" @click="openCreate">新增</el-button>
            <el-button v-permission="updateCode" type="success" icon="EditPen" :disabled="selected.length !== 1" @click="openEdit(selected[0])">修改</el-button>
            <el-button v-permission="deleteCode" type="danger" icon="Delete" :disabled="!selected.length" @click="doDeleteBatch">删除</el-button>
            <template v-if="!platformMode">
              <el-button v-permission="'system:user:import'" type="info" icon="Upload" @click="importDialog = true">导入</el-button>
              <el-button v-permission="'system:user:export'" type="warning" icon="Download" @click="doExport">导出</el-button>
            </template>
          </div>
          <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
        </div>

        <el-table :data="rows" @selection-change="selected = $event">
          <el-table-column type="selection" width="50" />
          <el-table-column prop="username" label="登录名称" width="120" />
          <el-table-column prop="nickname" label="用户昵称" width="120" />
          <el-table-column label="部门" width="140">
            <template #default="{ row }">{{ deptName(row.deptId) }}</template>
          </el-table-column>
          <el-table-column prop="mobile" label="手机" width="130" />
          <el-table-column label="角色" min-width="140">
            <template #default="{ row }">
              <el-tag v-for="name in roleMap[row.id] || []" :key="name" size="small" style="margin-right: 4px">{{ name }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-switch v-if="row.status !== undefined" v-model="row.status" :active-value="0" :inactive-value="1"
                         :disabled="!canUpdate || !!row.superAdmin" @change="toggleStatus(row)" />
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="180">
            <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button v-permission="updateCode" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
              <el-dropdown v-if="!row.superAdmin" trigger="click" @command="(cmd: string) => onRowCommand(cmd, row)">
                <el-button v-permission="[deleteCode, 'system:user:reset-password', totpResetCode]" link type="primary">
                  更多操作<el-icon><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <!-- 平台域无重置密码接口（后端仅租户登录态开放），平台模式隐藏 -->
                    <el-dropdown-item v-permission="'system:user:reset-password'" command="resetPwd">
                      <el-icon><Key /></el-icon>重置密码
                    </el-dropdown-item>
                    <el-dropdown-item v-permission="totpResetCode" command="resetTotp">
                      <el-icon><RefreshLeft /></el-icon>重置双因子
                    </el-dropdown-item>
                    <el-dropdown-item v-permission="kickCode" command="kickUser">
                      <el-icon><SwitchButton /></el-icon>强制下线
                    </el-dropdown-item>
                    <el-dropdown-item v-permission="deleteCode" command="delete">
                      <el-icon><Delete /></el-icon>删除
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
        <pagination v-model:page="query.pageNum" v-model:size="query.pageSize" :total="total" @change="load" />
      </el-card>
    </div>

    <!-- 新增/编辑用户 -->
    <el-dialog v-model="dialog" :title="editing ? '编辑用户' : '新增用户'" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <template v-if="!editing">
          <el-row>
            <el-col :span="12"><el-form-item label="登录名称" prop="username"><el-input v-model="form.username" placeholder="请输入登录名称" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="初始密码" prop="password"><el-input v-model="form.password" type="password" show-password placeholder="不少于 6 位" /></el-form-item></el-col>
          </el-row>
        </template>
        <el-row>
          <el-col :span="12"><el-form-item label="用户昵称"><el-input v-model="form.nickname" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="手机号码"><el-input v-model="form.mobile" /></el-form-item></el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="归属部门">
              <el-tree-select v-model="form.deptId" :data="deptOptions" check-strictly clearable
                              :props="{ label: 'name', value: 'id', children: 'children' }" node-key="id" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="岗位">
              <el-select v-model="form.postIds" multiple clearable placeholder="可多选" style="width: 100%">
                <el-option v-for="post in posts" :key="post.id" :label="post.postName" :value="post.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="角色">
          <el-select v-model="form.roleIds" multiple clearable style="width: 100%">
            <el-option v-for="role in roles" :key="role.id" :label="role.name" :value="role.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editing" label="用户状态">
          <el-radio-group v-model="form.status">
            <el-radio v-for="d in normalDisable" :key="d.dictValue" :value="d.dictValue">{{ d.dictLabel }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="doSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="resetDialog" title="重置密码" width="420px">
      <el-form label-width="80px">
        <el-form-item label="登录名称"><el-input :model-value="resetTarget?.username" disabled /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="resetPassword" type="password" show-password placeholder="6-32 位" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetDialog = false">取消</el-button>
        <el-button type="primary" @click="doResetPassword">确定</el-button>
      </template>
    </el-dialog>

    <!-- Excel 导入 -->
    <el-dialog v-model="importDialog" title="用户导入" width="460px" @close="importFile = undefined">
      <el-upload drag :auto-upload="false" :limit="1" accept=".xlsx,.xls" :on-change="onImportFile">
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">将 Excel 文件拖到此处，或<em>点击选择</em></div>
        <template #tip>
          <div class="el-upload__tip">
            <el-checkbox v-model="updateSupport">是否更新已经存在的用户</el-checkbox>
            <el-link type="primary" style="margin-left: 12px" @click="downloadTemplate">下载模板</el-link>
          </div>
        </template>
      </el-upload>
      <div v-if="importResult" class="import-result">
        <el-alert type="success" :closable="false" :title="`导入完成：成功 ${importResult.successCount} 条，失败 ${importResult.failCount} 条`" />
        <div v-for="(err, index) in importResult.errors" :key="index" class="import-error">{{ err }}</div>
      </div>
      <template #footer>
        <el-button @click="importDialog = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="doImport">确定导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import request from '../api/request'
import { download } from '../api/request'
import { useDictStore } from '../stores/dict'
import { useUserStore } from '../stores/user'
import { Pagination } from 'mse-ui-shared/pc'
import RightToolbar from '../components/RightToolbar.vue'

// 双端复用：/system/user（租户内）与 /platform/user（tenant_id=0 域）按路由前缀切换 API 与权限码
const route = useRoute()
const platformMode = computed(() => route.path.startsWith('/platform'))
const api = computed(() => platformMode.value ? {
  page: '/system/user/platform/page', create: '/system/user/platform', update: '/system/user/platform',
  remove: (id: number) => `/system/user/platform/${id}`,
  roleIds: (id: number) => `/system/user/platform/${id}/role-ids`,
  totpReset: (id: number) => `/system/user/platform/${id}/totp-reset`,
  roleList: '/system/role/platform/list', deptTree: '/system/dept/platform/tree'
} : {
  page: '/system/user/page', create: '/system/user', update: '/system/user',
  remove: (id: number) => `/system/user/${id}`,
  roleIds: (id: number) => `/system/user/${id}/role-ids`,
  totpReset: (id: number) => `/system/user/${id}/totp-reset`,
  postIds: (id: number) => `/system/user/${id}/post-ids`,
  roleList: '/system/role/list', deptTree: '/system/dept/tree'
})
const createCode = computed(() => platformMode.value ? 'system:user:platform-create' : 'system:user:create')
const updateCode = computed(() => platformMode.value ? 'system:user:platform-update' : 'system:user:update')
const deleteCode = computed(() => platformMode.value ? 'system:user:platform-delete' : 'system:user:delete')
// 强制下线复用在线用户管理权限码（两端后缀区分）
const kickCode = computed(() => platformMode.value ? 'system:online:platform-kick' : 'system:online:kick')
const totpResetCode = computed(() => platformMode.value ? 'system:user:platform-reset-totp' : 'system:user:reset-totp')

const dictStore = useDictStore()
const userStore = useUserStore()
const normalDisable = ref<any[]>([])
const canUpdate = computed(() => userStore.hasPermission(platformMode.value ? 'system:user:platform-update' : 'system:user:update'))

const showSearch = ref(true)
const rows = ref<any[]>([])
const total = ref(0)
const selected = ref<any[]>([])
const roleMap = ref<Record<number, string[]>>({})
const roles = ref<any[]>([])
const posts = ref<any[]>([])
const deptTree = ref<any[]>([])
const deptTreeRef = ref()
const query = reactive({ pageNum: 1, pageSize: 10, username: '', mobile: '', status: '' as number | '', deptId: null as number | null })
const dialog = ref(false)
const editing = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({
  id: 0, username: '', password: '', nickname: '', mobile: '',
  deptId: null as number | null, roleIds: [] as number[], postIds: [] as number[], status: '0'
})
const rules: FormRules = {
  username: [{ required: true, message: '登录名称不能为空', trigger: 'blur' }],
  password: [{ required: true, min: 6, max: 32, message: '密码长度须为 6-32 位', trigger: 'blur' }]
}

// -------------------- 重置密码 --------------------
const resetDialog = ref(false)
const resetTarget = ref<any>(null)
const resetPassword = ref('')

// -------------------- 导入 --------------------
const importDialog = ref(false)
const importFile = ref<File | undefined>()
const updateSupport = ref(false)
const importing = ref(false)
const importResult = ref<any>(null)

function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-'
}

/** 后端 DeptTreeNode({dept, children}) → el-tree 数据源 {id, name, children} */
function toDeptOptions(nodes: any[]): any[] {
  return (nodes || []).map((n) => ({
    id: n.dept?.id ?? n.id,
    name: n.dept?.name ?? n.name,
    children: toDeptOptions(n.children || [])
  }))
}
const deptOptions = computed(() => toDeptOptions(deptTree.value))

const deptNameMap = computed(() => {
  const map: Record<number, string> = {}
  const walk = (nodes: any[]) => {
    for (const node of nodes) {
      map[node.id] = node.name
      if (node.children?.length) walk(node.children)
    }
  }
  walk(deptOptions.value)
  return map
})
function deptName(id: number | null) {
  return id == null ? '-' : (deptNameMap.value[id] ?? id)
}

function expandAll(expanded: boolean) {
  const nodes = (deptTreeRef.value?.store?.nodesMap ?? {}) as Record<string, any>
  Object.values(nodes).forEach((node: any) => { node.expanded = expanded })
}

function onDeptClick(node: any) {
  // 再次点击同一部门取消过滤
  query.deptId = query.deptId === node.id ? null : node.id
  load()
}

async function load() {
  const params: Record<string, unknown> = {
    pageNum: query.pageNum, pageSize: query.pageSize,
    username: query.username || undefined,
    status: query.status === '' ? undefined : query.status,
    deptId: platformMode.value ? undefined : (query.deptId ?? undefined)
  }
  const data = await request.get(api.value.page, { params })
  rows.value = data.records
  total.value = Number(data.total)
  loadRoleMap()
}

/** 逐行拉取用户绑定角色并映射为角色名称展示 */
async function loadRoleMap() {
  const map: Record<number, string[]> = {}
  const roleIdToName = new Map<number, string>(roles.value.map((r) => [r.id, r.name]))
  await Promise.all(rows.value.map(async (row) => {
    try {
      const ids: number[] = await request.get(api.value.roleIds(row.id))
      map[row.id] = ids.map((id) => roleIdToName.get(id) ?? String(id))
    } catch { map[row.id] = [] }
  }))
  roleMap.value = map
}

async function loadOptions() {
  try { roles.value = await request.get(api.value.roleList) } catch { roles.value = [] }
  try { deptTree.value = await request.get(api.value.deptTree) } catch { deptTree.value = [] }
  if (!platformMode.value) {
    try { posts.value = await request.get('/system/post/list-enabled') } catch { posts.value = [] }
  }
}

function reset() {
  Object.assign(query, { pageNum: 1, username: '', mobile: '', status: '', deptId: null })
  load()
}

function openCreate() {
  editing.value = false
  Object.assign(form, { id: 0, username: '', password: '', nickname: '', mobile: '', deptId: query.deptId, roleIds: [], postIds: [], status: '0' })
  dialog.value = true
}

async function openEdit(row: any) {
  editing.value = true
  Object.assign(form, {
    id: row.id, username: row.username, password: '', nickname: row.nickname, mobile: row.mobile,
    deptId: row.deptId, roleIds: [], postIds: [], status: String(row.status)
  })
  request.get(api.value.roleIds(row.id)).then((ids: number[]) => { form.roleIds = ids }).catch(() => {})
  if (!platformMode.value) {
    request.get(api.value.postIds!(row.id)).then((ids: number[]) => { form.postIds = ids }).catch(() => {})
  }
  dialog.value = true
}

async function doSubmit() {
  if (!editing.value) {
    await formRef.value?.validate()
  }
  if (editing.value) {
    await request.put(api.value.update, {
      id: form.id, nickname: form.nickname, mobile: form.mobile, deptId: form.deptId,
      roleIds: form.roleIds, postIds: platformMode.value ? undefined : form.postIds,
      status: Number(form.status)
    })
    ElMessage.success('保存成功')
  } else {
    await request.post(api.value.create, {
      username: form.username, password: form.password, nickname: form.nickname, mobile: form.mobile,
      deptId: form.deptId, roleIds: form.roleIds, postIds: platformMode.value ? undefined : form.postIds
    })
    ElMessage.success('创建成功')
  }
  dialog.value = false
  load()
}

function onRowCommand(command: string, row: any) {
  if (command === 'resetPwd') {
    resetTarget.value = row
    resetPassword.value = ''
    resetDialog.value = true
  } else if (command === 'delete') {
    doDelete(row)
  } else if (command === 'kickUser') {
    doKickUser(row)
  } else if (command === 'resetTotp') {
    doResetTotp(row)
  }
}

/** 重置双因子：清除用户 TOTP 绑定（丢失验证器时的恢复手段，用户下次登录可重新绑定） */
async function doResetTotp(row: any) {
  await ElMessageBox.confirm(`确定清除用户 ${row.username} 的双因子验证器绑定？清除后其下次登录可直接凭密码进入。`, '重置双因子', { type: 'warning' })
  await request.put(api.value.totpReset(row.id))
  ElMessage.success('已重置双因子')
}

/** 强制下线该用户全部登录会话（租户端踢本租户用户；平台端踢平台用户） */
async function doKickUser(row: any) {
  await ElMessageBox.confirm(`确定将用户 ${row.username} 的全部登录会话强制下线？`, '强制下线', { type: 'warning' })
  await request.post(platformMode.value ? '/system/online/platform/kick-user' : '/system/online/kick-user', {
    loginType: platformMode.value ? 'platform' : 'tenant',
    tenantId: platformMode.value ? 0 : userStore.tenantId,
    userId: row.id
  })
  ElMessage.success('已强制下线')
}

async function toggleStatus(row: any) {
  try {
    await request.put(api.value.update, {
      id: row.id, nickname: row.nickname, mobile: row.mobile, deptId: row.deptId, status: row.status
    })
    ElMessage.success(row.status === 0 ? '已启用' : '已停用')
  } catch {
    row.status = row.status === 0 ? 1 : 0
  }
}

async function doResetPassword() {
  if (resetPassword.value.length < 6 || resetPassword.value.length > 32) {
    ElMessage.warning('密码长度须为 6-32 位')
    return
  }
  await request.put(`/system/user/${resetTarget.value.id}/password`, { password: resetPassword.value })
  ElMessage.success('重置成功')
  resetDialog.value = false
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确定删除用户 ${row.username}？`, '提示', { type: 'warning' })
  await request.delete(api.value.remove(row.id))
  ElMessage.success('删除成功')
  load()
}

async function doDeleteBatch() {
  await ElMessageBox.confirm(`确定删除选中的 ${selected.value.length} 个用户？`, '提示', { type: 'warning' })
  for (const row of selected.value) {
    await request.delete(api.value.remove(row.id))
  }
  ElMessage.success('删除成功')
  load()
}

async function doExport() {
  await download('/system/user/export', {
    username: query.username || undefined,
    status: query.status === '' ? undefined : query.status
  }, '用户数据.xlsx')
}

function onImportFile(file: any) {
  importFile.value = file.raw
}

function downloadTemplate() {
  download('/system/user/import-template', undefined, '用户导入模板.xlsx')
}

async function doImport() {
  if (!importFile.value) {
    ElMessage.warning('请先选择 Excel 文件')
    return
  }
  importing.value = true
  try {
    const formData = new FormData()
    formData.append('file', importFile.value)
    const data: any = await request.post(`/system/user/import?updateSupport=${updateSupport.value}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    importResult.value = data
    load()
  } finally {
    importing.value = false
  }
}

onMounted(async () => {
  normalDisable.value = await dictStore.getDict('sys_normal_disable')
  load()
  loadOptions()
  await nextTick()
})
</script>

<style scoped>
.user-page {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.dept-panel {
  width: 230px;
  flex-shrink: 0;
}
.dept-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}
.dept-actions :deep(.el-button) {
  font-size: 16px;
}
.user-main {
  flex: 1;
  min-width: 0;
}
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
.import-result {
  margin-top: 10px;
}
.import-error {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-top: 4px;
}
</style>
