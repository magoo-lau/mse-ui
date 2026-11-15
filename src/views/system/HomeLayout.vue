<template>
  <div class="designer">
    <!-- 顶部工具条 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <b>首页配置</b>
      </div>
      <div class="toolbar-right">
        <el-input v-model="templateName" size="small" style="width: 180px" placeholder="模板名" />
        <el-switch v-model="preview" active-text="预览" size="small" />
        <el-button size="small" type="warning" plain @click="resetTemplate">恢复默认</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="saveTemplate">保存模板</el-button>
      </div>
    </div>

    <el-tabs v-model="tab">
      <!-- 布局设计 -->
      <el-tab-pane label="布局设计" name="layout">
        <div class="designer-body">
          <aside class="palette">
            <div class="palette-title">内置区块</div>
            <div
              v-for="(item, type) in widgetRegistry"
              :key="type"
              class="palette-item"
              draggable="true"
              @dragstart="grid.onPaletteDragStart($event, type)"
              @click="addWidget(type)"
            >
              <el-icon :size="18" class="accent-icon"><component :is="item.icon" /></el-icon>
              <span class="palette-label">{{ item.label }}</span>
              <span class="palette-desc">{{ item.desc }}</span>
            </div>
            <div class="palette-tip">拖入右侧画布或点击添加</div>
            <div class="palette-global">
              <span>顶栏全局搜索</span>
              <el-switch v-model="globalSearch" />
            </div>
          </aside>
          <div class="canvas-wrap">
            <HomeCanvas
              :widgets="preview ? previewWidgets : layout"
              :editable="!preview"
              :filter-permission="false"
              @edit="openEditor"
              @remove="removeWidget"
              @toggle="toggleWidget"
              @span-change="spanWidget"
              @add-widget="addWidget"
            />
          </div>
        </div>
      </el-tab-pane>

      <!-- 可选块目录 -->
      <el-tab-pane label="可选块目录" name="catalog">
        <el-alert type="info" :closable="false" show-icon class="tab-tip"
                  title="目录中的卡片会出现在用户「添加卡片」列表里；用户只能挑选与摆放，参数以此处配置为准" />
        <div class="catalog-manage">
          <div v-for="item in catalog" :key="item.id" class="catalog-row">
            <el-icon :size="18" class="accent-icon"><component :is="meta(item.type).icon" /></el-icon>
            <span class="catalog-title">{{ item.title || meta(item.type).label }}</span>
            <el-tag size="small" type="info">{{ meta(item.type).label }}</el-tag>
            <el-tag v-if="item.roles?.length" size="small">{{ item.roles.join('、') }}</el-tag>
            <span class="row-actions">
              <el-button size="small" text type="primary" @click="addCatalogToLayout(item)">加入默认布局</el-button>
              <el-button size="small" text type="primary" @click="editCatalog(item)">编辑</el-button>
              <el-button size="small" text type="danger" @click="removeCatalog(item)">删除</el-button>
            </span>
          </div>
          <el-empty v-if="!catalog.length" :image-size="64" description="目录为空：从下方新增，或在布局设计中把卡片「设为可选块」" />
          <el-dropdown trigger="click" @command="addCatalogByType">
            <el-button size="small" type="primary" plain><el-icon><Plus /></el-icon>&nbsp;新增可选块</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="(item, type) in widgetRegistry" :key="type" :command="type">{{ item.label }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-tab-pane>

      <!-- 主题背景 -->
      <el-tab-pane label="主题背景" name="themes">
        <el-alert type="info" :closable="false" show-icon class="tab-tip"
                  title="用户可在首页右上角从主题库中挑选首页背景（按亮/深外观模式各存一套选择）；卡片上勾选「亮色默认」/「深色默认」分别为两种模式的初始主题——深色单选显示实际生效值，未显式指定时自动判定（亮色默认主题为深色调则沿用，否则内置深蓝），再次点击已显式指定的可取消回退自动" />
        <div class="theme-manage">
          <div class="theme-grid">
            <div v-for="theme in themes" :key="theme.id" class="theme-card">
              <div class="theme-preview" :style="themeStyle(theme)">
                <span class="theme-fake-card" :style="theme.card?.bg ? { background: theme.card.bg } : undefined" />
              </div>
              <div class="theme-meta">
                <b>{{ theme.name }}</b>
                <span class="theme-kind">{{ kindLabel(theme) }}</span>
              </div>
              <div class="theme-actions">
                <div class="theme-default-radios">
                  <el-radio v-model="defaultThemeId" :value="theme.id" size="small">亮色默认</el-radio>
                  <span class="dark-radio-wrap"
                        :title="defaultDarkThemeId === theme.id ? '再次点击取消深色默认（回退自动）' : undefined"
                        @click.capture="onDarkDefaultClick($event, theme.id)">
                    <el-radio :model-value="effectiveDarkDefaultId" :value="theme.id" size="small"
                              @update:model-value="defaultDarkThemeId = $event">深色默认</el-radio>
                  </span>
                </div>
                <el-button size="small" text type="primary" @click="openThemeDialog(theme)">编辑</el-button>
                <el-button size="small" text type="danger" @click="removeTheme(theme)">删除</el-button>
              </div>
            </div>
          </div>
          <el-button size="small" type="primary" plain style="margin-top: 10px" @click="openThemeDialog()">
            <el-icon><Plus /></el-icon>&nbsp;新增主题
          </el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 卡片属性抽屉：按类型出对应配置表单 -->
    <el-drawer v-model="editorVisible" :title="editorTitle" size="460px" :close-on-click-modal="false">
      <el-form v-if="editing" label-width="92px" label-position="left" size="small">
        <el-form-item label="卡片类型">
          <el-tag size="small">{{ meta(editing.type).label }}</el-tag>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="editing.title" placeholder="显示在卡片头部，留空不显示" />
        </el-form-item>
        <el-form-item label="宽度">
          <div class="span-editor">
            <el-slider v-model="editing.span" :min="1" :max="24" show-input :show-input-controls="false" input-size="small" />
            <el-button size="small" @click="editing.span = 6">1/4</el-button>
            <el-button size="small" @click="editing.span = 8">1/3</el-button>
            <el-button size="small" @click="editing.span = 12">1/2</el-button>
            <el-button size="small" @click="editing.span = 16">2/3</el-button>
            <el-button size="small" @click="editing.span = 24">整行</el-button>
          </div>
        </el-form-item>
        <el-form-item label="可见角色">
          <el-select v-model="editing.roles" multiple filterable clearable collapse-tags
                     placeholder="不选=登录可见；持有任一角色即可见" style="width: 100%">
            <el-option v-for="r in roleOptions" :key="r.code" :value="r.code" :label="`${r.name}（${r.code}）`" />
          </el-select>
        </el-form-item>

        <!-- links 卡：入口条目 -->
        <template v-if="editing.type === 'links'">
          <el-form-item v-for="(entry, i) in editing.entries" :key="i" :label="`入口 ${i + 1}`">
            <div class="entry-panel">
              <div class="entry-editor">
                <el-input v-model="entry.title" placeholder="名称" class="title-input" />
                <el-button size="small" text type="danger" class="entry-del" @click="editing.entries?.splice(i, 1)">删除</el-button>
              </div>
              <div class="entry-editor">
                <icon-select v-model="entry.icon" class="icon-select" placeholder="图标" />
                <el-color-picker v-model="entry.color" size="small" />
                <el-checkbox v-model="entry.popup" size="small">弹窗</el-checkbox>
              </div>
              <el-select v-model="entry.path" placeholder="跳转路径：选菜单或手动输入（支持 /sub/... 与第三方 URL）"
                         filterable allow-create default-first-option style="width: 100%">
                <el-option v-for="m in menuPathOptions" :key="m.path" :value="m.path" :label="`${m.name}（${m.path}）`" />
              </el-select>
              <el-select v-model="entry.roles" multiple filterable clearable collapse-tags
                         placeholder="可见角色（不选=所有人可见，持有任一角色即显示）" style="width: 100%">
                <el-option v-for="r in roleOptions" :key="r.code" :value="r.code" :label="`${r.name}（${r.code}）`" />
              </el-select>
            </div>
          </el-form-item>
          <el-form-item label=" ">
            <el-button size="small" plain type="primary" @click="addLinkEntry">添加入口</el-button>
          </el-form-item>
        </template>

        <!-- list/stat 卡：数据接口 -->
        <template v-if="meta(editing.type).hasData">
          <el-form-item label="数据接口">
            <el-input v-model="editing.api" placeholder="同源 /api 代理路径，如 /oa/process/todo" />
          </el-form-item>
          <el-form-item label="请求方式">
            <el-radio-group v-model="editing.method">
              <el-radio value="get">GET</el-radio>
              <el-radio value="post">POST</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="请求参数">
            <el-input v-model="paramsText" type="textarea" :rows="3" placeholder='JSON 对象，如 {"pageNum":1,"pageSize":6}' />
          </el-form-item>
          <el-form-item label=" ">
            <el-button size="small" plain type="primary" :loading="previewLoading" @click="fetchPreview">预览数据</el-button>
            <span class="form-tip">按当前配置真实请求一次，供下方字段下拉与跳转变量选择</span>
          </el-form-item>
          <el-form-item v-if="previewError" label=" ">
            <span class="preview-error">预览失败：{{ previewError }}</span>
          </el-form-item>
          <el-form-item v-if="previewFields.length" label=" ">
            <div class="preview-panel">
              <div class="preview-fields">
                <span v-if="previewRows.length">共 {{ previewTotal }} 条 · </span>行字段：
                <el-tag v-for="f in previewFields" :key="f" size="small" type="info">{{ f }}</el-tag>
              </div>
              <template v-if="editing.type === 'list'">
                <div class="preview-tip">按当前字段映射渲染前 3 条：</div>
                <div v-for="(row, i) in previewRows.slice(0, 3)" :key="i" class="preview-row">
                  <div class="preview-main">
                    <span class="preview-title">{{ previewText(row, editing.fieldMap?.title) || '（无标题）' }}</span>
                    <span v-if="previewText(row, editing.fieldMap?.sub)" class="preview-sub">{{ previewText(row, editing.fieldMap?.sub) }}</span>
                  </div>
                  <span v-if="previewTimeText(row, editing.fieldMap?.time)" class="preview-time">{{ previewTimeText(row, editing.fieldMap?.time) }}</span>
                </div>
              </template>
            </div>
          </el-form-item>
          <el-form-item label="刷新(秒)">
            <el-input-number v-model="editing.refreshSeconds" :min="0" :max="3600" controls-position="right" style="width: 140px" />
            <span class="form-tip">0 = 不自动刷新</span>
          </el-form-item>
        </template>

        <!-- list 卡：字段映射与跳转 -->
        <template v-if="editing.type === 'list'">
          <el-form-item label="字段映射">
            <div class="entry-editor">
              <span class="field-key">标题</span>
              <el-select v-model="editing.fieldMap!.title" class="field-select" placeholder="title" clearable filterable allow-create default-first-option>
                <el-option v-for="f in previewFields" :key="f" :value="f" :label="f" />
              </el-select>
            </div>
            <div class="entry-editor">
              <span class="field-key">副题</span>
              <el-select v-model="editing.fieldMap!.sub" class="field-select" placeholder="如 modelName" clearable filterable allow-create default-first-option>
                <el-option v-for="f in previewFields" :key="f" :value="f" :label="f" />
              </el-select>
            </div>
            <div class="entry-editor">
              <span class="field-key">时间</span>
              <el-select v-model="editing.fieldMap!.time" class="field-select" placeholder="如 startTime" clearable filterable allow-create default-first-option>
                <el-option v-for="f in previewFields" :key="f" :value="f" :label="f" />
              </el-select>
            </div>
            <div v-if="!previewFields.length" class="form-tip" style="margin-left: 0">先「预览数据」自动带出接口行字段；也可直接输入</div>
          </el-form-item>
          <el-form-item label="行点击跳转">
            <el-input ref="linkInputRef" v-model="editing.link" placeholder="如 /sub/oa/detail/task/{taskId}，支持 {字段} 占位" />
            <div class="var-row">
              <span class="form-tip">点击插入行字段变量：</span>
              <template v-if="previewFields.length">
                <el-tag v-for="f in previewFields" :key="f" size="small" class="var-tag" @click="insertLinkVar(f)">{{ '{' + f + '}' }}</el-tag>
              </template>
              <span v-else class="form-tip">预览数据后此处列出可选变量</span>
            </div>
            <div class="form-tip" style="margin-left: 0">路径段/查询参数均可带 {行字段} 占位，点击时以该行数据替换，如 /system/dict-data/{dictType}</div>
          </el-form-item>
        </template>

        <!-- stat 卡：指标 -->
        <template v-if="editing.type === 'stat'">
          <el-form-item v-for="(m, i) in editing.metrics" :key="i" :label="`指标 ${i + 1}`">
            <div class="entry-editor">
              <el-select v-model="m.field" class="field-select" placeholder="字段名" clearable filterable allow-create default-first-option>
                <el-option v-for="f in previewFields" :key="f" :value="f" :label="f" />
              </el-select>
              <el-input v-model="m.label" placeholder="显示名" />
              <el-input v-model="m.suffix" placeholder="单位(可空)" style="width: 90px" />
              <el-button size="small" text type="danger" @click="editing.metrics?.splice(i, 1)">删除</el-button>
            </div>
          </el-form-item>
          <el-form-item label=" ">
            <el-button size="small" plain type="primary" @click="editing.metrics?.push({ field: '', label: '' })">添加指标</el-button>
          </el-form-item>
        </template>

        <!-- iframe 卡 -->
        <template v-if="editing.type === 'iframe'">
          <el-form-item label="嵌入地址">
            <el-input v-model="editing.url" placeholder="https://..." />
          </el-form-item>
          <el-form-item label="高度(px)">
            <el-input-number v-model="editing.height" :min="120" :max="1200" controls-position="right" style="width: 140px" />
          </el-form-item>
        </template>

        <!-- micro 卡 -->
        <template v-if="editing.type === 'micro'">
          <el-form-item label="子应用">
            <el-select v-model="editing.app" placeholder="选择子应用" @change="editing.path = ''">
              <el-option v-for="app in microStore.apps" :key="app.name" :value="app.name" :label="`${app.title} (${app.name})`" />
            </el-select>
          </el-form-item>
          <el-form-item label="页面路径">
            <el-select v-model="editing.path" placeholder="选页面菜单或手动输入内部路由（如 /task）"
                       filterable allow-create default-first-option style="width: 100%">
              <el-option v-for="m in microPathOptions" :key="m.path" :value="m.path" :label="`${m.name}（${m.path}）`" />
            </el-select>
          </el-form-item>
          <el-form-item label="高度(px)">
            <el-input-number v-model="editing.height" :min="120" :max="1200" controls-position="right" style="width: 140px" />
          </el-form-item>
        </template>

        <el-form-item label=" ">
          <el-button type="primary" @click="closeEditor">完成</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>

    <!-- 主题编辑对话框 -->
    <el-dialog v-model="themeDialogVisible" :title="editingTheme?.id ? '编辑主题' : '新增主题'" width="460px">
      <el-form v-if="editingTheme" label-width="92px" label-position="left" size="small">
        <el-form-item label="名称">
          <el-input v-model="editingTheme.name" placeholder="如 晨曦蓝渐变" />
        </el-form-item>
        <el-form-item label="背景类型">
          <el-radio-group v-model="editingTheme.bg.type">
            <el-radio value="color">纯色</el-radio>
            <el-radio value="gradient">渐变</el-radio>
            <el-radio value="image">图片</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="editingTheme.bg.type === 'color'" label="背景色">
          <el-color-picker v-model="editingTheme.bg.value" show-alpha />
        </el-form-item>
        <el-form-item v-else-if="editingTheme.bg.type === 'gradient'" label="渐变值">
          <el-input v-model="editingTheme.bg.value" placeholder="linear-gradient(135deg,#dceeff 0%,#f5f7fa 100%)" />
        </el-form-item>
        <template v-else>
          <el-form-item label="图片地址">
            <el-input v-model="editingTheme.bg.value" placeholder="https://... 或 /img/bg.jpg" />
          </el-form-item>
          <el-form-item label="遮罩色">
            <el-color-picker v-model="editingTheme.bg.mask" show-alpha />
            <span class="form-tip">叠在图片上保证卡片可读，如 rgba(255,255,255,0.82)</span>
          </el-form-item>
        </template>
        <!-- 多维配色（可选）：未填写的维度回退深浅色默认；深色背景主题建议配齐卡片与顶栏 -->
        <el-form-item label="卡片底色">
          <el-color-picker v-model="themeCardBg" show-alpha />
          <span class="form-tip">缺省跟随深浅色模式（白/暗）</span>
        </el-form-item>
        <el-form-item label="卡片边框">
          <el-color-picker v-model="themeCardBorder" show-alpha />
        </el-form-item>
        <el-form-item label="顶栏底色">
          <el-color-picker v-model="themeNavbarBg" show-alpha />
          <span class="form-tip">半透明可透出背景，如 rgba(28,43,58,0.82)</span>
        </el-form-item>
        <el-form-item label="顶栏边框">
          <el-color-picker v-model="themeNavbarBorder" show-alpha />
        </el-form-item>
        <el-form-item label="侧边栏底">
          <el-color-picker v-model="themeSidebarBg" show-alpha />
          <span class="form-tip">缺省保持默认深色侧边栏</span>
        </el-form-item>
        <el-form-item label="菜单文字">
          <el-color-picker v-model="themeSidebarText" show-alpha />
        </el-form-item>
        <el-form-item label="激活文字">
          <el-color-picker v-model="themeSidebarActiveText" show-alpha />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="themeDialogVisible = false">取消</el-button>
        <el-button size="small" type="primary" @click="saveThemeDialog">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/request'
import { IS_PLATFORM } from '../../config/side'
import HomeCanvas from '../../home/HomeCanvas.vue'
import IconSelect from '../../components/IconSelect.vue'
import { BUILTIN_DARK_THEME_ID, builtinTemplate } from '../../home/defaultLayout'
import { useDragGrid } from '../../home/useDragGrid'
import { formatTime, toRows } from '../../home/useWidgetData'
import { isWidgetType, widgetRegistry } from '../../home/widgets'
import { menuFullPath } from '../../micro/apps'
import {
  createWidget,
  isDarkBg,
  parseTemplate,
  SEARCH_CARD_DEFAULT,
  themeStyle,
  type HomeTemplateData,
  type HomeTheme,
  type HomeWidget,
  type LinkEntry,
  type WidgetType
} from '../../home/types'
import { useMicroStore } from '../../stores/micro'
import { useUserStore, type MenuNode } from '../../stores/user'

const microStore = useMicroStore()
const userStore = useUserStore()

const tab = ref('layout')
const preview = ref(false)
const saving = ref(false)
const templateName = ref('')
const layout = ref<HomeWidget[]>([])
const catalog = ref<HomeWidget[]>([])
const themes = ref<HomeTheme[]>([])
const defaultThemeId = ref('')
const defaultDarkThemeId = ref('')
/**
 * 深色默认单选显示的实际生效值：显式指定优先；未指定时自动判定（亮色默认主题深色调则沿用，
 * 否则内置深蓝）——与管理端/用户端解析一致，保证未指定时也有选中项可看（内置 id 不在主题库时无卡片高亮）。
 */
const effectiveDarkDefaultId = computed(() => {
  if (defaultDarkThemeId.value) return defaultDarkThemeId.value
  const light = themes.value.find((t) => t.id === defaultThemeId.value)
  if (light && isDarkBg(light)) return defaultThemeId.value
  return BUILTIN_DARK_THEME_ID
})
/** 顶栏全局搜索开关（随模板 JSON 持久化；缺省开） */
const globalSearch = ref(true)

const grid = useDragGrid(layout)

/** 预览：真实渲染（数据卡真实取数） */
const previewWidgets = computed(() => layout.value)

const editorVisible = ref(false)
const editing = ref<HomeWidget | null>(null)
const editingIndex = ref(-1)
const editingSource = ref<'layout' | 'catalog'>('layout')
const paramsText = ref('')
const editorTitle = computed(() => (editing.value ? `配置${meta(editing.value.type).label}` : ''))

const themeDialogVisible = ref(false)
const editingTheme = ref<HomeTheme | null>(null)

// ===== 快捷入口编辑辅助：跳转路径菜单选项 / 可见角色选项 =====

/** 跳转路径候选：当前管理员的菜单树摊平（type≠1 的可落地菜单，含子应用页面 /sub/{name}{path}） */
interface PathOption { name: string; path: string }
const menuPathOptions = computed<PathOption[]>(() => {
  const out: PathOption[] = []
  const walk = (nodes: MenuNode[], base: string) => {
    for (const node of nodes) {
      const fullPath = menuFullPath(node.menu, base)
      if (node.menu.type !== 1 && node.menu.path) out.push({ name: node.menu.name, path: fullPath })
      if (node.children?.length) walk(node.children, fullPath)
    }
  }
  walk(userStore.menus, '')
  return out
})

/** micro 卡页面路径候选：所选子应用登记的页面菜单内部路由（与快捷入口跳转路径同口径，来自菜单树摊平） */
const microPathOptions = computed<PathOption[]>(() => {
  const app = editing.value?.app
  if (!app) return []
  const out: PathOption[] = []
  const walk = (nodes: MenuNode[]) => {
    for (const node of nodes) {
      if (node.menu.type === 3 && node.menu.microName === app && node.menu.path) {
        out.push({ name: node.menu.name, path: node.menu.path })
      }
      if (node.children?.length) walk(node.children)
    }
  }
  walk(userStore.menus)
  return out
})

/** 可见角色候选：按登录端拉角色列表（拿不到时入口/卡片退化为不配角色） */
const roleOptions = ref<{ code: string; name: string }[]>([])
async function loadRoleOptions() {
  try {
    const base = IS_PLATFORM ? '/system/role/platform' : '/system/role'
    const data: any = await request.get(`${base}/page`, { params: { pageNum: 1, pageSize: 100 }, skipErrorToast: true })
    roleOptions.value = (data.records || []).map((r: any) => ({ code: String(r.code), name: r.name }))
  } catch { /* 无角色管理权限时忽略：角色下拉为空，仍可配置其余项 */ }
}

function addLinkEntry() {
  editing.value?.entries?.push({ title: '', path: '', roles: [] } as LinkEntry)
}

// ===== 数据卡预览（按当前编辑配置真实请求一次，供字段下拉与跳转变量选择） =====

const previewLoading = ref(false)
const previewError = ref('')
const previewResult = ref<unknown>(null)
const previewRows = computed(() => toRows(previewResult.value))
const previewTotal = computed(() => {
  const obj = previewResult.value as { total?: number } | null
  if (obj && typeof obj.total === 'number') return obj.total
  return previewRows.value.length
})

/** 可选字段：取预览行字段（前 5 行并集）；列表为空时回退响应对象顶层标量字段（兼容 stat 汇总接口） */
const previewFields = computed(() => {
  const keys: string[] = []
  const seen = new Set<string>()
  const collect = (k: string) => {
    if (!seen.has(k)) {
      seen.add(k)
      keys.push(k)
    }
  }
  for (const row of previewRows.value.slice(0, 5)) Object.keys(row).forEach(collect)
  if (!keys.length && previewResult.value && typeof previewResult.value === 'object') {
    const obj = previewResult.value as Record<string, unknown>
    Object.keys(obj)
      .filter((k) => obj[k] == null || typeof obj[k] !== 'object')
      .forEach(collect)
  }
  return keys
})

/** 接口/方式/参数变化后预览结果即过期，清空待重新预览 */
watch(
  () => [editing.value?.api, editing.value?.method, paramsText.value],
  () => {
    previewResult.value = null
    previewError.value = ''
  }
)

async function fetchPreview() {
  const conf = editing.value
  if (!conf || !meta(conf.type).hasData) return
  if (!conf.api?.trim()) {
    ElMessage.warning('请先填写数据接口')
    return
  }
  let params: Record<string, unknown> = {}
  if (paramsText.value.trim()) {
    try {
      const parsed = JSON.parse(paramsText.value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('须为 JSON 对象')
      params = parsed
    } catch (e) {
      ElMessage.error(`请求参数 JSON 非法：${(e as Error).message}`)
      return
    }
  }
  previewLoading.value = true
  previewError.value = ''
  try {
    previewResult.value =
      conf.method === 'post'
        ? await request.post(conf.api, params, { skipErrorToast: true })
        : await request.get(conf.api, { params, skipErrorToast: true })
  } catch (e) {
    previewResult.value = null
    const err = e as { message?: string; response?: { data?: { message?: string } } }
    previewError.value = err.response?.data?.message || err.message || '请求失败'
  } finally {
    previewLoading.value = false
  }
}

/** 与 ListWidget 渲染同构的单元格取值（时间列走 formatTime） */
function previewText(row: Record<string, unknown>, key?: string): string {
  const v = key ? row[key] : undefined
  return v == null ? '' : String(v)
}
function previewTimeText(row: Record<string, unknown>, key?: string): string {
  return formatTime(key ? row[key] : undefined)
}

// ===== 行点击跳转：行字段变量插入光标处 =====

const linkInputRef = ref<{ input?: HTMLInputElement } | null>(null)

function insertLinkVar(name: string) {
  const widget = editing.value
  if (!widget) return
  const token = `{${name}}`
  const el = linkInputRef.value?.input
  const cur = widget.link || ''
  if (el && typeof el.selectionStart === 'number') {
    const start = el.selectionStart
    const end = el.selectionEnd ?? start
    widget.link = cur.slice(0, start) + token + cur.slice(end)
    nextTick(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  } else {
    widget.link = cur + token
  }
}

function meta(type: string) {
  return isWidgetType(type) ? widgetRegistry[type] : widgetRegistry.list
}

function asType(type: string): WidgetType | null {
  return isWidgetType(type) ? type : null
}

function kindLabel(theme: HomeTheme): string {
  return theme.bg.type === 'color' ? '纯色' : theme.bg.type === 'gradient' ? '渐变' : '图片'
}

onMounted(() => {
  load()
  loadRoleOptions()
})

async function load() {
  try {
    const vo = await request.get('/system/home/template', { skipErrorToast: true })
    templateName.value = vo?.template?.name || (IS_PLATFORM ? '平台默认首页' : '租户首页')
    const data = parseTemplate(vo?.template?.layoutJson) || builtinTemplate()
    applyTemplate(data)
  } catch {
    // 接口不可达：以内置默认为底稿编辑
    applyTemplate(builtinTemplate())
  }
}

function applyTemplate(data: HomeTemplateData) {
  layout.value = data.layout
  catalog.value = data.catalog || []
  themes.value = data.themes || []
  defaultThemeId.value = data.defaultThemeId || themes.value[0]?.id || ''
  defaultDarkThemeId.value = data.defaultDarkThemeId || ''
  globalSearch.value = data.globalSearch !== false
}

function buildTemplateJson(): string {
  const data: HomeTemplateData = {
    layout: layout.value,
    catalog: catalog.value,
    themes: themes.value,
    defaultThemeId: defaultThemeId.value,
    defaultDarkThemeId: defaultDarkThemeId.value || undefined,
    globalSearch: globalSearch.value ? undefined : false
  }
  return JSON.stringify(data)
}

async function saveTemplate() {
  if (!parseParamsText()) return
  saving.value = true
  try {
    await request.put('/system/home/template', { name: templateName.value, layoutJson: buildTemplateJson(), status: 0 })
    ElMessage.success('模板已保存，用户首页即时生效')
  } catch {
    /* 全局提示已处理 */
  } finally {
    saving.value = false
  }
}

async function resetTemplate() {
  await ElMessageBox.confirm(
    IS_PLATFORM ? '删除平台默认模板？删除后回退到系统内置默认首页。' : '删除本租户模板？删除后回退到系统内置默认首页。',
    '恢复默认',
    { type: 'warning' }
  )
  try {
    await request.delete('/system/home/template')
    ElMessage.success('已恢复默认')
    await load()
  } catch {
    /* 全局提示已处理 */
  }
}

// ===== 布局设计 =====

/** 新建卡片类型预设：布局添加与可选块目录共用（search 预填与顶栏全局搜索同接口的默认取数配置） */
const WIDGET_PRESETS: Partial<Record<WidgetType, Partial<HomeWidget>>> = {
  welcome: { title: '欢迎' },
  links: { title: '快捷入口', entries: [{ title: '示例入口', path: '/system/user', icon: 'User', roles: [] }] },
  list: { title: '数据列表', api: '', method: 'get', fieldMap: { title: 'title', sub: '', time: '' }, params: { pageSize: 6 } },
  stat: { title: '统计数字', api: '', method: 'get', metrics: [{ field: '', label: '指标' }] },
  iframe: { title: '网页嵌入', height: 260 },
  micro: { title: '子应用页面', height: 260 },
  search: {
    title: '全局搜索',
    api: SEARCH_CARD_DEFAULT.api,
    method: SEARCH_CARD_DEFAULT.method,
    params: { ...SEARCH_CARD_DEFAULT.params }
  }
}

function addWidget(type: string) {
  const real = asType(type)
  if (!real) return
  const widget = createWidget(real, WIDGET_PRESETS[real])
  layout.value.push(widget)
  openEditorFor(layout.value.length - 1, 'layout')
}

function openEditor(index: number) {
  openEditorFor(index, 'layout')
}

function openEditorFor(index: number, source: 'layout' | 'catalog') {
  const list = source === 'layout' ? layout.value : catalog.value
  editing.value = list[index]
  editingIndex.value = index
  editingSource.value = source
  if (editing.value) {
    editing.value.fieldMap = editing.value.fieldMap || { title: '', sub: '', time: '' }
    editing.value.entries = editing.value.entries || []
    // 旧数据没有 roles 数组：卡片级与入口级都补齐默认（空=不限可见），否则多选下拉受控失效
    editing.value.roles = editing.value.roles || []
    editing.value.entries.forEach((e) => { if (!e.roles) e.roles = [] })
    editing.value.metrics = editing.value.metrics || []
    editing.value.link = editing.value.link || ''
    // 旧模板的搜索卡没有取数配置：按当前默认补齐（渲染层同值回退，行为不变），抽屉不再是空表单
    if (editing.value.type === 'search') {
      editing.value.api = editing.value.api || SEARCH_CARD_DEFAULT.api
      editing.value.method = editing.value.method || SEARCH_CARD_DEFAULT.method
      editing.value.params = { ...SEARCH_CARD_DEFAULT.params, ...(editing.value.params || {}) }
    }
    paramsText.value = editing.value.params ? JSON.stringify(editing.value.params) : ''
  }
  previewResult.value = null
  previewError.value = ''
  editorVisible.value = true
}

/** 关闭抽屉前先把参数 JSON 文本落回配置（非法则提示并保持抽屉打开） */
function closeEditor() {
  if (!parseParamsText()) return
  editorVisible.value = false
}

/** 保存参数 JSON（非法时提示并阻断保存动作） */
function parseParamsText(): boolean {
  if (editing.value && meta(editing.value.type).hasData) {
    if (!paramsText.value.trim()) {
      editing.value.params = {}
      return true
    }
    try {
      const parsed = JSON.parse(paramsText.value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('须为 JSON 对象')
      editing.value.params = parsed
      return true
    } catch (e) {
      ElMessage.error(`请求参数 JSON 非法：${(e as Error).message}`)
      return false
    }
  }
  return true
}

function removeWidget(index: number) {
  layout.value.splice(index, 1)
}

function toggleWidget(index: number) {
  const widget = layout.value[index]
  if (widget) widget.enabled = widget.enabled === false
}

function spanWidget(index: number, delta: number) {
  const widget = layout.value[index]
  if (widget) widget.span = Math.min(24, Math.max(1, (widget.span || 24) + delta))
}

// ===== 可选块目录 =====

function addCatalogByType(type: string) {
  const real = asType(type)
  if (!real) return
  const widget = createWidget(real, { title: meta(real).label, ...WIDGET_PRESETS[real] })
  catalog.value.push(widget)
  editCatalog(widget)
}

function editCatalog(item: HomeWidget) {
  const index = catalog.value.indexOf(item)
  if (index >= 0) openEditorFor(index, 'catalog')
}

function removeCatalog(item: HomeWidget) {
  catalog.value = catalog.value.filter((row) => row !== item)
}

function addCatalogToLayout(item: HomeWidget) {
  const copy = JSON.parse(JSON.stringify(item)) as HomeWidget
  layout.value.push(copy)
  tab.value = 'layout'
  ElMessage.success('已加入默认布局，可拖动调整位置')
}

// ===== 主题背景 =====

function openThemeDialog(theme?: HomeTheme) {
  editingTheme.value = theme
    ? (JSON.parse(JSON.stringify(theme)) as HomeTheme)
    : { id: `t-${Date.now().toString(36)}`, name: '', bg: { type: 'color', value: '#f5f7fa' } }
  themeDialogVisible.value = true
}

/** 多维配色字段的读写代理：空值即删除该键（未配置维度回退深浅色默认，保存的 JSON 不带空键） */
function themeColorComputed(group: 'card' | 'navbar' | 'sidebar', key: string) {
  return computed<string>({
    get: () => (editingTheme.value?.[group] as Record<string, string | undefined> | undefined)?.[key] || '',
    set: (v) => {
      const theme = editingTheme.value
      if (!theme) return
      const current = { ...((theme[group] as Record<string, string | undefined>) || {}) }
      if (v) current[key] = v
      else delete current[key]
      theme[group] = Object.keys(current).length ? (current as HomeTheme['card']) : undefined
    }
  })
}
const themeCardBg = themeColorComputed('card', 'bg')
const themeCardBorder = themeColorComputed('card', 'border')
const themeNavbarBg = themeColorComputed('navbar', 'bg')
const themeNavbarBorder = themeColorComputed('navbar', 'border')
const themeSidebarBg = themeColorComputed('sidebar', 'bg')
const themeSidebarText = themeColorComputed('sidebar', 'text')
const themeSidebarActiveText = themeColorComputed('sidebar', 'activeText')

function saveThemeDialog() {
  const theme = editingTheme.value
  if (!theme) return
  if (!theme.name.trim()) {
    ElMessage.warning('请填写主题名称')
    return
  }
  if (!theme.bg.value) {
    ElMessage.warning('请设置背景值')
    return
  }
  const index = themes.value.findIndex((row) => row.id === theme.id)
  if (index >= 0) themes.value[index] = theme
  else themes.value.push(theme)
  if (!defaultThemeId.value) defaultThemeId.value = theme.id
  themeDialogVisible.value = false
}

function removeTheme(theme: HomeTheme) {
  themes.value = themes.value.filter((row) => row !== theme)
  if (defaultThemeId.value === theme.id) defaultThemeId.value = themes.value[0]?.id || ''
  if (defaultDarkThemeId.value === theme.id) defaultDarkThemeId.value = ''
}

/** 点击已选中的「深色默认」= 取消（回退自动判定）：捕获段拦截点击并阻止 radio 选中，再清空 */
function onDarkDefaultClick(event: MouseEvent, id: string) {
  if (defaultDarkThemeId.value !== id) return
  event.preventDefault()
  event.stopPropagation()
  defaultDarkThemeId.value = ''
}
</script>

<style scoped>
.designer {
  background: var(--el-bg-color);
  border-radius: 6px;
  padding: 12px 16px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.designer-body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.palette {
  width: 200px;
  flex-shrink: 0;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 10px;
}
.accent-icon {
  color: var(--el-color-primary);
}
.palette-title {
  font-weight: bold;
  margin-bottom: 8px;
  font-size: 13px;
}
.palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: grab;
  transition: all 0.2s;
}
.palette-item:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
}
.palette-label {
  font-size: 13px;
  font-weight: bold;
}
.palette-desc {
  display: none;
}
.palette-global {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding: 8px 10px;
  font-size: 13px;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
}
.palette-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: center;
}
.canvas-wrap {
  flex: 1;
  min-width: 0;
}
.tab-tip {
  margin-bottom: 10px;
}
.catalog-manage {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.catalog-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  /* 应用无全局 border-box 复位：content-box 下 width:100% 再叠 padding/border 会右溢 26px，
     被 el-tabs__content overflow:hidden 裁掉——右侧内边距与边框不可见，删除按钮贴着裁切线 */
  box-sizing: border-box;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 8px 12px;
}
.catalog-title {
  font-size: 13px;
  font-weight: bold;
}
.row-actions {
  margin-left: auto;
}
.theme-manage .theme-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.theme-default-radios {
  display: flex;
  align-items: center;
}
.dark-radio-wrap {
  display: inline-flex;
}
.theme-card {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 10px;
  width: 320px;
}
.theme-preview {
  width: 72px;
  height: 48px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.theme-fake-card {
  width: 48px;
  height: 32px;
  background: #fff;
  border-radius: 3px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
.theme-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.theme-kind {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.theme-actions {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.entry-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
}
.entry-panel .entry-editor {
  margin-bottom: 0;
}
/* 名称独占一行拿满宽度（此前与图标/弹窗同排被挤压显示不全） */
.entry-editor .title-input {
  flex: 1;
  min-width: 0;
}
.entry-editor .entry-del {
  flex-shrink: 0;
}
.entry-editor {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin-bottom: 4px;
}
.field-key {
  width: 32px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  flex-shrink: 0;
}
.field-select {
  flex: 1;
}
.icon-select {
  width: 112px;
  flex-shrink: 0;
}
.preview-error {
  color: var(--el-color-danger);
  font-size: 12px;
}
.preview-panel {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
  padding: 8px;
}
.preview-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.preview-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin: 4px 0 2px;
}
.preview-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 6px 2px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
}
.preview-row:last-child {
  border-bottom: none;
}
.preview-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-sub {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  background: var(--el-fill-color);
  border-radius: 3px;
  padding: 1px 6px;
}
.preview-time {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.var-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
}
.var-row .form-tip {
  margin-left: 0;
}
.var-tag {
  cursor: pointer;
}
.span-editor {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}
.span-editor .el-slider {
  flex: 1;
  margin-right: 8px;
}
.form-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 8px;
}
</style>
