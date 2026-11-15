<template>
  <div class="canvas" @dragover="grid.onCanvasDragOver" @drop="onDrop">
    <el-row :gutter="10">
      <el-col
        v-for="(widget, index) in widgets"
        :key="widget.id"
        class="widget-col"
        :xs="24"
        :sm="24"
        :md="widget.span || 24"
        :style="colStyle(widget)"
      >
        <div
          class="widget-card"
          :class="{ dimmed: editable && widget.enabled === false, dragging: grid.draggingIndex.value === index }"
          :draggable="grid.draggingIndex.value === index"
          @dragstart="grid.onDragStart($event, index)"
          @dragenter="grid.onDragEnter($event, index)"
          @dragend="grid.onDragEnd"
        >
          <div v-if="widget.title || editable" class="widget-head">
            <span
              v-if="editable"
              class="drag-handle"
              title="拖动调整位置"
              @mousedown="grid.onHandleDown(index)"
              @mouseup="grid.onHandleUp"
            ><el-icon><Rank /></el-icon></span>
            <span class="widget-title">{{ widget.title }}</span>
            <span v-if="editable" class="head-actions">
              <el-tooltip content="减窄" placement="top"><el-icon @click="emit('span-change', index, -1)"><Remove /></el-icon></el-tooltip>
              <el-tooltip content="加宽" placement="top"><el-icon @click="emit('span-change', index, 1)"><CirclePlus /></el-icon></el-tooltip>
              <!-- 内容级配置：管理设计器为属性配置；用户首页仅数据卡开放「卡片参数」（仅本人生效） -->
              <template v-if="configurable">
                <el-tooltip content="卡片参数" placement="top"><el-icon @click="emit('edit', index)"><Setting /></el-icon></el-tooltip>
                <el-tooltip :content="widget.enabled === false ? '已停用，点击启用' : '启用中，点击停用'" placement="top">
                  <el-icon :class="{ off: widget.enabled === false }" @click="emit('toggle', index)">
                    <TurnOff v-if="widget.enabled === false" />
                    <Open v-else />
                  </el-icon>
                </el-tooltip>
              </template>
              <el-tooltip content="移除" placement="top"><el-icon class="danger" @click="emit('remove', index)"><Delete /></el-icon></el-tooltip>
            </span>
          </div>
          <div class="widget-body">
            <component :is="meta(widget.type).component" :widget="widget" />
          </div>
        </div>
      </el-col>
    </el-row>
    <div v-if="!visibleCount" class="canvas-empty">
      <el-empty :image-size="72" :description="editable ? '从左侧拖入或点击添加卡片' : '首页暂无内容，请让管理员在「首页配置」中设置'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import { isWidgetType, widgetRegistry } from './widgets'
import { useDragGrid } from './useDragGrid'
import type { HomeWidget, WidgetType } from './types'
import { useUserStore } from '../stores/user'

const props = withDefaults(
  defineProps<{
    widgets: HomeWidget[]
    /** 编辑态：显示拖拽手柄与卡片操作条（排序/宽度/属性/启停/移除） */
    editable?: boolean
    /** 是否开放内容级配置（属性/启停）；用户首页传 false 只保留摆放与移除 */
    configurable?: boolean
    /** 渲染与编辑均按可见性过滤（角色任一持有，旧数据兼容权限码；管理设计器传 false 以便看到全部卡片） */
    filterPermission?: boolean
  }>(),
  { editable: false, configurable: true, filterPermission: true }
)

const emit = defineEmits<{
  (e: 'edit', index: number): void
  (e: 'remove', index: number): void
  (e: 'toggle', index: number): void
  (e: 'span-change', index: number, delta: number): void
  (e: 'add-widget', type: WidgetType): void
}>()

const userStore = useUserStore()
const grid = useDragGrid(() => props.widgets, { canDrag: () => props.editable })

/** 可见卡片数（用于空态判断）：不满足可见性的卡始终隐藏（filterPermission 时）；停用卡仅查看态隐藏 */
const visibleCount = computed(
  () => props.widgets.filter((w) => permOk(w) && (props.editable || w.enabled !== false)).length
)

function permOk(w: HomeWidget): boolean {
  if (!props.filterPermission) return true
  // 旧权限码字段（保留兼容）+ 角色可见性：配置了角色清单时持有任一角色才可见，空=登录可见
  if (w.permission && !userStore.hasPermission(w.permission)) return false
  if (w.roles?.length && !w.roles.some((code) => userStore.roles.includes(code))) return false
  return true
}

/** 隐藏卡片宽度置 0 保持 v-for 索引稳定（拖拽按原数组下标工作）：
 *  停用卡在设计态置灰可见、查看态隐藏；不满足可见性的卡始终隐藏 */
function colStyle(widget: HomeWidget): CSSProperties {
  const hidden = (!props.editable && widget.enabled === false) || !permOk(widget)
  return hidden ? { display: 'none' } : {}
}

function meta(type: string) {
  return isWidgetType(type) ? widgetRegistry[type] : widgetRegistry.list
}

function onDrop(e: DragEvent) {
  grid.onCanvasDrop(e, (type) => emit('add-widget', type))
}
</script>

<style scoped>
.canvas {
  min-height: 200px;
}
.widget-col {
  margin-bottom: 10px;
}
.widget-card {
  background: var(--mse-card-bg);
  border: 1px solid var(--mse-card-border);
  border-radius: 6px;
  padding: 10px 12px;
  transition: box-shadow 0.2s;
}
.widget-card:hover {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}
.widget-card.dragging {
  opacity: 0.55;
  border-style: dashed;
  border-color: var(--el-color-primary);
}
.widget-card.dimmed {
  opacity: 0.55;
}
.widget-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  min-height: 20px;
}
.drag-handle {
  cursor: grab;
  color: var(--el-border-color-darker);
  display: inline-flex;
}
.drag-handle:hover {
  color: var(--el-color-primary);
}
.widget-title {
  font-weight: bold;
  font-size: 14px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.head-actions {
  display: none;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
}
.widget-card:hover .head-actions {
  display: inline-flex;
}
.head-actions .el-icon {
  cursor: pointer;
}
.head-actions .el-icon:hover {
  color: var(--el-color-primary);
}
.head-actions .el-icon.danger:hover {
  color: var(--el-color-danger);
}
.head-actions .el-icon.off {
  color: var(--el-border-color-darker);
}
.widget-body {
  font-size: 13px;
}
.canvas-empty {
  padding: 24px 0;
}
</style>
