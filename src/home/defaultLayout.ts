import type { HomeTemplateData, HomeTheme } from './types'
import { SEARCH_CARD_DEFAULT } from './types'

/**
 * 内置默认模板（零配置兜底，与 builtinMicroApps 同思想）：
 * 后台无任何模板配置（接口失败 / sys_home_template 无数据）时使用。
 * 快捷入口已下线（功能菜单化后首页不再重复宫格），默认布局仅保留欢迎卡。
 */

/**
 * 内置主题库（多维配色）：bg 必填，card/navbar/sidebar 可选——整页协调的深色主题需配齐
 * card（卡片底/边框）与 navbar（半透明顶栏），否则暗背景上会浮白卡片。
 * 外观模式内置背景：亮色取 t-light、深色取 t-dark（用户未单独选择主题时的兜底基线）。
 */
export const BUILTIN_LIGHT_THEME_ID = 't-light'
export const BUILTIN_DARK_THEME_ID = 't-dark'

export const builtinThemes: HomeTheme[] = [
  { id: 't-light', name: '简约浅灰', bg: { type: 'color', value: '#f5f7fa' } },
  {
    id: 't-blue',
    name: '晨曦蓝渐变',
    bg: { type: 'gradient', value: 'linear-gradient(135deg,#dceeff 0%,#f5f7fa 55%,#e3f4e9 100%)' }
  },
  {
    id: 't-dark',
    name: '静谧深蓝',
    bg: { type: 'color', value: '#1c2b3a' },
    card: { bg: '#223447', border: '#2e4257' },
    navbar: { bg: 'rgba(28, 43, 58, 0.82)', border: 'rgba(255, 255, 255, 0.08)' },
    sidebar: { bg: '#152232', logoBg: '#10202f', text: '#9fb3c8', activeText: '#ffffff' }
  },
  {
    id: 't-green',
    name: '墨绿山岚',
    bg: { type: 'gradient', value: 'linear-gradient(160deg,#122b23 0%,#1d4034 60%,#2a5245 100%)' },
    card: { bg: '#1f3a30', border: '#2d4d40' },
    navbar: { bg: 'rgba(18, 43, 35, 0.82)', border: 'rgba(255, 255, 255, 0.08)' },
    sidebar: { bg: '#0e241d', logoBg: '#0a1c16', text: '#9dc3b3', activeText: '#ffffff' }
  },
  {
    id: 't-purple',
    name: '紫霞映晚',
    bg: { type: 'gradient', value: 'linear-gradient(140deg,#f3e8ff 0%,#fdf2f8 50%,#eff6ff 100%)' },
    card: { bg: '#ffffff', border: '#e9d5ff' }
  },
  {
    id: 't-sunset',
    name: '暖阳暮色',
    bg: { type: 'gradient', value: 'linear-gradient(150deg,#2b1d16 0%,#45301f 55%,#5c4030 100%)' },
    card: { bg: '#3a2a1e', border: '#4d3827' },
    navbar: { bg: 'rgba(43, 29, 22, 0.82)', border: 'rgba(255, 255, 255, 0.08)' },
    sidebar: { bg: '#241710', logoBg: '#1b110b', text: '#d3b49a', activeText: '#ffffff' }
  }
]

/** 内置默认模板（layout + catalog 示例可选块 + 主题库） */
export function builtinTemplate(): HomeTemplateData {
  return {
    layout: [
      { id: 'w-welcome', type: 'welcome', title: '欢迎', span: 24, enabled: true }
    ],
    // 可选块示例：接入 OA / MP / 数据中台的用户可在「添加卡片」中自行挑选（permission 为旧字段，
    // 渲染层保留兼容：无该权限码自动不可见；卡片可见性新配置一律走 roles 角色，见 types.ts）
    catalog: [
      {
        id: 'c-global-search',
        type: 'search',
        title: '全局搜索',
        span: 12,
        enabled: true,
        placeholder: '搜索业务数据，回车搜索',
        api: SEARCH_CARD_DEFAULT.api,
        method: SEARCH_CARD_DEFAULT.method,
        params: { ...SEARCH_CARD_DEFAULT.params }
      },
      {
        id: 'c-oa-todo',
        type: 'list',
        title: 'OA 待办',
        span: 12,
        enabled: true,
        permission: 'oa:process:todo',
        api: '/oa/process/todo',
        method: 'get',
        params: { pageNum: 1, pageSize: 6 },
        fieldMap: { title: 'title', sub: 'modelName', time: 'startTime' },
        link: '/sub/oa/detail/task/{taskId}?businessKey={businessKey}',
        refreshSeconds: 60
      },
      {
        id: 'c-mp-stats',
        type: 'stat',
        title: '公众号概览',
        span: 12,
        enabled: true,
        permission: 'mp:stats:list',
        api: '/mp/stats/summary',
        method: 'get',
        metrics: [
          { field: 'accountTotal', label: '公众号' },
          { field: 'fanSubscribed', label: '订阅粉丝' },
          { field: 'messageToday', label: '今日消息' }
        ],
        refreshSeconds: 120
      },
      {
        id: 'c-data-overview',
        type: 'stat',
        title: '数据中台概览',
        span: 12,
        enabled: true,
        permission: 'data:overview:list',
        api: '/data/overview',
        method: 'get',
        metrics: [
          { field: 'datasourceCount', label: '数据源' },
          { field: 'odsTableCount', label: 'ODS 表' },
          { field: 'publishedApiCount', label: '已发布 API' },
          { field: 'todayApiCalls', label: '今日调用' }
        ],
        refreshSeconds: 120
      }
    ],
    themes: builtinThemes,
    defaultThemeId: BUILTIN_LIGHT_THEME_ID
  }
}
