/**
 * 门户首页类型与解析约定（前后端共用结构，后端仅做结构兜底校验）。
 *
 * 模板 sys_home_template.layout_json = HomeTemplateData；
 * 用户个性化 sys_home_user_setting.layout_json = UserSettingData。
 * 卡片渲染器见 widgets/index.ts；业务自定义渲染走 micro 子应用嵌入卡。
 */
export type WidgetType = 'welcome' | 'links' | 'list' | 'stat' | 'iframe' | 'micro' | 'search'

/** links 卡快捷入口项（与旧版 Home.vue 快捷宫格同构） */
export interface LinkEntry {
  title: string
  path: string
  icon?: string
  color?: string
  /** 可见权限码（空=登录可见）——旧字段保留兼容，优先用 roles 按角色控制 */
  perm?: string
  /** 可见角色编码（多选，空=不限；用户持有任一角色即可见） */
  roles?: string[]
  /** 点击后以弹窗内嵌打开（本系统页面或第三方 URL 均可） */
  popup?: boolean
}

/** stat 卡指标项 */
export interface StatMetric {
  /** 接口返回对象上的数字字段名 */
  field: string
  label: string
  suffix?: string
}

/** 卡片配置（type 决定哪些字段生效） */
export interface HomeWidget {
  id: string
  type: WidgetType
  title: string
  /** 宽度：24 栅格制（1-24），默认 24 */
  span: number
  /** false 时渲染层隐藏（设计器中置灰可见） */
  enabled?: boolean
  /** 可见权限码（空=登录可见）——旧字段保留兼容，优先用 roles 按角色控制 */
  permission?: string
  /** 可见角色编码（多选，空=登录可见；用户持有任一角色即可见） */
  roles?: string[]
  /** links 卡：入口列表 */
  entries?: LinkEntry[]
  /** list/stat 卡：数据接口（走同源 /api 代理，如 /oa/process/todo） */
  api?: string
  method?: 'get' | 'post'
  params?: Record<string, unknown>
  /** list 卡：行字段映射 */
  fieldMap?: { title?: string; sub?: string; time?: string }
  /** list 卡：行点击跳转（基座路由或 /sub/{app} 路径；支持 {行字段} 占位，如 /sub/oa/detail/task/{taskId}） */
  link?: string
  /** stat 卡：指标列表 */
  metrics?: StatMetric[]
  /** iframe 卡：嵌入地址 */
  url?: string
  /** iframe/micro 卡：内容高度 px（默认 260） */
  height?: number
  /** micro 卡：子应用标识（注册表 name） */
  app?: string
  /** micro 卡：子应用页面路径（如 /task） */
  path?: string
  /** 数据卡自动刷新秒数（0/缺省不轮询） */
  refreshSeconds?: number
  /** search 卡：搜索框占位文案（缺省用通用提示） */
  placeholder?: string
}

/** 主题卡片配色（可选，缺省回退深浅色默认） */
export interface ThemeCardColors {
  bg?: string
  border?: string
}

/** 主题顶栏配色（导航栏/标签栏半透明底，可透出背景） */
export interface ThemeNavbarColors {
  bg?: string
  border?: string
}

/** 主题侧边栏配色（缺省保持默认深色侧边栏） */
export interface ThemeSidebarColors {
  bg?: string
  logoBg?: string
  text?: string
  activeText?: string
  hoverBg?: string
}

/** 首页主题（多维配色：背景必填，卡片/顶栏/侧边栏可选——未配置的维度回退深浅色默认） */
export interface HomeTheme {
  id: string
  name: string
  bg: { type: 'color' | 'gradient' | 'image'; value: string; /** image 时的遮罩色 */ mask?: string }
  card?: ThemeCardColors
  navbar?: ThemeNavbarColors
  sidebar?: ThemeSidebarColors
}

/** 管理员维护的模板内容（layout=默认布局；catalog=用户可挑选的块目录；themes=可选主题库） */
export interface HomeTemplateData {
  layout: HomeWidget[]
  catalog?: HomeWidget[]
  themes?: HomeTheme[]
  /** 亮色模式默认主题（用户未个性化时的初始主题） */
  defaultThemeId?: string
  /** 深色模式默认主题（用户未单独选择深色主题时生效；空=自动：亮色槽位主题深色调则沿用，否则内置深蓝） */
  defaultDarkThemeId?: string
  /** 顶栏全局搜索开关（缺省视为开启；false 时 Layout 不渲染 GlobalSearch） */
  globalSearch?: boolean
}

