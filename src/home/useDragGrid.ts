import { ref, type Ref } from 'vue'
import type { HomeWidget, WidgetType } from './types'

/** 画布外拖入的新卡片类型标记（palette → canvas） */
export const DROP_NEW_WIDGET = 'application/x-mse-new-widget'

/**
 * 12/24 栅格画布的 HTML5 拖拽排序引擎（零依赖）：
 * - 画布内卡片经拖拽手柄拖动，dragenter 时实时换位（live sorting）；
 * - 组件库（设计器左侧/添加卡片抽屉）拖入时经 DROP_NEW_WIDGET 标记追加到末尾。
 * 返回的处理器由 HomeCanvas 绑定，设计器与用户自定义模式共用。
 */
export function useDragGrid(widgets: Ref<HomeWidget[]> | (() => HomeWidget[]), options?: { canDrag?: () => boolean }) {
  /** 正在拖动的卡片下标（-1 = 无）；同时作为该卡片 draggable 的开启开关 */
  const draggingIndex = ref(-1)
  const inDrag = ref(false)

  const arr = (): HomeWidget[] => (typeof widgets === 'function' ? widgets() : widgets.value)

  function canDrag(): boolean {
    return options?.canDrag ? options.canDrag() : true
  }

  /** 拖拽手柄按下才允许该卡片被拖动（避免整卡 draggable 干扰内部点击/滚动） */
  function onHandleDown(index: number) {
    if (canDrag()) draggingIndex.value = index
  }

  function onHandleUp() {
    if (draggingIndex.value >= 0 && !inDrag.value) draggingIndex.value = -1
  }

  function onDragStart(e: DragEvent, index: number) {
    if (!canDrag() || draggingIndex.value !== index) {
      e.preventDefault()
      return
    }
    inDrag.value = true
    e.dataTransfer?.setData('text/plain', String(index))
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  /** 拖经其他卡片时实时换位，形成插入预览 */
  function onDragEnter(e: DragEvent, index: number) {
    if (!inDrag.value || draggingIndex.value === index) return
    const list = arr()
    const moved = list.splice(draggingIndex.value, 1)[0]
    list.splice(index, 0, moved)
    draggingIndex.value = index
  }

  function onDragEnd() {
    inDrag.value = false
    draggingIndex.value = -1
  }

  /** 组件库条目开始拖出新卡片 */
  function onPaletteDragStart(e: DragEvent, type: WidgetType) {
    if (!canDrag()) {
      e.preventDefault()
      return
    }
    e.dataTransfer?.setData(DROP_NEW_WIDGET, type)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
  }

  /** 画布放行：仅当有卡片拖动或新卡片拖入时 */
  function onCanvasDragOver(e: DragEvent) {
    if (inDrag.value || e.dataTransfer?.types?.includes(DROP_NEW_WIDGET)) e.preventDefault()
  }

  /** 画布落下：新卡片追加到末尾（回调由调用方提供实际创建逻辑） */
  function onCanvasDrop(e: DragEvent, onNewWidget: (type: WidgetType) => void) {
    const type = e.dataTransfer?.getData(DROP_NEW_WIDGET) as WidgetType | ''
    if (type) onNewWidget(type)
  }

  return {
    draggingIndex,
    inDrag,
    onHandleDown,
    onHandleUp,
    onDragStart,
    onDragEnter,
    onDragEnd,
    onPaletteDragStart,
    onCanvasDragOver,
    onCanvasDrop
  }
}
