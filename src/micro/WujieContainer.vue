<template>
  <div
    class="micro-container"
    v-loading="!!app && !ready"
    element-loading-text="子应用加载中…"
    element-loading-background="var(--el-bg-color)"
  >
    <WujieVue
      v-if="app"
      :key="renderKey"
      width="100%"
      height="100%"
      :name="appName"
      :url="entry"
      :sync="true"
      :alive="true"
      :props="wujieProps"
      :after-mount="markReady"
      :activated="markReady"
    />
    <el-empty v-else :description="`未找到子应用 ${appName}，请在平台端「子应用管理」中配置，或在 src/micro/apps.ts 内置注册表中登记`" />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import WujieVue from 'wujie-vue3'
import { getEntry } from './apps'
import { useUserStore } from '../stores/user'
import { useMicroStore } from '../stores/micro'
import { useThemeStore } from '../stores/theme'

defineOptions({ name: 'WujieContainer' })

const { bus, destroyApp } = WujieVue
const route = useRoute()
const userStore = useUserStore()
const microStore = useMicroStore()
const themeStore = useThemeStore()

// appName 只在实例创建时解析一次，不跟随路由响应：router-view 的 key 已按 appName 分组实例，
// keep-alive 缓存的实例在路由切走后仍会响应式重渲染，若 app 跟随 route 变为 undefined，
// v-if 会把 WujieVue 连同 wujie-app 宿主一起卸载，保活中的子应用 DOM 被孤立，切回即白屏
const appName = String(route.params.appName ?? '')
const app = computed(() => microStore.apps.find((item) => item.name === appName))
const entry = computed(() => (app.value ? getEntry(app.value) : ''))

// 加载态与快速切换自愈：startApp 是异步链（取入口 → 处理 HTML → 挂载），若挂载完成前路由切走，
// keep-alive 会把尚未挂载完的 webcomponent 连同容器一起移出文档，切回时 wujie 的挂载目标已
// 脱离文档 → 内容区空白（README 微前端已知限制 #1）。对策：
// ① 未就绪前显示 loading 占位（ready 由框架侧 afterMount 与子应用 sub:ready 双信号置位）；
// ② 曾在加载中途切走的实例，重新激活时清空串行队列并重建 WujieVue 实例（重启 startApp），
//    避免采纳脱离文档的死容器
const ready = ref(false)
const renderKey = ref(0)
const leftMidLoad = ref(false)
let readyFallbackTimer: ReturnType<typeof setTimeout> | undefined

// 框架侧就绪信号（wujie 选项透传，不依赖子应用配合）；子应用模板另有 sub:ready 上报作为冗余。
// afterMount 只在子应用首次执行时触发一次；alive 沙箱被再次激活（页签刷新/加载中途切走后沙箱已执行完）
// 走 startApp 快速复用分支不再触发 afterMount，此时只有 activated 生命周期会亮
function markReady() {
  ready.value = true
  if (readyFallbackTimer) {
    clearTimeout(readyFallbackTimer)
    readyFallbackTimer = undefined
  }
}

// 兜底：入口不可达等异常场景 afterMount 永不触发，30s 后撤掉遮罩避免永挂
function armReadyFallback() {
  readyFallbackTimer = setTimeout(markReady, 30000)
}
armReadyFallback()

// 传给子应用的初始数据；登录态后续变化通过 bus 的 auth:change 事件广播（alive 模式 props 不会自动更新）
// 外观主题以解析后的快照下发（auto 已解析），后续变化由 bus 的 theme:change 广播
const wujieProps = computed(() => ({
  urlPrefix: `/sub/${appName}`,
  token: userStore.token,
  tenantId: userStore.tenantId,
  platform: userStore.platform,
  nickname: userStore.nickname,
  permissions: userStore.permissions,
  theme: themeStore.snapshot
}))

// 基座菜单驱动子应用导航：wujie 的 sync 只做"子→主"单向同步，
// 主应用路由变化（菜单点击/直达 URL）需通过 bus 下发目标路径给子应用；
// query 随路径一并下发（首页卡片行点击可携带行参数，如 /sub/oa/task?id=1），
// 仅监听 route.path（不监听 fullPath）避免 wujie sync 改写主应用 query 时造成回环
function navigateToSub(path: string, query: Record<string, unknown> = {}) {
  const prefix = `/sub/${appName}`
  if (!app.value || (path !== prefix && !path.startsWith(`${prefix}/`))) return
  const subPath = path === prefix ? '/' : path.slice(prefix.length) || '/'
  // bare 是基座外壳开关（?bare=1），只作用于主应用 Layout，不下发给子应用内部路由
  const entries = Object.entries(query).filter(([k, v]) => k !== 'bare' && v != null)
  const qs = entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
  bus.$emit('sub:navigate', { urlPrefix: prefix, path: subPath + qs })
}

watch(() => route.path, (p) => navigateToSub(p, route.query), { immediate: true })

// 子应用挂载完成后上报 ready，此时再下发一次当前目标路由：
// 直达/刷新场景（URL 无 sync query）子应用会从默认路由启动，immediate 的下发早于子应用就绪而丢失
function onSubReady(msg: { urlPrefix: string }) {
  if (msg.urlPrefix === `/sub/${appName}`) {
    markReady()
    navigateToSub(route.path, route.query)
  }
}
bus.$on('sub:ready', onSubReady)

// 页签「刷新页面」（TagsView 广播 sub:refresh）：alive 沙箱复用只是把旧 DOM 原样搬回（子应用 JS 不重跑、
// 状态原样），谈不上"刷新"。销毁沙箱后重建 WujieVue 实例，子应用全量重跑 = 真刷新；
// 新链从首次执行启动，afterMount / sub:ready 双信号自然恢复，主应用 URL 的 sync 参数会把
// 子应用内部路由带回刷新前的页面（与浏览器 F5 同语义）
async function onSubRefresh(msg: { urlPrefix: string }) {
  if (msg?.urlPrefix !== `/sub/${appName}`) return
  ready.value = false
  armReadyFallback()
  clearWujieQueue()
  await destroyApp(appName)
  renderKey.value++
}
bus.$on('sub:refresh', onSubRefresh)

// wujie-vue3 的清理钩子用的是 Vue2 的 beforeDestroy（Vue3 不触发），window.__WUJIE_QUEUE
// 里的串行队列条目永不清理；若旧链停摆未 settle，同名新实例会采纳死链导致 startApp 永不执行。
// 容器整体卸载（标签刷新/登出）或加载中途切走后重建时手动清掉条目，让实例从干净的空链开始
function clearWujieQueue() {
  const queue = (window as any).__WUJIE_QUEUE
  if (queue && queue[appName]) delete queue[appName]
}

onDeactivated(() => {
  if (!ready.value) leftMidLoad.value = true
})

onActivated(() => {
  if (leftMidLoad.value && !ready.value) {
    leftMidLoad.value = false
    if (readyFallbackTimer) clearTimeout(readyFallbackTimer)
    armReadyFallback()
    clearWujieQueue()
    renderKey.value++
  }
})

onBeforeUnmount(() => {
  bus.$off('sub:ready', onSubReady)
  bus.$off('sub:refresh', onSubRefresh)
  if (readyFallbackTimer) clearTimeout(readyFallbackTimer)
  clearWujieQueue()
})
</script>

<style scoped>
.micro-container {
  height: 100%;
}
</style>