/** 用户个性化内容 */
export interface UserSettingData {
  layout: HomeWidget[]
  /** 亮色模式主题（空=跟随内置/模板默认） */
  themeId?: string
  /** 深色模式主题（空=自动：亮色槽位主题为深色调则沿用，否则回退内置深色） */
  darkThemeId?: string
  /** 用户主动移除的模板卡片 id：合并布局时不自动补回（与「管理员新增卡片自动下发」区分开） */
  removedIds?: string[]
  /**
   * 用户级卡片参数覆盖：widgetId → 部分字段（仅数据展示类：title/api/method/params/fieldMap/link/
   * metrics/refreshSeconds/placeholder）。合并规则：管理员模板内容 → 用户覆盖（仅这几个字段），
   * 其余内容（类型/宽度/启停/可见性）仍以管理员与用户摆放为准。
   */
  overrides?: Record<string, Partial<HomeWidget>>
}

/** GET /system/home/portal 返回（行实体的 layoutJson 为 JSON 字符串） */
export interface PortalVO {
  template: { name?: string; layoutJson: string | null } | null
  userSetting: { layoutJson: string | null } | null
}

/** 解析模板 JSON；非法/为空返回 null（调用方回退内置默认） */
export function parseTemplate(raw: string | null | undefined): HomeTemplateData | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as HomeTemplateData
    if (!Array.isArray(data.layout)) return null
    return data
  } catch {
    return null
  }
}

export function parseUserSetting(raw: string | null | undefined): UserSettingData | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as UserSettingData
    if (!Array.isArray(data.layout)) return null
    return data
  } catch {
    return null
  }
}

/** 主题 → 首页容器背景样式（image 类型需配合遮罩层 themeMask） */
export function themeStyle(theme?: HomeTheme): Record<string, string> {
  if (!theme) return {}
  if (theme.bg.type === 'image') return { backgroundImage: `url(${theme.bg.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  if (theme.bg.type === 'gradient') return { backgroundImage: theme.bg.value }
  return { background: theme.bg.value }
}

export function themeMask(theme?: HomeTheme): string {
  return theme?.bg.type === 'image' && theme.bg.mask ? theme.bg.mask : ''
}

/** 判断主题背景是否为深色调（color/gradient 取首个颜色算感知亮度，<0.4 为深；image 无法判定按浅色处理） */
export function isDarkBg(theme?: HomeTheme): boolean {
  const value = theme?.bg.type === 'image' ? '' : theme?.bg.value || ''
  const hex = value.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/)
  const rgb = value.match(/rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/)
  let r = 0
  let g = 0
  let b = 0
  if (hex) {
    const raw = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    r = parseInt(raw.slice(0, 2), 16)
    g = parseInt(raw.slice(2, 4), 16)
    b = parseInt(raw.slice(4, 6), 16)
  } else if (rgb) {
    r = Number(rgb[1])
    g = Number(rgb[2])
    b = Number(rgb[3])
  } else {
    return false
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.4
}

/** 主题多维配色 → CSS 变量映射（仅输出已配置的维度，未配置的走 theme.css 深浅色默认） */
export function themeVars(theme?: HomeTheme): Record<string, string> {
  const vars: Record<string, string> = {}
  if (!theme) return vars
  const set = (key: string, value?: string) => {
    if (value) vars[key] = value
  }
  set('--mse-card-bg', theme.card?.bg)
  set('--mse-card-border', theme.card?.border)
  set('--mse-navbar-bg', theme.navbar?.bg)
  set('--mse-navbar-border', theme.navbar?.border)
  set('--mse-sidebar-bg', theme.sidebar?.bg)
  set('--mse-sidebar-logo-bg', theme.sidebar?.logoBg)
  set('--mse-sidebar-text', theme.sidebar?.text)
  set('--mse-sidebar-active-text', theme.sidebar?.activeText)
  set('--mse-sidebar-hover-bg', theme.sidebar?.hoverBg)
  return vars
}

/** search 卡默认取数配置：与顶栏全局搜索同接口（搜索引擎服务 /search/api/query），设计器预填与渲染回退共用 */
export const SEARCH_CARD_DEFAULT = {
  api: '/search/api/query',
  method: 'post' as const,
  params: { pageNum: 1, pageSize: 10 }
}

/** 生成卡片 id（类型前缀 + 随机段，保证同类型多实例唯一） */
export function genWidgetId(type: WidgetType): string {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 新建指定类型卡片的默认配置（设计器/添加卡片共用） */
export function createWidget(type: WidgetType, partial?: Partial<HomeWidget>): HomeWidget {
  return {
    id: genWidgetId(type),
    type,
    title: '',
    span: 24,
    enabled: true,
    ...partial
  }
}
