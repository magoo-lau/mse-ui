<template>
  <div class="page-card">
    <div class="toolbar">
      <el-button v-permission="'tenant:addon:create'" type="primary" @click="openCreate">新增附加项</el-button>
      <right-toolbar @refresh="load" />
    </div>
    <el-table :data="rows" size="small" border>
      <el-table-column prop="addon.code" label="编码" width="140" />
      <el-table-column prop="addon.name" label="名称" width="140" />
      <el-table-column label="授权权益项">
        <template #default="{ row }">
          <el-tag v-for="it in row.items" :key="it.id" size="small" class="tag-gap"
                  :type="Number(it.itemType ?? itemTypeOf(it.itemId)) === 2 ? 'warning' : 'info'">
            {{ itemLabel(it.itemId) }}{{ it.itemValue ? '=' + it.itemValue : '' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="addon.remark" label="备注" show-overflow-tooltip />
      <el-table-column label="状态" width="70">
        <template #default="{ row }">
          <el-tag :type="row.addon.status === 0 ? 'success' : 'danger'" size="small">
            {{ row.addon.status === 0 ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130">
        <template #default="{ row }">
          <el-button v-permission="'tenant:addon:update'" link type="primary" size="small" @click="openEdit(row)">修改</el-button>
          <el-button v-permission="'tenant:addon:delete'" link type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="editing ? '修改附加项' : '新增附加项'" width="560px">
      <el-form :model="form" label-width="90px" size="small">
        <el-form-item label="编码"><el-input v-model="form.code" placeholder="如 extra-seats" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="0" :inactive-value="1" />
        </el-form-item>
        <el-form-item label="授权项">
          <div v-for="(entry, index) in form.items" :key="index" class="item-row">
            <el-select v-model="entry.itemId" filterable placeholder="权益项" style="width: 200px">
              <el-option v-for="it in entitlementItems" :key="it.id" :value="Number(it.id)"
                         :label="`${it.name}（${it.itemCode}）`" />
            </el-select>
            <el-input v-model="entry.itemValue" placeholder="值（配额为数量）" style="width: 140px" />
            <el-button link type="danger" @click="form.items.splice(index, 1)">删除</el-button>
          </div>
          <el-button size="small" @click="form.items.push({ itemId: null, itemValue: '' })">添加权益项</el-button>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/request'
import RightToolbar from '../../components/RightToolbar.vue'

const rows = ref<any[]>([])
const entitlementItems = ref<any[]>([])
const dialog = ref(false)
const editing = ref(false)
const form = reactive({ id: 0, code: '', name: '', remark: '', status: 0, items: [] as { itemId: number | null; itemValue: string }[] })

function itemLabel(itemId: any): string {
  const item = entitlementItems.value.find((it) => Number(it.id) === Number(itemId))
  return item ? item.itemCode : String(itemId)
}
function itemTypeOf(itemId: any): number {
  const item = entitlementItems.value.find((it) => Number(it.id) === Number(itemId))
  return item ? Number(item.itemType) : 1
}

async function load() {
  const res = await request.get('/tenant/addon/list')
  rows.value = res.rows || []
  entitlementItems.value = res.entitlementItems || []
}

function openCreate() {
  editing.value = false
  Object.assign(form, { id: 0, code: '', name: '', remark: '', status: 0, items: [{ itemId: null, itemValue: '' }] })
  dialog.value = true
}
function openEdit(row: any) {
  editing.value = true
  Object.assign(form, {
    id: row.addon.id,
    code: row.addon.code,
    name: row.addon.name,
    remark: row.addon.remark,
    status: row.addon.status,
    items: (row.items || []).map((it: any) => ({ itemId: Number(it.itemId), itemValue: it.itemValue || '' }))
  })
  dialog.value = true
}
async function save() {
  if (editing.value) {
    await request.put('/tenant/addon', { ...form })
  } else {
    await request.post('/tenant/addon', { ...form })
  }
  ElMessage.success('已保存（权益缓存已失效）')
  dialog.value = false
  await load()
}
async function remove(row: any) {
  await ElMessageBox.confirm(`确认删除附加项「${row.addon.name}」？已订购租户将失去对应权益。`, '删除确认', { type: 'warning' })
  await request.delete(`/tenant/addon/${row.addon.id}`)
  ElMessage.success('已删除')
  await load()
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.tag-gap { margin-right: 4px; }
.item-row { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
</style>
