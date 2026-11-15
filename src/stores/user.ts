import { defineStore } from 'pinia'
import request from '../api/request'
import { APP_TITLE, IS_PLATFORM, storageKey } from '../config/side'
import { useMicroStore } from './micro'
import { useTagsStore } from './tags'

export interface MenuNode {
  menu: {
    id: number
    parentId: number
    name: string
    /** 1 目录 2 菜单 3 子应用页面 */
    type: number
    menuScope: number
    path: string
    /** type=3 所属子应用标识（sys_micro_app.name），渲染为 /sub/{microName}{path} */
    microName: string | null
    /** 菜单图标（sys_menu.icon，目录/菜单可选；导航渲染用，未配置为 null） */
    icon: string | null
    component: string
    sort: number
    visible: number
    status: number
  }
  children: MenuNode[]
}

/** 刷新后恢复登录用户信息（token/user 分 key 存，与 request.ts / 路由守卫约定一致） */
function loadPersistedUser(): { tenantId: string | number; nickname: string; platform: boolean; avatar: string } {
  try {
    const raw = localStorage.getItem(storageKey('user'))
    if (raw) return { tenantId: '', nickname: '', platform: false, avatar: '', ...JSON.parse(raw) }
  } catch { /* 忽略损坏数据 */ }
  return { tenantId: '', nickname: '', platform: false, avatar: '' }
}

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem(storageKey('token')) || '',
    ...loadPersistedUser(),
    /** 后端下发的可见菜单树（动态路由 + 侧边栏）与权限码集合（按钮显隐） */
    menus: [] as MenuNode[],
    permissions: [] as string[],
    roles: [] as string[],
    profileLoaded: false,
    /** 当前租户名称（profile 下发，顶栏标识显示用；平台端为空） */
    tenantName: '',
    /** 界面名称（内置参数 sys.site.name / sys.platform.name 下发，左上角与标签页标题；空回退构建期标题） */
    siteName: '',
    /** 多页签策略（内置参数 sys.ui.tagsPolicy）：optional=用户自选（缺省）/ fixed-on=强制开启 / fixed-off=强制关闭 */
    tagsPolicy: 'optional' as 'optional' | 'fixed-on' | 'fixed-off',
    /** 当前生效双因子模式（/me 下发：本租户→平台域→默认 off）：off 时头像菜单隐藏「双因子认证」绑定入口 */
    totpMode: 'optional' as 'off' | 'optional' | 'required'
  }),
  actions: {
    setLogin(data: { tokenValue: string; tenantId: string | number; nickname: string; platform: boolean }) {
      this.token = data.tokenValue
      this.tenantId = data.tenantId
      this.nickname = data.nickname
      this.platform = data.platform
      localStorage.setItem(storageKey('token'), data.tokenValue)
      localStorage.setItem(storageKey('user'), JSON.stringify({ tenantId: data.tenantId, nickname: data.nickname, platform: data.platform }))
    },
    /** 拉取当前登录者的菜单树/权限码/角色/子应用（动态路由、按钮权限与侧边栏子应用的数据源）；端点按构建侧别固定 */
    async fetchProfile() {
      const data = await request.get(IS_PLATFORM ? '/system/profile/platform/me' : '/system/profile/me')
      this.menus = data.menus || []
      this.permissions = data.permissions || []
      this.roles = data.roles || []
      if (data.user?.nickname) this.nickname = data.user.nickname
      this.avatar = data.user?.avatar || ''
      this.tenantName = data.tenantName || ''
      // 双因子生效模式：仅接受合法值，缺失/异常值回退 optional（入口显示，交由登录链路实际拦截）
      this.totpMode = data.totpMode === 'off' || data.totpMode === 'required' ? data.totpMode : 'optional'
      // 子应用注册：后台配置优先；空列表按 appsRegistered 区分「已登记但不可见=清空」与「从未登记=内置兜底」（stores/micro.ts）
      useMicroStore().applyFromProfile(data.microApps, data.appsRegistered)
      this.profileLoaded = true
      // 界面名称异步补拉（不阻塞路由守卫）：内置参数缺失/读取失败静默回退构建期标题
      this.loadSiteName()
      // 多页签策略异步补拉：参数缺失/读取失败静默回退用户自选
      this.loadUiPrefs()
    },
    /** 读取界面名称内置参数：租户端 sys.site.name（每租户各自定制）/ 平台端 sys.platform.name */
    async loadSiteName() {
      try {
        const value = await request.get(
          IS_PLATFORM ? '/system/config/platform/config-key/sys.platform.name' : '/system/config/config-key/sys.site.name',
          { skipErrorToast: true }
        )
        this.siteName = value || ''
      } catch {
        this.siteName = ''
      }
      document.title = this.siteName || APP_TITLE
    },
    /** 读取多页签策略内置参数 sys.ui.tagsPolicy：非合法值/未配置/读取失败一律回退 optional（用户自选） */
    async loadUiPrefs() {
      try {
        const value = await request.get(
          IS_PLATFORM ? '/system/config/platform/config-key/sys.ui.tagsPolicy' : '/system/config/config-key/sys.ui.tagsPolicy',
          { skipErrorToast: true }
        )
        this.tagsPolicy = value === 'fixed-on' || value === 'fixed-off' ? value : 'optional'
      } catch {
        this.tagsPolicy = 'optional'
      }
    },
    /** 按钮级权限判定：超管（*）或命中任一权限码 */
    hasPermission(codes: string | string[]): boolean {
      const list = Array.isArray(codes) ? codes : [codes]
      if (!list.length) return true
      return this.permissions.includes('*') || list.some((code) => this.permissions.includes(code))
    },
    logout() {
      this.token = ''
      this.tenantId = ''
      this.nickname = ''
      this.platform = false
      this.avatar = ''
      this.menus = []
      this.permissions = []
      this.roles = []
      this.profileLoaded = false
      this.tenantName = ''
      this.siteName = ''
      this.tagsPolicy = 'optional'
      this.totpMode = 'optional'
      document.title = APP_TITLE
      // 子应用集合重置回内置兜底表，避免换账号后残留上一租户的配置
      useMicroStore().reset()
      // 页签属会话级状态一并清空，避免换账号残留上一账号的页面入口
      useTagsStore().clear()
      localStorage.removeItem(storageKey('token'))
      localStorage.removeItem(storageKey('user'))
    }
  }
})
