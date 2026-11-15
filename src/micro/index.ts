import { watch } from 'vue'
import WujieVue from 'wujie-vue3'
import { getEntry } from './apps'
import { useUserStore } from '../stores/user'
import { useMicroStore } from '../stores/micro'
import { useThemeStore } from '../stores/theme'
import { LOGIN_PATH } from '../config/side'

// wujie-vue3 的 ESM 入口仅默认导出组件，bus / preloadApp 是其静态属性
const { bus, preloadApp } = WujieVue

/**
 * 微前端初始化：在 pinia 安装后调用（见 main.ts）
 * - 登录态变化通过 bus 广播给存活子应用（alive 模式下 props 不会自动更新）
 * - 子应用会话过期通过 bus 通知主应用统一登出
 * - 外观主题（深浅色/主色）初始化并经 bus 广播，子应用跟随基座切换
 * - 生产环境预加载注册表子应用：先预载内置兜底表，登录后注册表被 /me 下发的
 *   后台配置替换时对新集合增量预载（wujie 对同名已加载应用幂等）
 */
export function initMicro() {
  const userStore = useUserStore()
  const microStore = useMicroStore()
  const themeStore = useThemeStore()

  themeStore.init()

  watch(
    () => ({
      token: userStore.token,
      tenantId: userStore.tenantId,
      platform: userStore.platform,
      nickname: userStore.nickname,
      permissions: userStore.permissions
    }),
    (auth) => bus.$emit('auth:change', auth)
  )

  // 主题快照含解析后的深浅色（auto 已解析），子应用直接应用无需跟随系统判断
  watch(() => themeStore.snapshot, (theme) => bus.$emit('theme:change', theme))

  bus.$on('sub:auth-expired', () => {
    userStore.logout()
    // 整页跳本侧登录页，顺带重置动态路由（与 Layout 登出同一策略）
    window.location.href = LOGIN_PATH
  })

  if (import.meta.env.PROD) {
    watch(() => microStore.apps, (apps) => {
      apps.forEach((app) => preloadApp({ name: app.name, url: getEntry(app) }))
    }, { immediate: true, deep: true })
  }
}
