/**
 * 微前端子应用「内置兜底注册表」（仅应用地址类配置）
 *
 * 子应用接入配置（正式通道，二选一）：
 * 1. 业务工程 sql/<biz>_base.sql 幂等落库（对基座库执行：sys_micro_app 注册 + sys_menu type=3 页面菜单 + 权限点）；
 * 2. 平台端「平台管理 → 子应用管理」登记应用地址 + 「菜单管理」登记类型=子应用页面的页面菜单；
 * 两者都未配置时，登录后回退到本文件的 builtinMicroApps（零配置起步，各子应用渲染为单个菜单项）。
 *
 * 接入步骤（走兜底表时，仅限本地开发）：
 * 1. 子应用按 mse-ui-sub 模板创建（复制改造）
 * 2. 在下方数组中追加一条配置，路由前缀为 /sub/{name}
 * 3. 需要页面级菜单时在基座「菜单管理」登记类型=子应用页面的菜单项
 */
export type MicroAppSide = 'tenant' | 'platform' | 'both'

/** 客户端：1 PC 2 移动端（PC 基座只消费 client=1；移动端入口在移动基站 mse-ui-mobile） */
export const CLIENT_PC = 1
export const CLIENT_MOBILE = 2

export interface MicroAppConfig {
  /** 子应用唯一标识，决定主应用路由前缀：/sub/{name} */
  name: string
  /** 显示名（未配置页面菜单时作为侧边栏单项标题） */
  title: string
  /** 开发环境入口（子应用 dev server 地址） */
  devEntry: string
  /** 生产环境入口（子应用静态资源部署路径） */
  prodEntry: string
  /** 菜单可见端：tenant 租户端 / platform 平台端 / both 双端 */
  side: MicroAppSide
  /** 客户端 1 PC 2 移动端（缺省 PC；PC 基座防御性过滤移动端应用） */
  client?: number
  /** 是否登记过页面菜单（type=3）：登记过的应用入口收敛在菜单树，侧边栏不再兜底渲染单项 */
  hasMenus?: boolean
}

export const builtinMicroApps: MicroAppConfig[] = [
  {
    // 演示中心：独立工程 mse-demo（demo-ui 子应用 + demo-boot 后端），业务工程接入的参考实现
    name: 'demo',
    title: '演示中心',
    devEntry: '//localhost:3300',
    prodEntry: '/sub-apps/demo/',
    side: 'tenant'
  },
  {
    // 协同办公：独立工程 mse-modules/mse-oa（oa-ui 子应用 + oa-boot 后端），自定义表单 + Flowable 工作流
    name: 'oa',
    title: '协同办公',
    devEntry: '//localhost:3400',
    prodEntry: '/sub-apps/oa/',
    side: 'tenant'
  },
  {
    // 微信公众号管理：独立工程 mse-modules/mse-mp（mp-ui 子应用 + mp-boot 后端）
    // 多公众号接入 + 回调处理 + 粉丝/消息/菜单/自动回复
    name: 'mp',
    title: '微信公众号',
    devEntry: '//localhost:3500',
    prodEntry: '/sub-apps/mp/',
    side: 'tenant'
  },
  {
    // 开放能力：独立工程 mse-modules/mse-open（open-ui 子应用 + open-boot 后端）
    // 应用注册/凭证 + 开放 API 授权 + 调用审计，把基座用户能力开放给其他系统
    name: 'open',
    title: '开放能力',
    devEntry: '//localhost:3600',
    prodEntry: '/sub-apps/open/',
    side: 'tenant'
  },
  {
    // 数据中台：独立工程 mse-modules/mse-data（data-ui 子应用 + data-boot 后端）
    // 数据源管理 + 数据集成同步（ODS）+ 元数据/数据地图 + 数据服务 API
    name: 'data',
    title: '数据中台',
    devEntry: '//localhost:3700',
    prodEntry: '/sub-apps/data/',
    side: 'tenant'
  },
  {
    // 监控中心：独立工程 mse-modules/mse-monitor（monitor-ui 子应用 + monitor-boot 后端）
    // 服务/中间件/操作系统监控 + 阈值告警（站内信/Webhook，通知设置界面维护）
    // 双端共有：平台端看平台自身（tenant_id=0），租户端看本租户；默认套餐不勾选
    name: 'monitor',
    title: '监控中心',
    devEntry: '//localhost:4010',
    prodEntry: '/sub-apps/monitor/',
    side: 'both'
  }
]

/** 后端下发的可见端数字（1 租户端 2 平台端 3 双端）→ 前端枚举 */
export function sideOf(code: number | string): MicroAppSide {
  const value = Number(code)
  if (value === 2) return 'platform'
  if (value === 3) return 'both'
  return 'tenant'
}

export function getEntry(app: MicroAppConfig): string {
  return import.meta.env.DEV ? app.devEntry : app.prodEntry
}

export function menuVisible(app: MicroAppConfig, platform: boolean): boolean {
  if ((app.client ?? CLIENT_PC) !== CLIENT_PC) return false
  return app.side === 'both' || app.side === (platform ? 'platform' : 'tenant')
}

/**
 * 菜单树节点的完整路由地址：
 * - type=3 子应用页面：/sub/{microName}{path}（path 为子应用内部路由，:param 动态段取默认值 1）；
 * - 目录/菜单：绝对路径原样，相对路径基于父级拼接。
 * 侧边栏 index、面包屑与高亮匹配统一走本函数。
 */
export function menuFullPath(menu: { type: number; path: string; microName?: string | null }, base: string): string {
  if (menu.type === 3) {
    return microMenuItemPath(menu.microName || '', menu.path)
  }
  const path = menu.path || ''
  if (path.startsWith('/')) return path
  return base ? `${base}/${path}` : `/${path}`
}

/** 子应用页面菜单完整地址：/sub/{name}{path}（path 为 :param 的动态段取默认值 1） */
export function microMenuItemPath(name: string, path: string): string {
  const concrete = path
    .split('/')
    .map((seg) => (seg.startsWith(':') ? '1' : seg))
    .join('/')
  return `/sub/${name}${concrete}`
}

/** 当前路由是否命中某子应用页面菜单（path 的静态段需逐段相等，:param 段视为通配，允许路由更长） */
export function microMenuMatch(name: string, path: string, routePath: string): boolean {
  const menuSegs = `/sub/${name}${path}`.split('/').filter(Boolean)
  const routeSegs = routePath.split('/').filter(Boolean)
  if (menuSegs.length > routeSegs.length) return false
  return menuSegs.every((seg, i) => seg.startsWith(':') || seg === routeSegs[i])
}
