import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'
import { exchangeSsoCode } from '../api/auth'
import { IS_PLATFORM, LOGIN_PATH } from '../config/side'
import type { MenuNode } from '../stores/user'

/** views 目录全量组件映射：菜单 component 字段（如 system/Role）→ 异步组件 */
const viewModules = import.meta.glob('../views/**/*.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // 双模式构建：租户端只挂租户登录，平台端只挂平台登录（见 src/config/side.ts）
    ...(IS_PLATFORM ? [{ path: '/platform/login', component: () => import('../views/PlatformLogin.vue') }] : [{ path: '/login', component: () => import('../views/Login.vue') }]),
    {
      path: '/',
      name: 'Layout',
      component: () => import('../views/Layout.vue'),
      redirect: '/home',
      children: [
        { path: 'home', component: () => import('../views/Home.vue'), meta: { title: '首页' } },
        // 微前端子应用：/sub/{appName}/**，按 appName 匹配子应用注册表；
        // 页面菜单（菜单管理 type=3）解析为 /sub/{name}{path} 后复用本通配路由，无需单独注册
        { path: 'sub/:appName/:pathMatch(.*)*', component: () => import('../micro/WujieContainer.vue') },
        // 消息中心：基座统一站内消息，从导航栏消息铃铛进入（个人数据，不占菜单/权限位）
        { path: 'message', component: () => import('../views/message/MessageCenter.vue'), meta: { title: '消息中心' } },
        // 登录设备：当前账号的在线会话管理，从头像下拉进入（个人数据，不占菜单/权限位）
        { path: 'profile/sessions', component: () => import('../views/profile/MySessions.vue'), meta: { title: '登录设备' } },
        // 字典数据子页：从字典管理（system/Dict）跳入，不占菜单位
        { path: 'system/dict-data/:dictType?', component: () => import('../views/system/DictData.vue'), meta: { title: '字典数据' } }
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/home' }
  ]
})

let dynamicRoutesAdded = false

router.beforeEach(async (to) => {
  const userStore = useUserStore()
  // IM 工作台一次性 code 免登（租户端）：聊天客户端跳转 URL 携 ?ssoCode=xxx，
  // 兑换标准租户会话后摘参重新进入目标地址；兑换失败静默摘参（无 token 时守卫
  // 自然回落登录页走常规登录），已登录则忽略 code 仅摘参。平台端不启用。
  if (!IS_PLATFORM && to.query.ssoCode) {
    const ssoCode = String(to.query.ssoCode)
    const target = { path: to.path, query: { ...to.query, ssoCode: undefined }, hash: to.hash }
    if (!userStore.token) {
      try {
        const result = await exchangeSsoCode(ssoCode)
        userStore.setLogin({
          tokenValue: result.tokenValue,
          tenantId: result.tenantId,
          nickname: result.nickname,
          platform: false
        })
      } catch {
        // code 无效/过期/站点不匹配：不暴露细节，常规登录
      }
    }
    return target
  }
  // 本侧登录页：已登录跳首页，未登录放行
  if (to.path === LOGIN_PATH) {
    return userStore.token ? '/' : true
  }
  if (!userStore.token) return LOGIN_PATH
  if (!userStore.profileLoaded) {
    try {
      await userStore.fetchProfile()
    } catch {
      userStore.logout()
      return LOGIN_PATH
    }
    if (!dynamicRoutesAdded) {
      registerMenuRoutes(userStore.menus)
      dynamicRoutesAdded = true
      // 重新进入当前地址，让新增路由参与匹配。
      // 配置级 redirect（catch-all → /home）先于守卫解析：刷新动态菜单路由时
      // to 已被改写成 /home，须用 redirectedFrom 还原浏览器原始地址
      return to.redirectedFrom?.fullPath ?? to.fullPath
    }
  }
  return true
})

/** 按菜单树递归注册动态路由（目录节点提供路径前缀，菜单节点挂载组件；type=3 子应用页面走 /sub 通配路由不注册） */
function registerMenuRoutes(nodes: MenuNode[]) {
  const walk = (list: MenuNode[], base: string) => {
    for (const node of list) {
      if (node.menu.visible === 1) continue
      const fullPath = resolvePath(base, node.menu.path)
      if (node.menu.type === 2 && node.menu.component) {
        const component = viewModules[`../views/${node.menu.component}.vue`]
        if (component) {
          router.addRoute('Layout', { path: fullPath, component, meta: { title: node.menu.name } })
        } else {
          console.warn(`[mse-ui] 菜单组件不存在: ${node.menu.component}（菜单 ${node.menu.name}）`)
        }
      }
      if (node.children?.length) walk(node.children, fullPath)
    }
  }
  walk(nodes, '')
}

function resolvePath(base: string, path: string): string {
  if (!path) return base
  if (path.startsWith('/')) return path
  return base ? `${base}/${path}` : `/${path}`
}

export default router
