<template>
  <div class="page">
    <el-card shadow="never" class="search-card" v-show="showSearch">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="菜单名称"><el-input v-model="query.name" placeholder="请输入菜单名称" clearable style="width: 200px" @keyup.enter="load" /></el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="load">搜索</el-button>
          <el-button icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="left">
          <el-button v-permission="'system:menu:create'" type="primary" icon="Plus" @click="openCreate(0)">新增菜单</el-button>
          <el-button icon="Sort" @click="toggleExpand">{{ expanded ? '折叠' : '展开' }}</el-button>
        </div>
        <right-toolbar searchable :show-search="showSearch" @update:show-search="showSearch = $event" @refresh="load" />
      </div>

      <el-table :data="tableRows" row-key="id" border :default-expand-all="expanded" :key="expandKey"
                :tree-props="{ children: 'children' }">
        <el-table-column prop="name" label="菜单名称" min-width="180">
          <template #default="{ row }">
            <span class="menu-name">
              <el-icon v-if="row.icon"><component :is="row.icon" /></el-icon>{{ row.name }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="['info', 'success', 'warning'][row.type - 1]" size="small">
              {{ ['目录', '菜单', '子应用页面'][row.type - 1] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="可见域" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="['warning', 'primary', 'success'][row.menuScope - 1]" size="small">
              {{ ['平台端', '租户端', '双端'][row.menuScope - 1] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="客户端" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="Number(row.client ?? 1) === 2 ? 'danger' : 'info'" size="small">
              {{ Number(row.client ?? 1) === 2 ? '移动端' : 'PC' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="路由地址" min-width="120" />
        <el-table-column label="所属子应用" width="110" align="center">
          <template #default="{ row }">{{ row.type === 3 ? row.microName : '-' }}</template>
        </el-table-column>
        <el-table-column prop="component" label="组件路径" min-width="150" />
        <el-table-column prop="sort" label="排序" width="70" align="center" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'system:menu:create'" link type="primary" icon="Plus" @click="openCreate(row.id)">加子项</el-button>
            <el-button v-permission="'system:menu:update'" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
            <el-button v-permission="'system:menu:delete'" link type="danger" icon="Delete" @click="doDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialog" :title="editing ? '编辑菜单' : '新增菜单'" width="500px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio-button :value="1">目录</el-radio-button>
            <el-radio-button :value="2">菜单</el-radio-button>
            <el-radio-button :value="3">子应用页面</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="可见域">
          <el-radio-group v-model="form.menuScope">
            <el-radio-button :value="1">平台端</el-radio-button>
            <el-radio-button :value="2">租户端</el-radio-button>
            <el-radio-button :value="3">双端</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="客户端">
          <el-radio-group v-model="form.client">
            <el-radio-button :value="1">PC</el-radio-button>
            <el-radio-button :value="2">移动端</el-radio-button>
          </el-radio-group>
          <div v-if="form.client === 2" class="tip" style="width: 100%">移动端菜单只在移动基站工作台渲染，与 PC 菜单相互独立授权。</div>
        </el-form-item>
        <el-form-item v-if="form.type === 3" label="所属子应用">
          <!-- 主选下拉；无 system:micro-app:list 权限时 allow-create 兜底手输（后端仍做强校验） -->
          <el-select v-model="form.microName" filterable allow-create default-first-option
                     placeholder="选择已注册的子应用" style="width: 100%">
            <el-option v-for="app in microAppOptions" :key="app.name" :label="`${app.name}（${app.title}）`" :value="app.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="路由地址">
          <el-input v-model="form.path" :placeholder="pathPlaceholder" />
        </el-form-item>
        <el-form-item v-if="form.type === 2" label="组件路径">
          <el-input v-model="form.component" placeholder="相对 views 不带扩展名，如 system/Role" />
        </el-form-item>
        <el-form-item v-if="form.type === 3" label=" ">
          <div class="tip">子应用页面渲染为 /sub/{标识}{路由地址}，挂在此处哪个目录就显示在哪，随菜单参与角色授权与套餐裁剪。</div>
        </el-form-item>
        <el-form-item label="图标">
          <icon-select v-model="form.icon" placeholder="Element Plus 图标名，如 User（可留空）" style="width: 100%" />
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
import IconSelect from '../../components/IconSelect.vue'

const showSearch = ref(true)
const tree = ref<any[]>([])
const tableRows = ref<any[]>([])
const query = reactive({ name: '' })
const expanded = ref(true)
const expandKey = ref(0)
const dialog = ref(false)
const editing = ref(false)
const form = reactive({ id: 0, parentId: 0, name: '', type: 1, menuScope: 2, client: 1, path: '', microName: '', component: '', icon: '', sort: 0, visible: 0, status: 0 })

/** 已注册子应用（类型=子应用页面的下拉数据源；无 system:micro-app:list 权限时下拉为空、allow-create 兜底手输） */
const microAppOptions = ref<{ name: string; title: string }[]>([])

async function loadMicroApps() {
  if (microAppOptions.value.length) return
  try {
    const list = await request.get<any[]>('/system/micro-app/list')
    microAppOptions.value = (list || []).map((app) => ({ name: app.name, title: app.title }))
  } catch { /* 无权限/服务不可用 → 空列表走手输入框，后端仍做强校验 */ }
}

const pathPlaceholder = computed(() =>
  form.type === 3 ? '子应用内部路由，如 /home（支持 :param）' : '目录用绝对(/system)；菜单用相对(user)'
)

/** 后端菜单树 → 树表行；按名称过滤时保留命中节点的祖先链 */
function toRows(nodes: any[]): any[] {
  const keyword = query.name.trim()
  return nodes
    .map((n) => {
      const children = toRows(n.children || [])
      const row = { ...n.menu, hasChildren: !!n.children?.length, children }
      return !keyword || row.name.includes(keyword) || children.length ? row : null
    })
    .filter(Boolean) as any[]
}

async function load() {
  tree.value = await request.get('/system/menu/tree')
  tableRows.value = toRows(tree.value)
}

function reset() {
  query.name = ''
  load()
}

function toggleExpand() {
  expanded.value = !expanded.value
  expandKey.value++
}

function openCreate(parentId: number) {
  editing.value = false
  Object.assign(form, { id: 0, parentId, name: '', type: parentId === 0 ? 1 : 2, menuScope: 2, client: 1, path: '', microName: '', component: '', icon: '', sort: 0, visible: 0, status: 0 })
  loadMicroApps()
  dialog.value = true
}

function openEdit(row: any) {
  editing.value = true
  Object.assign(form, {
    id: row.id, parentId: row.parentId, name: row.name, type: row.type, menuScope: row.menuScope,
    client: Number(row.client ?? 1),
    path: row.path ?? '', microName: row.microName ?? '', component: row.component ?? '', icon: row.icon ?? '', sort: row.sort ?? 0,
    visible: row.visible ?? 0, status: row.status ?? 0
  })
  loadMicroApps()
  dialog.value = true
}

async function doSubmit() {
  if (form.type === 3) {
    if (!form.microName?.trim() || !form.path?.trim().startsWith('/')) {
      ElMessage.warning('子应用页面须选择所属子应用，且路由地址为以 / 开头的内部路由')
      return
    }
  }
  if (editing.value) {
    await request.put('/system/menu', { ...form })
  } else {
    await request.post('/system/menu', { ...form })
  }
  ElMessage.success('保存成功')
  dialog.value = false
  load()
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确定删除菜单「${row.name}」？`, '提示', { type: 'warning' })
  await request.delete(`/system/menu/${row.id}`)
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
.tip {
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}
.menu-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  vertical-align: middle;
}
</style>
