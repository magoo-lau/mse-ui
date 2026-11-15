<template>
  <div class="page">
    <el-card shadow="never">
      <div class="table-toolbar">
        <div class="left">
          <el-button v-permission="'system:micro-app:create'" type="primary" icon="Plus" @click="openCreate">接入子应用</el-button>
          <el-button icon="Refresh" @click="load">刷新</el-button>
        </div>
        <right-toolbar @refresh="load" />
      </div>

      <el-table :data="rows" border>
        <el-table-column prop="name" label="标识" width="120">
          <template #default="{ row }">
            <span>/sub/{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="显示名" width="140" />
        <el-table-column prop="devEntry" label="开发入口" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.devEntry || '-' }}</template>
        </el-table-column>
        <el-table-column prop="prodEntry" label="生产入口" min-width="150" show-overflow-tooltip />
        <el-table-column label="可见端" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="['success', 'warning', 'primary'][Number(row.side) - 1]">
              {{ SIDE_LABELS[Number(row.side)] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="客户端" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="Number(row.client ?? 1) === 2 ? 'danger' : 'info'">
              {{ Number(row.client ?? 1) === 2 ? '移动端' : 'PC' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="70" align="center" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-switch v-permission="'system:micro-app:update'" :model-value="row.status === 0"
                       @change="changeStatus(row, $event)" />
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'system:micro-app:update'" link type="primary" icon="EditPen" @click="openEdit(row)">编辑</el-button>
            <el-button v-permission="'system:micro-app:delete'" link type="danger" icon="Delete" @click="doDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialog" :title="form.id ? '编辑子应用' : '接入子应用'" width="620px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="标识" required>
          <el-input v-model="form.name" placeholder="小写字母开头，如 oa（路由前缀 /sub/oa，与子应用构建 --base=/sub-apps/oa/ 对应）" />
        </el-form-item>
        <el-form-item label="显示名" required>
          <el-input v-model="form.title" placeholder="侧边菜单父级标题" />
        </el-form-item>
        <el-form-item label="开发入口">
          <el-input v-model="form.devEntry" placeholder="//localhost:3400（本地开发子应用 dev server）" />
        </el-form-item>
        <el-form-item label="生产入口" required>
          <el-input v-model="form.prodEntry" placeholder="/sub-apps/oa/（与 nginx 部署路径一致）" />
        </el-form-item>
        <el-form-item label="可见端" required>
          <el-radio-group v-model="form.side">
            <el-radio :value="1">租户端</el-radio>
            <el-radio :value="2">平台端</el-radio>
            <el-radio :value="3">双端</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="客户端">
          <el-radio-group v-model="form.client">
            <el-radio :value="1">PC 基座</el-radio>
            <el-radio :value="2">移动基站</el-radio>
          </el-radio-group>
          <div v-if="form.client === 2" class="tip" style="width: 100%">移动端子应用由移动基站（/m/）加载，生产入口部署于 /m-apps/{标识}/。</div>
        </el-form-item>
        <el-form-item label=" ">
          <div class="tip">页面菜单请在「平台管理 → 菜单管理」维护（类型 = 子应用页面）；未配置页面菜单的子应用在侧边栏渲染为单个菜单项。</div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" />
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
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/request'
import RightToolbar from '../../components/RightToolbar.vue'

const SIDE_LABELS: Record<number, string> = { 1: '租户端', 2: '平台端', 3: '双端' }

const rows = ref<any[]>([])
const dialog = ref(false)
const form = reactive<{ id: number | null; name: string; title: string; devEntry: string; prodEntry: string;
  side: number; client: number; sort: number; status: number; remark: string }>(initForm())

function initForm() {
  return { id: null, name: '', title: '', devEntry: '', prodEntry: '', side: 1, client: 1, sort: 0, status: 0, remark: '' }
}

async function load() {
  rows.value = await request.get('/system/micro-app/list')
}

function openCreate() {
  Object.assign(form, initForm())
  dialog.value = true
}

function openEdit(row: any) {
  Object.assign(form, initForm())
  form.id = row.id
  form.name = row.name
  form.title = row.title
  form.devEntry = row.devEntry || ''
  form.prodEntry = row.prodEntry || ''
  form.side = Number(row.side)
  form.client = Number(row.client ?? 1)
  form.sort = row.sort ?? 0
  form.status = row.status ?? 0
  form.remark = row.remark || ''
  dialog.value = true
}

async function doSubmit() {
  if (!form.name.trim() || !form.title.trim() || !form.prodEntry.trim()) {
    ElMessage.warning('请填写标识、显示名与生产入口')
    return
  }
  const payload = {
    id: form.id,
    name: form.name.trim(),
    title: form.title.trim(),
    devEntry: form.devEntry.trim(),
    prodEntry: form.prodEntry.trim(),
    side: form.side,
    client: form.client,
    sort: form.sort,
    status: form.status,
    remark: form.remark
  }
  if (form.id) {
    await request.put('/system/micro-app', payload)
  } else {
    await request.post('/system/micro-app', payload)
  }
  ElMessage.success('保存成功（用户重新登录后生效）')
  dialog.value = false
  load()
}

async function changeStatus(row: any, enable: any) {
  await request.post(`/system/micro-app/${row.id}/status`, null, { params: { enable: !!enable } })
  load()
}

async function doDelete(row: any) {
  await ElMessageBox.confirm(`确定删除子应用「${row.title}」？侧边栏将不再展示。`, '提示', { type: 'warning' })
  await request.delete(`/system/micro-app/${row.id}`)
  ElMessage.success('删除成功')
  load()
}

onMounted(load)
</script>

<style scoped>
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
</style>
