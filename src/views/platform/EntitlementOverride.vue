<template>
  <div class="page-card">
    <div class="toolbar">
      <span class="hint">租户级特批：覆盖为绝对值（最高优先），订购附加项按数量累加配额</span>
    </div>
    <el-form inline size="small" @submit.prevent>
      <el-form-item label="租户">
        <el-select v-model="tenantId" filterable placeholder="选择租户" style="width: 240px" @change="load">
          <el-option v-for="t in tenants" :key="t.id" :label="t.name + '（' + t.code + '）'" :value="t.id" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="load">查询</el-button>
      </el-form-item>
    </el-form>

    <template v-if="loaded">
      <h4>当前生效权益（全链计算结果）</h4>
      <el-table :data="effectiveRows" size="small" border>
        <el-table-column prop="code" label="权益项" width="220" />
        <el-table-column prop="value" label="生效值" width="140" />
        <el-table-column prop="source" label="来源" />
      </el-table>

      <h4>租户覆盖（绝对值）</h4>
      <div v-for="(entry, index) in overrideRows" :key="index" class="item-row">
        <el-select v-model="entry.itemId" filterable placeholder="权益项" style="width: 220px">
          <el-option v-for="it in entitlementItems" :key="it.id" :value="Number(it.id)"
                     :label="`${it.name}（${it.itemCode}）`" />
        </el-select>
        <el-input v-model="entry.itemValue" placeholder="覆盖值（空=回退链值）" style="width: 180px" />
        <el-button v-permission="'tenant:entitlement:update'" type="primary" size="small" @click="saveOverride(entry)">保存</el-button>
        <el-button v-permission="'tenant:entitlement:delete'" size="small" @click="deleteOverride(entry)">清除</el-button>
      </div>
      <el-button v-permission="'tenant:entitlement:update'" size="small"
                 @click="overrideRows.push({ itemId: null, itemValue: '' })">添加覆盖</el-button>

      <h4>附加项订购</h4>
      <el-table :data="subscriptions" size="small" border>
        <el-table-column label="附加项" width="160">
          <template #default="{ row }">
            {{ addonLabel(row.addonId) }}
          </template>
        </el-table-column>
        <el-table-column prop="qty" label="数量" width="80" />
        <el-table-column label="状态" width="70">
          <template #default="{ row }">
            <el-tag :type="row.status === 0 ? 'success' : 'info'" size="small">{{ row.status === 0 ? '生效' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button v-permission="'tenant:entitlement:delete'" link type="danger" size="small"
                       @click="unsubscribe(row)">退订</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-form inline size="small" style="margin-top: 8px" @submit.prevent>
        <el-form-item label="订购">
          <el-select v-model="subscribeAddonId" filterable placeholder="附加项" style="width: 200px">
            <el-option v-for="a in addons" :key="a.id" :value="Number(a.id)" :label="`${a.name}（${a.code}）`" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="subscribeQty" :min="1" :controls="false" style="width: 80px" />
        </el-form-item>
        <el-form-item>
          <el-button v-permission="'tenant:entitlement:update'" type="primary" @click="subscribe">订购</el-button>
        </el-form-item>
      </el-form>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/request'

const tenantId = ref<number | null>(null)
const tenants = ref<any[]>([])
const loaded = ref(false)
const effective = ref<any>(null)
const overrides = ref<any[]>([])
const subscriptions = ref<any[]>([])
const entitlementItems = ref<any[]>([])
const addons = ref<any[]>([])
const overrideRows = ref<{ itemId: number | null; itemValue: string }[]>([])
const subscribeAddonId = ref<number | null>(null)
const subscribeQty = ref(1)

function itemCode(itemId: any): string {
  const item = entitlementItems.value.find((it) => Number(it.id) === Number(itemId))
  return item ? item.itemCode : String(itemId)
}
function addonLabel(addonId: any): string {
  const addon = addons.value.find((a) => Number(a.id) === Number(addonId))
  return addon ? `${addon.name}（${addon.code}）` : String(addonId)
}

const effectiveRows = computed(() => {
  const rows: { code: string; value: string; source: string }[] = []
  const quotas = effective.value?.quotas || {}
  const features = effective.value?.features || {}
  for (const [code, value] of Object.entries(quotas)) rows.push({ code, value: String(value), source: '配额（链上累加后）' })
  for (const [code, value] of Object.entries(features)) rows.push({ code, value: String(value), source: '功能开关' })
  return rows
})

async function load() {
  if (!tenantId.value) return
  const res = await request.get(`/tenant/entitlement/${tenantId.value}`)
  effective.value = res.effective
  overrides.value = res.overrides || []
  subscriptions.value = res.subscriptions || []
  entitlementItems.value = res.entitlementItems || []
  addons.value = res.addons || []
  overrideRows.value = overrides.value.map((ov: any) => ({ itemId: Number(ov.itemId), itemValue: ov.itemValue || '' }))
  loaded.value = true
}

async function saveOverride(entry: { itemId: number | null; itemValue: string }) {
  if (!entry.itemId) return ElMessage.warning('请选择权益项')
  await request.put('/tenant/entitlement/override', {
    tenantId: tenantId.value, itemId: entry.itemId, itemValue: entry.itemValue || null
  })
  ElMessage.success('覆盖已保存（权益缓存已失效）')
  await load()
}
async function deleteOverride(entry: { itemId: number | null }) {
  if (!entry.itemId) return
  await request.delete(`/tenant/entitlement/override/${tenantId.value}/${entry.itemId}`)
  ElMessage.success('覆盖已清除')
  await load()
}
async function subscribe() {
  if (!subscribeAddonId.value) return ElMessage.warning('请选择附加项')
  await request.put('/tenant/entitlement/subscribe', {
    tenantId: tenantId.value, addonId: subscribeAddonId.value, qty: subscribeQty.value
  })
  ElMessage.success('已订购（权益缓存已失效）')
  await load()
}
async function unsubscribe(row: any) {
  await ElMessageBox.confirm(`确认退订「${addonLabel(row.addonId)}」？对应权益随即失效。`, '退订确认', { type: 'warning' })
  await request.delete(`/tenant/entitlement/subscribe/${tenantId.value}/${row.addonId}`)
  ElMessage.success('已退订')
  await load()
}

onMounted(async () => {
  // 租户下拉候选（全量含停用；选择后经 @change 触发 load）
  try {
    const data = await request.get('/tenant/page', { params: { pageNum: 1, pageSize: 999 } })
    tenants.value = data.records ?? []
  } catch { tenants.value = [] }
})
</script>

<style scoped>
.toolbar { margin-bottom: 8px; }
.hint { color: var(--el-text-color-secondary); font-size: 12px; }
h4 { margin: 14px 0 6px; }
.item-row { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
</style>
