<template>
  <el-container class="layout" :class="{ bare: bareMode }" :style="portal.cssVars">
    <el-aside v-if="layoutMode === 'left' && !bareMode" :width="collapsed ? '64px' : '210px'" class="aside">
      <div class="logo">
        <!-- 界面名称：内置参数（sys.site.name / sys.platform.name）优先，未配置回退构建期标题 -->
        <span class="logo-text">{{ collapsed ? 'mse' : (userStore.siteName || APP_TITLE) }}</span>
      </div>
      <el-scrollbar class="menu-scroll">
        <!-- 菜单配色全部走 --el-menu-* 变量（值来自 --mse-sidebar-*，随主题库/深浅色联动） -->
        <el-menu :default-active="activeMenuIndex" router :collapse="collapsed" :collapse-transition="false"
                 class="aside-menu">
          <el-menu-item index="/home">
            <el-icon><HomeFilled /></el-icon>
            <template #title>首页</template>
          </el-menu-item>
          <!-- 动态菜单：登录后由 /system/profile(/platform)/me 下发，经套餐/角色双重裁剪；
               type=3 子应用页面在本树内渲染（解析为 /sub/{name}{path}） -->
          <menu-tree :nodes="userStore.menus" base="" />
          <!-- 未登记页面菜单的子应用：兜底渲染为单个菜单项 -->
          <template v-if="visibleMicroApps.length">
            <el-divider style="margin: 8px 0; border-color: var(--mse-sidebar-divider); width: calc(100% - 32px); min-width: 0" />
            <el-menu-item v-for="microApp in visibleMicroApps" :key="microApp.name" :index="`/sub/${microApp.name}`">
              <el-icon><Box /></el-icon>
              <template #title>{{ microApp.title }}</template>
            </el-menu-item>
          </template>
        </el-menu>
      </el-scrollbar>
    </el-aside>
    <!-- direction 必须显式声明：子元素无 el-header/el-footer 时 Element Plus 不会自动纵向排列 -->
    <el-container direction="vertical" class="framework" :class="{ 'layout-mix': layoutMode === 'mix' }" :style="portal.bgStyle">
      <!-- 主题背景铺满右侧框架（导航栏/标签栏/内容区半透明透出背景）；image 主题时叠加遮罩保证可读 -->
      <div v-if="portal.maskColor" class="framework-mask" :style="{ background: portal.maskColor }" />
      <!-- top / mix 布局顶栏（紧凑单行）：折叠(mix) + 界面名称 + 横向菜单 + 右侧操作区；
           top 模式目录渲染为下拉子菜单，mix 模式一级拍平（点击只切换左侧子级栏/导航，不重复下拉） -->
      <div v-if="layoutMode !== 'left' && !bareMode" class="topbar">
        <!-- mix：品牌块与左侧子级栏同宽（200px/折叠 64px）居中成左上角品牌区，折叠按钮紧随其后 -->
        <template v-if="layoutMode === 'mix'">
          <span class="topbar-logo top" :class="{ collapsed }">{{ collapsed ? 'mse' : (userStore.siteName || APP_TITLE) }}</span>
          <el-icon class="collapse-btn" @click="collapsed = !collapsed">
            <Expand v-if="collapsed" />
            <Fold v-else />
          </el-icon>
        </template>
        <span v-else class="topbar-logo">{{ userStore.siteName || APP_TITLE }}</span>
        <horizontal-menu
          v-if="layoutMode === 'top'"
          :nodes="userStore.menus"
          :micro-apps="visibleMicroApps"
          :active="activeMenuIndex"
        />
        <horizontal-menu
          v-else
          flat
          :nodes="userStore.menus"
          :micro-apps="visibleMicroApps"
          :active="mixActiveTop"
          @select="onTopSelect"
        />
        <navbar-actions @command="onCommand" />
      </div>
      <!-- mix 布局左侧子级栏：当前激活项所属一级节点的子级（首页/兜底应用无所属一级时隐藏） -->
      <el-aside v-if="layoutMode === 'mix' && mixChildren.length && !bareMode" :width="collapsed ? '64px' : '200px'" class="mix-aside">
        <el-scrollbar class="mix-scroll">
          <el-menu :default-active="activeMenuIndex" router :collapse="collapsed" :collapse-transition="false" class="aside-menu">
            <menu-tree :nodes="mixChildren" :base="mixBase" />
          </el-menu>
        </el-scrollbar>
      </el-aside>
      <!-- left 布局导航栏：折叠 + 面包屑 + 右侧操作区（top/mix 的操作区已并入顶栏单行，面包屑仅 left 保留） -->
      <div v-if="layoutMode === 'left' && !bareMode" class="navbar">
        <div class="navbar-left">
          <el-icon class="collapse-btn" @click="collapsed = !collapsed">
            <Expand v-if="collapsed" />
            <Fold v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item v-for="item in breadcrumbs" :key="item.path" :to="crumbTarget(item.path)">
              {{ item.title }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <navbar-actions @command="onCommand" />
      </div>
      <!-- bare 无壳模式（URL 带 ?bare=1）：外壳全摘、内容区铺满，供工作台/移动端 WebView 直达子页面；
           登录态/主题/权限联动与 wujie 容器照常，仅隐藏视觉外壳 -->
      <tags-view v-if="tagsVisible && !bareMode" />
      <el-main class="main">
        <router-view v-slot="{ Component, route: viewRoute }">
          <!-- 子应用容器仅在页签开启时参与 keep-alive 保活（切签不重载）；单页模式 include 置空：
               不缓存任何组件，离开即销毁 wujie 沙箱释放内存。其余页面仍以 refreshKey-fullPath 成键，刷新即重挂 -->
          <keep-alive :include="keepAliveInclude">
            <component :is="Component" :key="viewRoute.params.appName ?? `${tagsStore.refreshKey}-${viewRoute.fullPath}`" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>
    <!-- 个人中心：改密（双端共用，端点按侧区分，通用权限 system:profile:update） -->
    <change-password-dialog v-model="passwordDialog" @success="onPasswordChanged" />
    <!-- 个人中心：双因子认证绑定/解绑（端点按侧区分） -->
    <two-factor-dialog v-model="twoFactorDialog" />
    <!-- 个人中心：头像上传（双端共用，走 mse-fs 公开素材通道或本地磁盘兜底） -->
    <el-dialog v-model="avatarDialog" title="上传头像" width="360px">
      <div class="avatar-upload">
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          accept="image/png,image/jpeg,image/gif,image/webp"
          :on-change="onAvatarPick"
        >
          <el-avatar :size="96" :src="avatarPreview || resolveAssetSrc(userStore.avatar) || undefined" icon="UserFilled" />
        </el-upload>
        <div class="avatar-tip">点击头像选择图片（png/jpg/jpeg/gif/webp，≤2MB），保存后生效</div>
      </div>
      <template #footer>
        <el-button @click="avatarDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!avatarFile" :loading="avatarSaving" @click="saveAvatar">保存</el-button>
      </template>
    </el-dialog>
    <!-- 主题设置：外观模式 + 菜单布局/多页签 + 主题色 + 首页背景（首页背景按亮/深双槽位选择，未选择时跟随内置背景） -->
    <el-dialog v-model="themeDialog" title="主题设置" width="340px">
      <div class="theme-section">
        <div class="section-title">外观模式</div>
        <el-radio-group :model-value="themeStore.mode" size="small" @change="onModeChange">
          <el-radio-button value="light">亮色</el-radio-button>
          <el-radio-button value="dark">深色</el-radio-button>
          <el-radio-button value="auto">跟随系统</el-radio-button>
        </el-radio-group>
      </div>
      <div class="theme-section">
        <div class="section-title">菜单布局</div>
        <el-radio-group :model-value="themeStore.layout" size="small" @change="onLayoutChange">
          <el-radio-button value="left">左侧</el-radio-button>
          <el-radio-button value="top">顶部</el-radio-button>
          <el-radio-button value="mix">顶部+左侧</el-radio-button>
        </el-radio-group>
        <div class="theme-hint">左侧=菜单在侧边栏；顶部=全部菜单在顶部；顶部+左侧=一级菜单在顶部、子菜单在左侧</div>
      </div>
      <div class="theme-section">
        <div class="section-title theme-title-row">
          <span>多页签</span>
          <el-switch
            :model-value="tagsVisible"
            size="small"
            :disabled="userStore.tagsPolicy !== 'optional'"
            @change="onTagsChange"
          />
        </div>
        <div class="theme-hint">{{ tagsHint }}</div>
      </div>
      <div class="theme-section">
        <div class="section-title">主题色</div>
        <div class="primary-row">
          <span
            v-for="color in presetColors"
            :key="color"
            class="color-dot"
            :class="{ active: color.toLowerCase() === themeStore.primary.toLowerCase() }"
            :style="{ background: color }"
            @click="themeStore.setPrimary(color)"
          />
          <el-color-picker
            :model-value="themeStore.primary"
            size="small"
            @update:model-value="(c) => c && themeStore.setPrimary(c)"
          />
        </div>
      </div>
      <div class="theme-section">
        <div class="section-title theme-title-row">
          <span>首页背景</span>
          <el-tag size="small" effect="plain">{{ themeStore.resolvedDark ? '深色模式' : '亮色模式' }}</el-tag>
        </div>
        <div class="theme-list">
          <div class="theme-item" :class="{ active: builtinThemeActive }" @click="portal.clearThemePick()">
            <span class="theme-swatch builtin-swatch" />
            <span class="theme-name">跟随内置默认</span>
            <el-icon v-if="builtinThemeActive" class="theme-check"><Check /></el-icon>
          </div>
          <div
            v-for="theme in portal.themes"
            :key="theme.id"
            class="theme-item"
            :class="{ active: !builtinThemeActive && theme.id === portal.currentThemeId }"
            @click="portal.pickTheme(theme)"
          >
            <span class="theme-swatch" :style="swatchStyle(theme)" />
            <span class="theme-name">{{ theme.name }}</span>
            <el-tag v-if="builtinThemeActive && theme.id === portal.currentThemeId" class="theme-builtin-badge" size="small" effect="plain" type="info">内置</el-tag>
            <el-icon v-else-if="theme.id === portal.currentThemeId" class="theme-check"><Check /></el-icon>
          </div>
          <div v-if="!portal.themes.length" class="theme-none">管理员未配置可选主题</div>
        </div>
        <div class="theme-hint">选择应用于当前外观模式；未单独选择时跟随内置默认</div>
      </div>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WujieVue from 'wujie-vue3'
import { ElMessage } from 'element-plus'
import request from '../api/request'
import { resolveAssetSrc } from '../utils/asset'
import { useUserStore, type MenuNode } from '../stores/user'
import { useTagsStore } from '../stores/tags'
import { useMicroStore } from '../stores/micro'
import { usePortalStore } from '../stores/portal'
import { useThemeStore, type MenuLayout, type ThemeMode } from '../stores/theme'
import { menuFullPath, microMenuMatch } from '../micro/apps'
import { APP_TITLE, IS_PLATFORM, LOGIN_PATH } from '../config/side'
import { themeStyle, type HomeTheme } from '../home/types'
import ChangePasswordDialog from '../components/ChangePasswordDialog.vue'
import TwoFactorDialog from '../components/TwoFactorDialog.vue'
import MenuTree from '../components/MenuTree.vue'
import HorizontalMenu from '../components/HorizontalMenu.vue'
import NavbarActions from '../components/NavbarActions.vue'
import TagsView from '../components/TagsView.vue'

const route = useRoute()
const router = useRouter()
const { bus } = WujieVue
const userStore = useUserStore()
const tagsStore = useTagsStore()
const microStore = useMicroStore()
// 门户首页状态：主题背景铺满右侧框架（导航栏/标签栏/内容区半透明），首页工具组挂在导航栏
const portal = usePortalStore()
// 全局外观状态（深浅色/主色），门户主题库 cssVars 由 Layout 根容器统一绑定
const themeStore = useThemeStore()
const collapsed = ref(false)

// -------------------- 布局模式与多页签 --------------------

/** 菜单布局（theme store 设备级偏好，随 mse-theme 持久化）：left=左侧 / top=顶部 / mix=一级顶部+子级左侧 */
const layoutMode = computed(() => themeStore.layout)

/** bare 无壳模式（URL 带 ?bare=1）：隐藏侧栏/顶栏/导航/页签，内容区铺满——
 *  外部入口（IM 工作台、移动端 WebView）直达子页面时去掉基座外壳；仅摘视觉外壳，
 *  登录态/主题/权限联动与 wujie 容器全部照常 */
const bareMode = computed(() => route.query.bare === '1')

/** 多页签最终显隐：租户策略 sys.ui.tagsPolicy 强制时以策略为准，optional 时随用户开关 */
const tagsVisible = computed(() => {
  if (userStore.tagsPolicy === 'fixed-on') return true
  if (userStore.tagsPolicy === 'fixed-off') return false
  return themeStore.showTags
})

const tagsHint = computed(() => {
  if (userStore.tagsPolicy === 'fixed-on') return '管理员已锁定：多页签强制开启'
  if (userStore.tagsPolicy === 'fixed-off') return '管理员已锁定：多页签强制关闭'
  return '关闭后为单页模式：隐藏页签栏并清空页签记录，切走即销毁页面（子应用不保活）'
})

/** 单页模式 include 置空 → keep-alive 不缓存任何组件（子应用沙箱离开即销毁，不驻留内存）；
 *  页签开启时仅 WujieContainer 参与保活（页签切换不重载子应用） */
const keepAliveInclude = computed(() => (tagsVisible.value ? 'WujieContainer' : ''))

function onLayoutChange(layout: string | number | boolean | undefined) {
  themeStore.setLayout(layout as MenuLayout)
}

function onTagsChange(show: string | number | boolean | undefined) {
  themeStore.setShowTags(Boolean(show))
}

/** 主题色预设色板（末位之外均为常见品牌色；自定义走 el-color-picker） */
const presetColors = ['#409eff', '#0ea5e9', '#10b981', '#8b5cf6', '#6366f1', '#14b8a6', '#f59e0b', '#f43f5e']

function onModeChange(mode: string | number | boolean | undefined) {
  themeStore.setMode(mode as ThemeMode)
}

/** 菜单树摊平的子应用页面项（type=3，高亮匹配与标签页标题归并用） */
interface MicroMenuLeaf { microName: string; path: string; fullPath: string; name: string }
const microMenuLeaves = computed<MicroMenuLeaf[]>(() => {
  const leaves: MicroMenuLeaf[] = []
  const walk = (nodes: MenuNode[]) => {
    for (const node of nodes) {
      if (node.menu.type === 3 && node.menu.microName) {
        leaves.push({ microName: node.menu.microName, path: node.menu.path, fullPath: menuFullPath(node.menu, ''), name: node.menu.name })
      }
      if (node.children?.length) walk(node.children)
    }
  }
  walk(userStore.menus)
  return leaves
})

// 已登记页面菜单的子应用由菜单树渲染分组（入口随套餐/角色双重裁剪），
// 兜底单项区只展示从未登记页面菜单的子应用——登记过但当前用户一个页面都看不见的应用不得外露，
// 否则未授权用户会看到入口、点进去全是 403
const visibleMicroApps = computed(() => {
  const withMenus = new Set(microMenuLeaves.value.map((leaf) => leaf.microName))
  return microStore.visibleApps(userStore.platform)
    .filter((app) => !app.hasMenus && !withMenus.has(app.name))
})

function swatchStyle(theme: HomeTheme): Record<string, string> {
  return themeStyle(theme)
}

/** 「跟随内置默认」激活态：当前外观模式的主题槽位未选择（亮=themeId，深=darkThemeId） */
const builtinThemeActive = computed(() => {
  const dark = themeStore.resolvedDark
  if (portal.customizing) return dark ? !portal.draftDarkThemeId : !portal.draftThemeId
  return dark ? !portal.userSetting?.darkThemeId : !portal.userSetting?.themeId
})

onMounted(() => portal.load())

// 子应用内部路由（如 /sub/xxx/page-b/2）需归并到命中的子应用页面菜单项才能保持高亮（最长路径优先）
const activeMenuIndex = computed(() => {
  const matched = microMenuLeaves.value
    .filter((leaf) => microMenuMatch(leaf.microName, leaf.path, route.path))
    .sort((a, b) => b.fullPath.length - a.fullPath.length)[0]
  if (matched) return matched.fullPath
  // 未登记页面菜单的子应用：整体高亮其单项菜单
  const hit = visibleMicroApps.value.find((app) => route.path.startsWith(`/sub/${app.name}/`) || route.path === `/sub/${app.name}`)
  return hit ? `/sub/${hit.name}` : route.path
})

// mix 布局顶栏一级选中态：点目录只切换子级栏不导航（目录无落地页），选中路径记在 mixSelected；
// 路由变化（点子级/兜底应用/首页）后清空，回落到「路由所属一级」推导
const mixSelected = ref('')
const routeTopNode = computed(() => {
  const target = activeMenuIndex.value
  const contains = (node: MenuNode, base: string): boolean => {
    const fullPath = menuFullPath(node.menu, base)
    if (fullPath === target) return true
    return !!node.children?.some((child) => contains(child, fullPath))
  }
  return userStore.menus.find((top) => contains(top, '')) ?? null
})
const activeTopNode = computed(() =>
  userStore.menus.find((top) => menuFullPath(top.menu, '') === mixSelected.value) ?? routeTopNode.value
)
/** mix 顶栏一级高亮：显式选中 > 路由所属一级（子级页签激活时其一级也要亮）> 当前路由 */
const mixActiveTop = computed(() =>
  mixSelected.value || (routeTopNode.value ? menuFullPath(routeTopNode.value.menu, '') : activeMenuIndex.value)
)
const mixChildren = computed(() => activeTopNode.value?.children ?? [])
const mixBase = computed(() => (activeTopNode.value ? menuFullPath(activeTopNode.value.menu, '') : ''))

/** mix 顶栏一级点击：目录仅切换子级栏（不导航），叶子/首页/兜底应用直接导航 */
function onTopSelect(payload: { path: string; node?: MenuNode }) {
  mixSelected.value = payload.path
  if (!payload.node?.children?.length) router.push(payload.path)
}
watch(activeMenuIndex, () => { mixSelected.value = '' })

// -------------------- 标签页注册 --------------------

/** 菜单全路径 → 名称（面包屑用；子应用页面项为解析后的 /sub/{name}{path}） */
const menuNameMap = computed(() => {
  const map: Record<string, string> = {}
  const walk = (nodes: MenuNode[], base: string) => {
    for (const node of nodes) {
      const fullPath = menuFullPath(node.menu, base)
      if (node.menu.name) map[fullPath] = node.menu.name
      if (node.children?.length) walk(node.children, fullPath)
    }
  }
  walk(userStore.menus, '')
  return map
})

/** 子应用页面上报标题（sub:title 事件，key = /sub/{name}{path}）：深链/详情页无页面菜单可归并时的中文标题来源 */
const subTitleMap = ref<Record<string, string>>({})

// -------------------- bare 无壳模式：宿主路由上报 --------------------

/** 子应用最新内部路由（sub:title 上报，key = urlPrefix）：bare 宿主「分享当前页」深链的数据源 */
const subLastRoute = ref<Record<string, { subPath: string; title: string }>>({})

/**
 * bare 无壳模式下向宿主窗口 postMessage 当前子应用路由（消息只含路径与标题，不含任何凭证）：
 * 聊天客户端工作台内嵌页、移动 WebView 等宿主据此感知"当前页"，组装分享卡片深链。
 * 非 bare / 顶层窗口 / 非 /sub 路由不动作；subPath 优先取子应用上报的内部路由（fullPath 含
 * query，页面把状态写进 query 即随卡片带走），尚无上报时回落容器路径（页面级还原）。
 */
function announceBareRoute() {
  if (!bareMode.value || window.parent === window || !route.path.startsWith('/sub/')) return
  const urlPrefix = `/sub/${route.params.appName ?? ''}`
  const last = subLastRoute.value[urlPrefix]
  window.parent.postMessage(
    { type: 'mse:bare-route', subPath: last?.subPath ?? route.path, title: last?.title ?? '' },
    '*',
  )
}

watch(() => route.fullPath, announceBareRoute, { immediate: true })

/**
 * bare 无壳模式下接受宿主窗口（聊天客户端工作台、移动 WebView 等容器）实时下发主题：
 * 消息只含外观值（深浅 + 主色），瞬态应用不写 localStorage。仅 bare 且消息来自直接
 * 宿主 window.parent 时消费；常规入口打开时主题行为完全不变。
 */
function onHostThemeMessage(ev: MessageEvent) {
  if (!bareMode.value || window.parent === window || ev.source !== window.parent) return
  const msg = ev.data as { type?: string; theme?: string; primary?: string } | null
  if (!msg || msg.type !== 'mse:theme') return
  themeStore.applyTransient(msg.theme, msg.primary)
}
window.addEventListener('message', onHostThemeMessage)

const onSubTitle = (msg: { urlPrefix: string; path: string; title: string; fullPath?: string }) => {
  if (!msg?.urlPrefix || !msg.path || !msg.title) return
  const key = `${msg.urlPrefix}${msg.path}`
  subTitleMap.value[key] = msg.title
  // 标题晚于页签注册到达（子应用异步加载后才上报）：已存在的同名签就地纠正
  tagsStore.renameView(key, msg.title)
  // 记录该子应用最新内部路由并触发宿主上报（fullPath 为可选新字段，旧子应用回落 path）
  subLastRoute.value[msg.urlPrefix] = { subPath: `${msg.urlPrefix}${msg.fullPath ?? msg.path}`, title: msg.title }
  announceBareRoute()
}
bus.$on('sub:title', onSubTitle)
onBeforeUnmount(() => bus.$off('sub:title', onSubTitle))

/** 当前子应用路由的页面级标题：上报标题 > 页面菜单最长匹配名；都无则空（面包屑省略末段、页签回退应用名） */
const subPageTitle = computed(() => {
  if (!route.path.startsWith('/sub/')) return ''
  return subTitleMap.value[route.path]
    ?? microMenuLeaves.value
      .filter((leaf) => microMenuMatch(leaf.microName, leaf.path, route.path))
      .sort((a, b) => b.fullPath.length - a.fullPath.length)[0]?.name
    ?? ''
})

/** 菜单全路径 → 节点类型（1 目录 2 页面 3 子应用页面），面包屑判断落点用 */
const menuTypeMap = computed(() => {
  const map: Record<string, number> = {}
  const walk = (nodes: MenuNode[], base: string) => {
    for (const node of nodes) {
      const fullPath = menuFullPath(node.menu, base)
      map[fullPath] = node.menu.type
      if (node.children?.length) walk(node.children, fullPath)
    }
  }
  walk(userStore.menus, '')
  return map
})

const breadcrumbs = computed(() => {
  const crumbs = [{ title: '首页', path: '/home' }]
  if (route.path === '/home') return crumbs
  // 子应用路由：/sub/{app} 归并为应用段（目录菜单名 > 应用注册名），其后深链散段
  // （detail/task/<uuid> 这类无菜单语义的原始段）不再逐段铺开，页面语义归并为一个末段
  const subApp = route.path.match(/^\/sub\/([^/]+)/)
  if (subApp) {
    const appPath = `/sub/${subApp[1]}`
    const appTitle = menuNameMap.value[appPath]
      ?? microStore.apps.find((item) => item.name === subApp[1])?.title
      ?? subApp[1]
    crumbs.push({ title: appTitle, path: appPath })
    if (route.path !== appPath && subPageTitle.value) {
      crumbs.push({ title: subPageTitle.value, path: route.path })
    }
    return crumbs
  }
  let acc = ''
  for (const part of route.path.split('/').filter(Boolean)) {
    acc += `/${part}`
    const name = menuNameMap.value[acc]
    crumbs.push({ title: name ?? part, path: acc })
  }
  // 末段是参数化的非菜单路径（如 /system/dict-data/sys_user_sex）→ 用路由标题
  const last = crumbs[crumbs.length - 1]
  if (!menuNameMap.value[last.path] && route.meta.title) {
    last.title = String(route.meta.title)
  }
  return crumbs
})

/** 面包屑点击落点：当前页不高亮；目录节点与未注册路由的中间段没有落地页，点击回首页 */
function crumbTarget(path: string): string | undefined {
  if (path === route.path) return undefined
  // 子应用根（/sub/{app}）是可落地页（容器渲染应用默认路由），不按目录节点回首页
  if (/^\/sub\/[^/]+$/.test(path)) return path
  return menuTypeMap.value[path] === 1 ? '/home' : path
}

/** 当前路由登记成签（路由切换/重开页签时调用；子应用路由按 path 归并，框架路由用 fullPath） */
function registerRouteView() {
  if (route.path.startsWith('/sub/')) {
    // 子应用路由同样成签，但以 path 为键：wujie sync 会把子应用内部导航写回主应用 query，
    // fullPath 随之抖动，按 path 归并才不会一跳一个新签；
    // 标题优先级：子应用上报 > 命中的页面菜单项（最长路径优先）> 应用名 > 原始路径。
    // 应用名按注册表全表查：登记过页面菜单的应用不在 visibleMicroApps（入口收敛菜单树），
    // 其深链路由若只在兜底列表里找会查不到应用名，回退成整条 URL
    const app = microStore.apps.find((item) => route.path === `/sub/${item.name}` || route.path.startsWith(`/sub/${item.name}/`))
    tagsStore.addView({ path: route.path, title: subPageTitle.value || app?.title || route.path })
    return
  }
  const title = (route.meta?.title as string) || menuNameMap.value[route.path] || route.name || route.path
  tagsStore.addView({ path: route.fullPath, title: String(title) })
}

watch(() => route.fullPath, () => {
  // 单页模式（页签关闭/策略强制关闭）不成签：仅当前页可停留，避免不可见的记录堆积
  if (!tagsVisible.value) return
  registerRouteView()
}, { immediate: true })

/** 进入单页模式即清空页签记录（策略强制关闭/用户关闭都生效）；重新开启时把当前页补录成签——
 *  关闭期间浏览不成签，重开后若不补录，页签栏只剩首页固定签且无激活签，与真实停留页面对不上 */
watch(tagsVisible, (visible) => {
  if (!visible) {
    tagsStore.clear()
    return
  }
  registerRouteView()
}, { immediate: true })

// -------------------- 修改密码 / 主题 / 首页自定义 --------------------

const passwordDialog = ref(false)
const twoFactorDialog = ref(false)
const themeDialog = ref(false)

// -------------------- 头像上传 --------------------

const avatarDialog = ref(false)
const avatarFile = ref<File | null>(null)
const avatarPreview = ref('')
const avatarSaving = ref(false)

function onAvatarPick(pick: { raw: File }) {
  const raw = pick.raw
  if (raw.size > 2 * 1024 * 1024) {
    ElMessage.warning('头像不能超过 2MB')
    return
  }
  if (avatarPreview.value) URL.revokeObjectURL(avatarPreview.value)
  avatarFile.value = raw
  avatarPreview.value = URL.createObjectURL(raw)
}

async function saveAvatar() {
  if (!avatarFile.value) return
  avatarSaving.value = true
  try {
    const body = new FormData()
    body.append('file', avatarFile.value)
    const url = await request.post(
      IS_PLATFORM ? '/system/profile/platform/avatar' : '/system/profile/avatar',
      body,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    userStore.avatar = url
    ElMessage.success('头像已更新')
    avatarDialog.value = false
  } catch {
    /* 失败已全局提示 */
  } finally {
    avatarSaving.value = false
    if (avatarPreview.value) URL.revokeObjectURL(avatarPreview.value)
    avatarPreview.value = ''
    avatarFile.value = null
  }
}

async function onCommand(command: string) {
  if (command === 'password') {
    passwordDialog.value = true
  } else if (command === 'twofactor') {
    twoFactorDialog.value = true
  } else if (command === 'avatar') {
    avatarFile.value = null
    avatarPreview.value = ''
    avatarDialog.value = true
  } else if (command === 'logout') {
    await doLogout()
  } else if (command === 'theme') {
    themeDialog.value = true
  } else if (command === 'customize') {
    await toggleCustomize()
  } else if (command === 'sessions') {
    await router.push('/profile/sessions')
  }
}

/** 首页编排入口：不在首页先跳过去再动作；编辑中则保存布局 */
async function toggleCustomize() {
  if (route.path !== '/home') {
    await router.push('/home')
    await nextTick()
  }
  if (portal.customizing) {
    await portal.saveCustomize()
  } else {
    portal.startCustomize()
  }
}

/** 改密成功：会话仍有效但口径上应重新认证，直接走登出流程 */
function onPasswordChanged() {
  ElMessage.success('密码已修改，请重新登录')
  doLogout()
}

async function doLogout() {
  try { await request.post('/auth/logout') } catch { /* 忽略 */ }
  userStore.logout()
  // 动态路由基于上一账号的菜单注册，整页跳转重置路由表，避免换账号后残留旧菜单
  window.location.href = LOGIN_PATH
}
</script>

<style scoped>
.layout {
  height: 100vh;
}
/* 主题背景作用于整个右侧框架：导航栏/标签栏/内容区半透明透出背景 */
.framework {
  position: relative;
}
.framework-mask {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
/* 固定高度行（顶栏/导航栏/页签栏/子级栏）禁止 flex 压缩：el-main 的 flex-basis 为 auto，
   长内容页会把容器撑出负空间，没有 flex-shrink:0 时导航栏/页签栏会被压矮（行高随页面内容变化） */
.framework > .navbar,
.framework > .tags-view,
.framework > .topbar,
.framework > .mix-aside {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}
.framework > .main {
  position: relative;
  z-index: 1;
}
/* mix 布局（一级顶部+子级左侧）：顶栏横贯，子级栏与页签/内容区左右分栏；
   grid areas 中无元素的区域（如首页/兜底应用无子级栏、页签关闭时）自动留空 */
.framework.layout-mix {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas:
    'topbar topbar'
    'mixaside tags'
    'mixaside main';
}
.framework.layout-mix > .topbar { grid-area: topbar; }
.framework.layout-mix > .mix-aside { grid-area: mixaside; }
.framework.layout-mix > .tags-view { grid-area: tags; }
.framework.layout-mix > .main { grid-area: main; }
.topbar {
  height: 44px;
  display: flex;
  align-items: center;
  padding-right: 16px;
  gap: 4px;
  /* 极窄视口最后防线：固定区（logo/操作区）+ 菜单最小宽（⋯）超出视口时按边界裁剪；
     各下拉/弹层均 teleport 到 body，不受此裁剪影响 */
  overflow: hidden;
  background: var(--mse-navbar-bg);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--mse-navbar-border);
}
.topbar-logo {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0 12px 0 16px;
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: bold;
  letter-spacing: 1px;
  white-space: nowrap;
}
/* mix 品牌块：与左侧子级栏同宽并居中（宽度跟随折叠态联动），构成左上角品牌区 */
.topbar-logo.top {
  justify-content: center;
  width: 200px;
  padding: 0;
  transition: width .2s;
}
.topbar-logo.top.collapsed {
  width: 64px;
}
/* 横向菜单颜色走 --el-menu-* 变量（与下方导航栏/面包屑同基色，随深浅色/主色联动） */
.topbar :deep(.horizontal-menu) {
  --el-menu-horizontal-height: 44px;
  --el-menu-bg-color: transparent;
  --el-menu-text-color: var(--el-text-color-primary);
  --el-menu-active-color: var(--el-color-primary);
  --el-menu-hover-bg-color: var(--el-fill-color-light);
}
/* 紧凑顶栏：横向菜单项收窄内边距，可容纳更多一级菜单 */
.topbar :deep(.horizontal-menu .el-menu-item),
.topbar :deep(.horizontal-menu .el-sub-menu__title) {
  padding: 0 14px;
}
.mix-aside {
  background: var(--mse-sidebar-bg);
  transition: width .2s;
  overflow: hidden;
}
.mix-scroll {
  height: 100%;
}
.aside {
  background: var(--mse-sidebar-bg);
  transition: width .2s;
  overflow: hidden;
}
.logo {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mse-sidebar-text);
  font-size: 15px;
  font-weight: bold;
  letter-spacing: 1px;
  white-space: nowrap;
  background: var(--mse-sidebar-logo-bg);
}
.menu-scroll {
  height: calc(100% - 44px);
}
.aside-menu {
  --el-menu-bg-color: var(--mse-sidebar-bg);
  --el-menu-text-color: var(--mse-sidebar-text);
  --el-menu-active-color: var(--mse-sidebar-active-text);
  --el-menu-hover-bg-color: var(--mse-sidebar-hover-bg);
  border-right: none;
}
.aside-menu:not(.el-menu--collapse) {
  width: 210px;
}
.navbar {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--mse-navbar-bg);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--mse-navbar-border);
  box-shadow: 0 1px 4px rgba(0, 21, 41, .06);
}
.navbar :deep(.el-button) {
  padding: 0 4px;
}
.framework :deep(.tags-view) {
  background: var(--mse-tags-bg);
  backdrop-filter: blur(8px);
}
.navbar-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.collapse-btn {
  flex-shrink: 0;
  font-size: 18px;
  cursor: pointer;
  color: var(--el-text-color-regular);
}
.theme-section + .theme-section {
  margin-top: 14px;
}
.theme-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.primary-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.color-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  outline: 1px solid var(--el-border-color-lighter);
  transition: transform .15s;
}
.color-dot:hover {
  transform: scale(1.12);
}
.color-dot.active {
  border-color: var(--el-bg-color);
  outline: 2px solid var(--el-color-primary);
}
.theme-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.theme-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
}
.theme-item:hover {
  background: var(--el-fill-color-light);
}
.theme-item.active {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}
.theme-swatch {
  width: 44px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color);
  flex-shrink: 0;
}
/* 「跟随内置默认」双色拼块：左亮右深，对应内置两套基线背景 */
.builtin-swatch {
  background: linear-gradient(90deg, #f5f7fa 50%, #1c2b3a 50%);
}
.theme-hint {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.theme-name {
  flex: 1;
  font-size: 13px;
}
.theme-check {
  color: var(--el-color-primary);
}
/* 跟随内置生效时，解析到的主题项以角标替代勾选，避免与「跟随内置默认」双高亮 */
.theme-builtin-badge {
  flex-shrink: 0;
}
.theme-none {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  text-align: center;
  padding: 8px 0;
}
.avatar-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.avatar-upload :deep(.el-upload) {
  border-radius: 50%;
  overflow: hidden;
}
.avatar-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.main {
  background: transparent;
  padding: 8px;
  overflow: auto;
}
/* bare 无壳：内容区铺满整个视口（外壳行已摘除，无残留空行） */
.layout.bare > .framework > .main {
  padding: 0;
}
</style>
