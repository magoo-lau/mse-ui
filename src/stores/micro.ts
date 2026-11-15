import { defineStore } from 'pinia'
import { builtinMicroApps, sideOf, menuVisible, CLIENT_PC, type MicroAppConfig } from '../micro/apps'

interface MicroAppItem {
  name: string
  title: string
  devEntry: string
  prodEntry: string
  side: number | string
  /** 客户端 1 PC 2 移动端（后端已按端过滤，此处防御性透传） */
  client?: number | string
  /** 是否登记过页面菜单（type=3）：这类应用入口收敛在菜单树，侧边栏不再兜底渲染单项 */
  hasMenus?: boolean
}

/**
 * 微前端子应用注册表（后台配置优先，内置兜底；仅应用地址，页面菜单在菜单管理维护）。
 *
 * - 登录后 userStore.fetchProfile 用 /me 下发的 microApps 填充（平台端「子应用管理」维护，
 *   租户端经套餐圈定）；
 * - 空列表是双语义，按后端 appsRegistered 区分：已登记过应用（true）= 裁剪后当前账号
 *   一个都不可见 → 显式清空（内置兜底表不得绕过授权）；从未登记（false/缺省，兼容旧后端）
 *   → 保留 builtinMicroApps，保证零配置起步；
 * - 登出重置回兜底表，避免串账号残留上一租户的子应用集合。
 */
export const useMicroStore = defineStore('micro', {
  state: () => ({
    apps: builtinMicroApps as MicroAppConfig[]
  }),
  getters: {
    /** 按登录端过滤后的可见子应用（侧边栏数据源） */
    visibleApps(state) {
      return (platform: boolean) => state.apps.filter((app) => menuVisible(app, platform))
    }
  },
  actions: {
    /** 用 /me 下发的子应用列表填充；空列表按 appsRegistered 区分「不可见=清空」与「未登记=兜底」 */
    applyFromProfile(list: MicroAppItem[] | undefined | null, appsRegistered?: boolean) {
      if (list?.length) {
        this.apps = list
          .filter((item) => Number(item.client ?? CLIENT_PC) === CLIENT_PC)
          .map((item) => ({
            name: item.name,
            title: item.title,
            devEntry: item.devEntry || '',
            prodEntry: item.prodEntry,
            side: sideOf(item.side),
            client: Number(item.client ?? CLIENT_PC),
            hasMenus: !!item.hasMenus
          }))
        return
      }
      if (appsRegistered) this.apps = []
    },
    reset() {
      this.apps = builtinMicroApps
    }
  }
})
