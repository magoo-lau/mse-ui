import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 全局外观状态：深浅色模式 + 主题色 + 菜单布局/多页签偏好（设备级偏好，localStorage 持久化，不入库）。
 *
 * - mode=auto 跟随系统（matchMedia 实时监听）；snapshot 下发的是解析结果，子应用免判断
 * - 主色按 Element Plus 亮/暗两套官方衍生算法整组重算（light-N 亮色向白混、暗色向 #141414
 *   混），内联写在 documentElement 上，优先级高于 dark/css-vars.css
 * - layout/showTags 同属设备级偏好：菜单布局三形态（left/top/mix）与多页签开关；
 *   多页签最终显隐还受租户策略 sys.ui.tagsPolicy 约束（user store，fixed-* 强制）
 * - 子应用联动：micro/index.ts watch snapshot 经 bus 广播 theme:change（alive 模式 props 不更新）
 */

export type ThemeMode = 'light' | 'dark' | 'auto'
/** 菜单布局：left=左侧 / top=顶部 / mix=一级在顶部、子级在左侧 */
export type MenuLayout = 'left' | 'top' | 'mix'

const STORAGE_KEY = 'mse-theme'
export const DEFAULT_PRIMARY = '#409eff'
/** Element Plus 暗色衍生变量的混合基准（与 theme-chalk/dark/css-vars.css 实测值一致） */
const DARK_MIX_BASE = '#141414'

/** #rgb/#rrggbb → [r,g,b]；非法输入返回 null */
function parseHex(color: string): [number, number, number] | null {
  let hex = color.trim().replace(/^#/, '')
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}

/** 两色按 weight（第二色占比 0-1）混合 */
function mix(color: string, another: string, weight: number): string {
  const a = parseHex(color)
  const b = parseHex(another)
  if (!a || !b) return color
  const rgb = a.map((c, i) => Math.round(c + (b[i] - c) * weight))
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** 主色衍生变量组（与 Element Plus 亮/暗两套 css-vars 同算法：light-N 向白/#141414 混、dark-2 亮色向白/暗色向黑混） */
export function primaryVars(primary: string, dark: boolean): Record<string, string> {
  const base = dark ? DARK_MIX_BASE : '#ffffff'
  const vars: Record<string, string> = { '--el-color-primary': primary }
  for (const n of [3, 5, 7, 8, 9]) {
    vars[`--el-color-primary-light-${n}`] = mix(primary, base, n / 10)
  }
  vars['--el-color-primary-dark-2'] = mix(primary, dark ? '#000000' : '#ffffff', 0.2)
  return vars
}

/** 系统深色状态（模块级 ref：matchMedia 监听全局唯一，auto 模式共用） */
const systemDark = ref(false)

export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: 'light' as ThemeMode,
    primary: DEFAULT_PRIMARY,
    layout: 'left' as MenuLayout,
    showTags: true
  }),
  getters: {
    /** 实际生效深色：dark 恒深、light 恒浅、auto 跟随系统 */
    resolvedDark(): boolean {
      return this.mode === 'dark' || (this.mode === 'auto' && systemDark.value)
    },
    /** 下发子应用的快照（wujie props 初始值 / theme:change 事件共用同一结构） */
    snapshot(): { dark: boolean; primary: string } {
      return { dark: this.resolvedDark, primary: this.primary }
    }
  },
  actions: {
    /** 应用启动调用一次（initMicro 内）：读偏好、挂系统监听、应用首个主题 */
    init() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const saved = JSON.parse(raw) as { mode?: ThemeMode; primary?: string; layout?: MenuLayout; showTags?: boolean }
          if (saved.mode === 'light' || saved.mode === 'dark' || saved.mode === 'auto') this.mode = saved.mode
          if (saved.primary && parseHex(saved.primary)) this.primary = saved.primary
          if (saved.layout === 'left' || saved.layout === 'top' || saved.layout === 'mix') this.layout = saved.layout
          if (typeof saved.showTags === 'boolean') this.showTags = saved.showTags
        }
      } catch {
        /* 坏数据按默认值处理 */
      }
      // 宿主下发主题（IM 工作台等容器内嵌 bare 页经 URL 携带）：仅 bare=1 消费，瞬态覆盖
      // 不写 localStorage——同一站点常规入口打开时，设备偏好原样生效
      if (new URLSearchParams(window.location.search).get('bare') === '1') {
        const q = new URLSearchParams(window.location.search)
        if (q.get('mseTheme') === 'light' || q.get('mseTheme') === 'dark') this.mode = q.get('mseTheme')
        const hostPrimary = q.get('msePrimary')
        if (hostPrimary && parseHex(hostPrimary)) this.primary = hostPrimary
      }
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      systemDark.value = mql.matches
      mql.addEventListener('change', (e) => {
        systemDark.value = e.matches
        this.apply()
      })
      this.apply()
    },
    /** 宿主瞬态覆盖（bare 内嵌页跟随容器主题）：只改外观不写 localStorage；
     *  snapshot 随状态变化，wujie props/theme:change 链路自动联动到内嵌的子应用 */
    applyTransient(theme?: string | null, primary?: string | null) {
      if (theme === 'light' || theme === 'dark') this.mode = theme
      if (primary && parseHex(primary)) this.primary = primary
      this.apply()
    },
    setMode(mode: ThemeMode) {
      this.mode = mode
      this.persist()
      this.apply()
    },
    setPrimary(color: string) {
      if (!parseHex(color)) return
      this.primary = color
      this.persist()
      this.apply()
    },
    setLayout(layout: MenuLayout) {
      this.layout = layout
      this.persist()
    },
    setShowTags(show: boolean) {
      this.showTags = show
      this.persist()
    },
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: this.mode, primary: this.primary, layout: this.layout, showTags: this.showTags }))
    },
    /** 写 html.dark + 主色变量组（内联样式优先级高于两套 css-vars，暗色衍生值随模式重算） */
    apply() {
      document.documentElement.classList.toggle('dark', this.resolvedDark)
      for (const [key, value] of Object.entries(primaryVars(this.primary, this.resolvedDark))) {
        document.documentElement.style.setProperty(key, value)
      }
    }
  }
})
