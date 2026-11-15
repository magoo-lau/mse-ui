<template>
  <div v-loading="loading" class="list-body">
    <div class="list-toolbar">
      <span v-if="total > 0" class="list-count">共 {{ total }} 条</span>
      <el-icon class="list-refresh" title="刷新" @click="reload"><Refresh /></el-icon>
    </div>
    <template v-if="!error">
      <div
        v-for="(row, i) in rows"
        :key="i"
        class="list-row"
        :class="{ clickable: !!linkPath }"
        @click="goRow(row)"
      >
        <div class="row-main">
          <span class="row-title">{{ rowTitle(row) || '（无标题）' }}</span>
          <span v-if="rowSub(row)" class="row-sub">{{ rowSub(row) }}</span>
        </div>
        <span v-if="rowTime(row)" class="row-time">{{ rowTime(row) }}</span>
      </div>
      <el-empty v-if="!loading && !rows.length" :image-size="56" description="暂无数据" />
    </template>
    <div v-else class="list-error">
      <span>数据加载失败</span>
      <el-button size="small" text type="primary" @click="reload">重试</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useRouter } from 'vue-router'
import type { HomeWidget } from '../types'
import { formatTime, toRows, useWidgetData } from '../useWidgetData'

const props = defineProps<{ widget: HomeWidget }>()
const router = useRouter()

const { loading, error, data, reload } = useWidgetData(toRef(props, 'widget'))

const rows = computed(() => toRows(data.value))
const total = computed(() => {
  const obj = data.value as { total?: number } | null
  if (obj && typeof obj.total === 'number') return obj.total
  return rows.value.length
})
const linkPath = computed(() => props.widget.link || '')

function field(row: Record<string, unknown>, key?: string): unknown {
  return key ? row[key] : undefined
}
function rowTitle(row: Record<string, unknown>): string {
  const v = field(row, props.widget.fieldMap?.title)
  return v == null ? '' : String(v)
}
function rowSub(row: Record<string, unknown>): string {
  const v = field(row, props.widget.fieldMap?.sub)
  return v == null ? '' : String(v)
}
function rowTime(row: Record<string, unknown>): string {
  return formatTime(field(row, props.widget.fieldMap?.time))
}
function goRow(row: Record<string, unknown>) {
  if (!linkPath.value) return
  router.push(renderLink(linkPath.value, row))
}

/** 跳转链接支持 {字段名} 占位（路径段与查询参数均可），点击时以该行数据替换 */
function renderLink(tpl: string, row: Record<string, unknown>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = row[key]
    return v == null ? '' : encodeURIComponent(String(v))
  })
}
</script>

<style scoped>
.list-body {
  min-height: 120px;
}
.list-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  min-height: 20px;
}
.list-count {
  color: #909399;
  font-size: 12px;
}
.list-refresh {
  cursor: pointer;
  color: #909399;
}
.list-refresh:hover {
  color: #409eff;
}
.list-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 7px 2px;
  border-bottom: 1px solid #f2f4f7;
  font-size: 13px;
}
.list-row:last-of-type {
  border-bottom: none;
}
.list-row.clickable {
  cursor: pointer;
}
.list-row.clickable:hover .row-title {
  color: #409eff;
}
.row-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.row-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-sub {
  flex-shrink: 0;
  color: #909399;
  font-size: 12px;
  background: #f4f6f9;
  border-radius: 3px;
  padding: 1px 6px;
}
.row-time {
  flex-shrink: 0;
  color: #909399;
  font-size: 12px;
}
.list-error {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f56c6c;
  font-size: 13px;
  padding: 12px 0;
}
</style>
