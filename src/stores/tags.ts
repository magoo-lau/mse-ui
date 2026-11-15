import { defineStore } from 'pinia'
import { storageKey } from '../config/side'

export interface TagView {
  /** 完整路由路径（含 query，作为唯一键） */
  path: string
  title: string
  /** 固定标签（首页）不可关闭 */
  affix?: boolean
}

/** 页签持久化 key 与 token/user 同侧别隔离（租户/平台两端互不覆盖），最多保留最近 50 个 */
const STORAGE_KEY = storageKey('tags')
const HOME_VIEW: TagView = { path: '/home', title: '首页', affix: true }
const MAX_VIEWS = 50

/** 启动时恢复上次会话的页签：坏数据/非法条目逐条丢弃，首页固定签恒在首位 */
function loadViews(): TagView[] {
  const views: TagView[] = [{ ...HOME_VIEW }]
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return views
    const saved = JSON.parse(raw) as TagView[]
    if (!Array.isArray(saved)) return views
    const seen = new Set(views.map((v) => v.path))
    for (const view of saved.slice(-MAX_VIEWS)) {
      if (!view || typeof view.path !== 'string' || !view.path.startsWith('/') ||
          typeof view.title !== 'string' || !view.title || seen.has(view.path)) continue
      seen.add(view.path)
      views.push({ path: view.path, title: view.title })
    }
  } catch { /* 坏数据按空页签处理 */ }
  return views
}

/** 多标签页（TagsView）状态：路由切换时由 Layout 注册访问过的页面；
 * 页签列表随变更写入 localStorage（设备级、登出清空），刷新后恢复；
 * 当前选中签无需单独记忆——刷新后浏览器还原当前 URL，选中态随路由自然恢复 */
export const useTagsStore = defineStore('tags', {
  state: () => ({
    views: loadViews(),
    /** 刷新计数：配合 router-view key 强制重挂载当前页 */
    refreshKey: 0
  }),
  actions: {
    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.views.slice(-MAX_VIEWS)))
      } catch { /* 存储不可写时放弃持久化，不影响使用 */ }
    },
    addView(view: TagView) {
      if (this.views.some((v) => v.path === view.path)) return
      this.views.push(view)
      this.persist()
    },
    /** 子应用上报标题的就地纠正（标题晚于页签注册到达） */
    renameView(path: string, title: string) {
      const view = this.views.find((v) => v.path === path)
      if (!view || view.title === title) return
      view.title = title
      this.persist()
    },
    removeView(path: string): string | null {
      const idx = this.views.findIndex((v) => v.path === path)
      if (idx < 0 || this.views[idx].affix) return null
      this.views.splice(idx, 1)
      this.persist()
      // 关闭的是当前页时跳向相邻标签
      const next = this.views[Math.min(idx, this.views.length - 1)]
      return next?.path ?? null
    },
    closeOthers(path: string) {
      this.views = this.views.filter((v) => v.affix || v.path === path)
      this.persist()
    },
    closeAll(): string {
      this.views = this.views.filter((v) => v.affix)
      this.persist()
      return '/home'
    },
    /** 登出清空：页签属会话级状态，避免换账号残留上一账号的页面入口 */
    clear() {
      this.views = [{ ...HOME_VIEW }]
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* 忽略 */ }
    },
    /** 刷新当前页：递增 key，router-view 以 key 重挂载 */
    refresh() {
      this.refreshKey++
    }
  }
})
