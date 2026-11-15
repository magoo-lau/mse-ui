<template>
  <div class="portal">
    <!-- 自定义模式横幅（主题/自定义按钮在顶部导航栏，见 Layout.vue） -->
    <div v-if="portal.customizing" class="edit-banner">
      <span>正在自定义首页：拖动卡片调整位置，从可选块中添加卡片，选择主题背景</span>
      <span class="banner-actions">
        <el-button size="small" @click="portal.addDrawerVisible = true">添加卡片</el-button>
        <el-button size="small" type="warning" plain @click="portal.resetCustomize()">恢复默认</el-button>
        <el-button size="small" @click="portal.cancelCustomize()">取消</el-button>
        <el-button size="small" type="primary" :loading="portal.saving" @click="portal.saveCustomize()">保存</el-button>
      </span>
    </div>

    <HomeCanvas
      :widgets="portal.customizing ? portal.draftLayout : portal.effectiveLayout"
      :editable="portal.customizing"
      :configurable="true"
      filter-permission
      @remove="portal.removeDraft"
      @span-change="portal.spanDraft"
      @toggle="portal.toggleDraft"
      @edit="openWidgetConfig"
      @add-widget="() => {}"
    />

    <!-- 卡片参数设置（仅数据卡：标题/接口/参数/字段映射等，仅本人生效） -->
    <WidgetUserConfig
      v-model:widget="configWidget"
      :baseline="configBaseline"
      :has-override="configHasOverride"
      @save="doSaveWidgetConfig"
      @clear="doClearWidgetConfig"
    />

    <!-- 添加卡片：管理员预设的可选块目录 + 模板默认布局卡片（无权限的自动隐藏）；
         模板布局内的卡片同样可挑：用户删掉的卡（如网页嵌入）随时加得回来 -->
    <el-drawer v-model="portal.addDrawerVisible" title="添加卡片" size="360px" :append-to-body="true">
      <div class="catalog-list">
        <div v-for="item in catalog" :key="item.id" class="catalog-item" @click="portal.addFromCatalog(item)">
          <el-icon :size="20" class="catalog-icon"><component :is="meta(item.type).icon" /></el-icon>
          <span class="catalog-title">{{ item.title || meta(item.type).label }}</span>
          <span class="catalog-desc">{{ meta(item.type).label }}</span>
          <el-tag v-if="portal.isAdded(item.id)" size="small" type="info">已添加</el-tag>
          <el-icon v-else class="catalog-add"><Plus /></el-icon>
        </div>
        <el-empty v-if="!catalog.length" :image-size="64" description="管理员尚未开放可选卡片" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortalStore } from '../stores/portal'
import { useUserStore } from '../stores/user'
import HomeCanvas from '../home/HomeCanvas.vue'
import WidgetUserConfig from '../home/WidgetUserConfig.vue'
import { widgetRegistry, isWidgetType } from '../home/widgets'
import type { HomeWidget } from '../home/types'

const portal = usePortalStore()
const userStore = useUserStore()

const catalog = computed(() => {
  const tpl = portal.resolvedTemplate
  const items = [...(tpl.catalog || [])]
  // 模板默认布局里的卡片也进目录（按 id 去重）：仅靠可选块目录时，布局专属卡删除后无处重加
  for (const w of tpl.layout) {
    if (!items.some((i) => i.id === w.id)) items.push(w)
  }
  return items.filter((item) => permOk(item))
})

function permOk(widget: HomeWidget): boolean {
  // 与 HomeCanvas 同口径：旧权限码字段（保留兼容）+ 角色可见性（持有任一角色即显示），空=登录可见
  if (widget.permission && !userStore.hasPermission(widget.permission)) return false
  if (widget.roles?.length && !widget.roles.some((code) => userStore.roles.includes(code))) return false
  return true
}

function meta(type: string) {
  return isWidgetType(type) ? widgetRegistry[type] : widgetRegistry.list
}

// ===== 卡片参数设置（数据卡 list/stat/search；仅本人生效） =====
const DATA_WIDGET_TYPES = ['list', 'stat', 'search']
const configWidget = ref<HomeWidget | null>(null)
const configBaseline = ref<HomeWidget | null>(null)
const configHasOverride = computed(() => {
  const id = configWidget.value?.id
  return !!id && !!portal.userSetting?.overrides?.[id]
})

function openWidgetConfig(index: number) {
  const widget = portal.draftLayout[index]
  if (!widget) return
  if (!DATA_WIDGET_TYPES.includes(widget.type)) {
    ElMessage.info('该类卡片暂无可自定义参数')
    return
  }
  // 管理员基线 = 模板同 id 卡片（用户自添加卡片基线即自身，差异全量记录）
  configBaseline.value = portal.resolvedTemplate.layout.find((w) => w.id === widget.id) ?? widget
  configWidget.value = widget
}

async function doSaveWidgetConfig(patch: Partial<HomeWidget>) {
  const widget = configWidget.value
  if (!widget) return
  try {
    await portal.saveWidgetOverride(widget.id, patch)
    // 同步自定义草稿，保存个性化布局时不丢本次覆盖效果
    const draft = portal.draftLayout.find((w) => w.id === widget.id)
    if (draft) Object.assign(draft, patch)
    ElMessage.success('已保存，仅本人生效')
    configWidget.value = null
  } catch {
    /* 全局提示已处理 */
  }
}

async function doClearWidgetConfig() {
  const widget = configWidget.value
  if (!widget) return
  try {
    await portal.clearWidgetOverride(widget.id)
    const baseline = portal.resolvedTemplate.layout.find((w) => w.id === widget.id)
    const draft = portal.draftLayout.find((w) => w.id === widget.id)
    if (draft && baseline) {
      // 草稿回退到管理员基线内容（宽度/启停摆放保留）
      const span = draft.span
      const enabled = draft.enabled
      Object.assign(draft, JSON.parse(JSON.stringify(baseline)) as HomeWidget, { span, enabled })
    }
    ElMessage.success('已清除该卡片的自定义参数')
    configWidget.value = null
  } catch {
    /* 全局提示已处理 */
  }
}

onMounted(() => portal.load())
</script>

<style scoped>
.portal {
  min-height: calc(100vh - 130px);
}
.edit-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  background: var(--el-color-primary-light-9);
  border: 1px dashed var(--el-color-primary-light-5);
  color: var(--el-color-primary);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 10px;
  font-size: 13px;
}
.banner-actions {
  display: flex;
  gap: 8px;
}
.catalog-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.catalog-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--mse-card-border);
  background: var(--mse-card-bg);
  border-radius: 6px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.catalog-item:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 10px rgba(64, 158, 255, 0.12);
}
.catalog-icon {
  color: var(--el-color-primary);
}
.catalog-title {
  font-size: 13px;
  font-weight: bold;
}
.catalog-desc {
  flex: 1;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.catalog-add {
  color: var(--el-color-primary);
}
</style>
