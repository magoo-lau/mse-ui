import { defineStore } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../api/request'
import { BUILTIN_DARK_THEME_ID, BUILTIN_LIGHT_THEME_ID, builtinTemplate, builtinThemes } from '../home/defaultLayout'
import {
  isDarkBg,
  parseTemplate,
  parseUserSetting,
  themeMask,
  themeStyle,
  themeVars,
  type HomeTemplateData,
  type HomeTheme,
  type HomeWidget,
  type PortalVO,
  type UserSettingData
} from '../home/types'
import { useThemeStore } from './theme'

/**
 * 门户首页状态：模板/个性化/主题背景与自定义模式。
 *
 * 主题背景作用于整个框架（Layout 根容器应用 bgStyle），故由 Layout 挂载时 load()；
 * Home 页与顶栏按钮（自定义/主题）共用本 store。
 * 主题槽位按外观模式分亮/深两套：用户选择即微调，未选择时深色自动回退内置深色背景。
 */
export const usePortalStore = defineStore('portal', {
  state: () => ({
    template: null as HomeTemplateData | null,
    userSetting: null as UserSettingData | null,
    loaded: false,
    loading: false,
    customizing: false,
    saving: false,
    addDrawerVisible: false,
    draftLayout: [] as HomeWidget[],
    draftThemeId: '',
    draftDarkThemeId: ''
  }),
  getters: {
    /** 后台模板优先，空则回退内置默认（与子应用注册表兜底同思想） */
    resolvedTemplate(state): HomeTemplateData {
      return state.template || builtinTemplate()
    },
    themes(state): HomeTheme[] {
      return this.resolvedTemplate.themes || []
    },
    /** 顶栏全局搜索开关（模板 globalSearch 缺省视为开启） */
    globalSearchEnabled(state): boolean {
      return this.resolvedTemplate.globalSearch !== false
    },
    /** 按 id 查主题：先管理员模板主题库，未命中回退内置主题库（保证内置亮/深背景永远可用） */
    findTheme(state): (id: string) => HomeTheme | undefined {
      return (id: string) => this.themes.find((t) => t.id === id) || builtinThemes.find((t) => t.id === id)
    },
    /** 亮色模式主题槽位：用户选择 → 模板默认 → 模板首个 → 内置浅色（自定义模式按草稿解析，预览即保存后效果） */
    lightThemeId(state): string {
      const picked = state.customizing ? state.draftThemeId : state.userSetting?.themeId
      return picked || this.resolvedTemplate.defaultThemeId || this.themes[0]?.id || BUILTIN_LIGHT_THEME_ID
    },
    /** 深色模式主题槽位：用户选择 → 管理员深色默认 → 自动判定（亮色槽位主题深色调则沿用，否则内置深蓝） */
    darkThemeId(state): string {
      const picked = state.customizing ? state.draftDarkThemeId : state.userSetting?.darkThemeId
      if (picked) return picked
      const tplDark = this.resolvedTemplate.defaultDarkThemeId
      return tplDark && this.findTheme(tplDark) ? tplDark : this.autoDarkThemeId
    },
    /** 深色槽位自动判定（用户未单独选择深色主题时生效） */
    autoDarkThemeId(state): string {
      const light = this.findTheme(this.lightThemeId)
      return light && isDarkBg(light) ? this.lightThemeId : BUILTIN_DARK_THEME_ID
    },
    /** 当前外观模式生效的主题 id（槽位解析已含自定义草稿，'' 即跟随内置） */
    currentThemeId(state): string {
      return useThemeStore().resolvedDark ? this.darkThemeId : this.lightThemeId
    },
    /** 当前外观模式生效的主题（bgStyle/maskColor/cssVars 的共同来源） */
    activeTheme(state): HomeTheme | undefined {
      return this.findTheme(this.currentThemeId)
    },
    bgStyle(): Record<string, string> {
      return themeStyle(this.activeTheme)
    },
    maskColor(): string {
      return themeMask(this.activeTheme)
    },
    /** 主题多维配色 → CSS 变量（Layout 根容器绑定，卡片/顶栏/侧边栏按主题库覆盖默认基线） */
    cssVars(): Record<string, string> {
      return themeVars(this.activeTheme)
    },
    /**
     * 生效布局：用户个性化与模板合并。
     * 模板卡片的「内容」（地址/参数/字段映射等）以管理员模板为准——管理员改了网页嵌入地址等配置，
     * 已保存过个人首页的用户也能即时拿到；用户快照只决定「有没有、在哪、多宽、停没停」，
     * 以及自行从可选块目录添加的卡片（模板中没有同 id 卡片时原样保留）。
     * 用户主动移除的模板卡记录在 removedIds，不再自动补回；管理员新增的卡片自动下发。
     * 用户级参数覆盖（overrides）最后套用：仅覆盖数据展示类字段（标题/接口/参数/字段映射等），
     * 其余内容仍以管理员为准。
     */
    effectiveLayout(state): HomeWidget[] {
      const setting = state.userSetting
      if (!setting) return this.resolvedTemplate.layout
      const user = setting.layout || []
      if (!user.length) return user
      const template = this.resolvedTemplate.layout
      const removed = new Set(setting.removedIds || [])
      const overrides = setting.overrides || {}
      const tplById = new Map<string, HomeWidget>(template.map((w) => [w.id, w] as [string, HomeWidget]))
      const merged = user.map((w) => {
        const t = tplById.get(w.id)
        const base = t ? { ...t, span: w.span, enabled: w.enabled } : w
        return overrides[w.id] ? { ...base, ...overrides[w.id] } : base
      })
      const known = new Set(user.map((w) => w.id))
      for (const t of template) {
        if (!known.has(t.id) && !removed.has(t.id)) {
          const copy = JSON.parse(JSON.stringify(t)) as HomeWidget
          merged.push(overrides[t.id] ? { ...copy, ...overrides[t.id] } : copy)
        }
      }
      return merged
    }
  },
  actions: {
    async load(force = false) {
      if (this.loaded || this.loading) return
      this.loading = true
      try {
        const portal: PortalVO = await request.get('/system/home/portal', { skipErrorToast: true })
        this.template = parseTemplate(portal?.template?.layoutJson)
        this.userSetting = parseUserSetting(portal?.userSetting?.layoutJson)
        this.loaded = true
      } catch {
        // 接口不可达（如旧版后端）：整体回退内置默认，首页依旧可用
      } finally {
        this.loading = false
      }
      void force
    },
    startCustomize() {
      this.draftLayout = JSON.parse(JSON.stringify(this.effectiveLayout)) as HomeWidget[]
      // 两个槽位分别播种（'' 表示未选择/跟随内置），避免把自动解析结果固化成显式选择
      this.draftThemeId = this.userSetting?.themeId || ''
      this.draftDarkThemeId = this.userSetting?.darkThemeId || ''
      this.customizing = true
    },
    cancelCustomize() {
      this.customizing = false
      this.addDrawerVisible = false
    },
    async saveCustomize() {
      this.saving = true
      try {
        // 相对当前模板求「被移除的模板卡」：合并布局据此跳过补回，管理员后续新增的卡片才会正常下发
        const removedIds = this.resolvedTemplate.layout
          .filter((t) => !this.draftLayout.some((d) => d.id === t.id))
          .map((t) => t.id)
        const themeId = this.draftThemeId || undefined
        const darkThemeId = this.draftDarkThemeId || undefined
        const overrides = this.userSetting?.overrides
        await request.put('/system/home/user-setting', {
          layoutJson: JSON.stringify({ layout: this.draftLayout, themeId, darkThemeId, overrides, removedIds: removedIds.length ? removedIds : undefined })
        })
        this.userSetting = {
          layout: this.draftLayout,
          themeId,
          darkThemeId,
          overrides,
          removedIds: removedIds.length ? removedIds : undefined
        }
        this.customizing = false
        this.addDrawerVisible = false
        ElMessage.success('已保存个性化首页')
      } catch {
        /* 全局提示已处理 */
      } finally {
        this.saving = false
      }
    },
    async resetCustomize() {
      await ElMessageBox.confirm('恢复为管理员设置的默认首页？', '恢复默认', { type: 'warning' })
      try {
        await request.delete('/system/home/user-setting')
        this.userSetting = null
        this.customizing = false
        this.addDrawerVisible = false
        ElMessage.success('已恢复默认首页')
      } catch {
        /* 全局提示已处理 */
      }
    },
    removeDraft(index: number) {
      this.draftLayout.splice(index, 1)
    },
    spanDraft(index: number, delta: number) {
      const widget = this.draftLayout[index]
      if (widget) widget.span = Math.min(24, Math.max(1, (widget.span || 24) + delta))
    },
    isAdded(catalogId: string): boolean {
      return this.draftLayout.some((item) => item.id === catalogId)
    },
    addFromCatalog(item: HomeWidget) {
      if (this.isAdded(item.id)) return
      // 保留目录项 id：与 isAdded 判重联动，同一可选块只可添加一张
      const copy = JSON.parse(JSON.stringify(item)) as HomeWidget
      copy.enabled = true
      this.draftLayout.push(copy)
    },
    /**
     * 主题即点即用：写入当前外观模式的槽位（亮/深互不影响，另一槽位原值保留）。
     * 自定义模式内仅预览（随保存持久化）；非自定义模式直接保存生效（布局与移除清单原样保留）。
     */
    async pickTheme(theme: HomeTheme) {
      const dark = useThemeStore().resolvedDark
      if (this.customizing) {
        if (dark) this.draftDarkThemeId = theme.id
        else this.draftThemeId = theme.id
        return
      }
      const layout = this.effectiveLayout
      const removedIds = this.userSetting?.removedIds
      const overrides = this.userSetting?.overrides
      const themeId = dark ? this.userSetting?.themeId : theme.id
      const darkThemeId = dark ? theme.id : this.userSetting?.darkThemeId
      try {
        await request.put('/system/home/user-setting', {
          layoutJson: JSON.stringify({ layout, themeId: themeId || undefined, darkThemeId: darkThemeId || undefined, overrides, removedIds })
        })
        this.userSetting = { layout, themeId: themeId || undefined, darkThemeId: darkThemeId || undefined, overrides, removedIds }
        ElMessage.success(`已切换${dark ? '深色模式' : '亮色模式'}主题：${theme.name}`)
      } catch {
        /* 全局提示已处理 */
      }
    },
    /** 清空当前外观模式的主题选择，回到「跟随内置」（深色自动：亮色槽位主题深色调则沿用，否则内置深蓝） */
    async clearThemePick() {
      const dark = useThemeStore().resolvedDark
      if (this.customizing) {
        if (dark) this.draftDarkThemeId = ''
        else this.draftThemeId = ''
        return
      }
      const layout = this.effectiveLayout
      const removedIds = this.userSetting?.removedIds
      const overrides = this.userSetting?.overrides
      const themeId = dark ? this.userSetting?.themeId : undefined
      const darkThemeId = dark ? undefined : this.userSetting?.darkThemeId
      try {
        await request.put('/system/home/user-setting', {
          layoutJson: JSON.stringify({ layout, themeId: themeId || undefined, darkThemeId: darkThemeId || undefined, overrides, removedIds })
        })
        this.userSetting = { layout, themeId: themeId || undefined, darkThemeId: darkThemeId || undefined, overrides, removedIds }
        ElMessage.success('已恢复内置默认背景')
      } catch {
        /* 全局提示已处理 */
      }
    },
    /** 自定义模式内启停卡片（draftLayout.enabled 随摆放快照一并保存） */
    toggleDraft(index: number) {
      const widget = this.draftLayout[index]
      if (widget) widget.enabled = widget.enabled === false
    },
    /**
     * 保存用户级卡片参数覆盖（仅数据展示类字段）：与 pickTheme 同持久化口径——
     * 布局取当前生效布局快照，overrides 增量合并后整体写入。
     */
    async saveWidgetOverride(widgetId: string, patch: Partial<HomeWidget>) {
      const overrides = { ...(this.userSetting?.overrides || {}) }
      overrides[widgetId] = { ...(overrides[widgetId] || {}), ...patch }
      const layout = this.effectiveLayout
      const removedIds = this.userSetting?.removedIds
      const themeId = this.userSetting?.themeId
      const darkThemeId = this.userSetting?.darkThemeId
      await request.put('/system/home/user-setting', {
        layoutJson: JSON.stringify({ layout, themeId: themeId || undefined, darkThemeId: darkThemeId || undefined, overrides, removedIds })
      })
      this.userSetting = { layout, themeId, darkThemeId, overrides, removedIds }
    },
    /** 清除某卡片的用户参数覆盖（该卡回管理员模板内容） */
    async clearWidgetOverride(widgetId: string) {
      const overrides = { ...(this.userSetting?.overrides || {}) }
      delete overrides[widgetId]
      const layout = this.effectiveLayout
      const removedIds = this.userSetting?.removedIds
      const themeId = this.userSetting?.themeId
      const darkThemeId = this.userSetting?.darkThemeId
      await request.put('/system/home/user-setting', {
        layoutJson: JSON.stringify({ layout, themeId: themeId || undefined, darkThemeId: darkThemeId || undefined, overrides, removedIds })
      })
      this.userSetting = { layout, themeId, darkThemeId, overrides, removedIds }
    }
  }
})
