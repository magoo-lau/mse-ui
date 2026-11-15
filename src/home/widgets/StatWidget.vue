<template>
  <div v-loading="loading" class="stat-body">
    <div class="stat-toolbar">
      <el-icon class="stat-refresh" title="刷新" @click="reload"><Refresh /></el-icon>
    </div>
    <template v-if="!error">
      <div class="stat-grid">
        <div v-for="m in metrics" :key="m.field" class="stat-item">
          <div class="stat-value">{{ valueOf(m.field) }}<span v-if="m.suffix" class="stat-suffix">{{ m.suffix }}</span></div>
          <div class="stat-label">{{ m.label }}</div>
        </div>
      </div>
      <el-empty v-if="!loading && !metrics.length" :image-size="48" description="未配置指标" />
    </template>
    <div v-else class="stat-error">
      <span>数据加载失败</span>
      <el-button size="small" text type="primary" @click="reload">重试</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { HomeWidget } from '../types'
import { useWidgetData } from '../useWidgetData'

const props = defineProps<{ widget: HomeWidget }>()
const { loading, error, data, reload } = useWidgetData(toRef(props, 'widget'))

const metrics = computed(() => props.widget.metrics || [])

function valueOf(field: string): string {
  const obj = data.value as Record<string, unknown> | null
  const v = obj ? obj[field] : undefined
  if (v == null) return '-'
  if (typeof v === 'number') return v.toLocaleString('zh-CN')
  return String(v)
}
</script>

<style scoped>
.stat-body {
  min-height: 100px;
}
.stat-toolbar {
  display: flex;
  justify-content: flex-end;
  min-height: 16px;
}
.stat-refresh {
  cursor: pointer;
  color: var(--el-text-color-secondary);
}
.stat-refresh:hover {
  color: var(--el-color-primary);
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 10px;
}
.stat-item {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 12px 8px;
  text-align: center;
}
.stat-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.stat-suffix {
  font-size: 12px;
  font-weight: normal;
  color: var(--el-text-color-secondary);
  margin-left: 2px;
}
.stat-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}
.stat-error {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-color-danger);
  font-size: 13px;
  padding: 12px 0;
}
</style>
