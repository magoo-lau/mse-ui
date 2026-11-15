import type { Component } from 'vue'
import type { WidgetType } from '../types'
import WelcomeWidget from './WelcomeWidget.vue'
import LinksWidget from './LinksWidget.vue'
import ListWidget from './ListWidget.vue'
import StatWidget from './StatWidget.vue'
import IframeWidget from './IframeWidget.vue'
import MicroWidget from './MicroWidget.vue'
import SearchWidget from './SearchWidget.vue'

export interface WidgetMeta {
  /** 组件库/设计器展示名 */
  label: string
  /** 展示图标（Element Plus 图标组件名） */
  icon: string
  /** 一句话说明 */
  desc: string
  /** 渲染组件 */
  component: Component
  /** 是否数据卡（有接口取数行为） */
  hasData: boolean
}

/** 卡片类型注册表：类型 → 渲染器与组件库元信息（新增卡片类型在此登记） */
export const widgetRegistry: Record<WidgetType, WidgetMeta> = {
  welcome: { label: '欢迎卡', icon: 'Sunny', desc: '问候与登录者信息', component: WelcomeWidget, hasData: false },
  links: { label: '快捷入口', icon: 'Menu', desc: '可配置入口宫格', component: LinksWidget, hasData: false },
  list: { label: '数据列表', icon: 'Tickets', desc: '接任意列表接口，如 OA 待办', component: ListWidget, hasData: true },
  stat: { label: '统计数字', icon: 'DataAnalysis', desc: '接汇总接口展示数字指标', component: StatWidget, hasData: true },
  iframe: { label: '网页嵌入', icon: 'Link', desc: '嵌入任意 URL 页面', component: IframeWidget, hasData: false },
  micro: { label: '子应用页面', icon: 'Grid', desc: 'wujie 嵌入子应用页面（复杂自定义渲染兜底）', component: MicroWidget, hasData: false },
  search: { label: '全局搜索', icon: 'Search', desc: '搜索引擎服务全文检索，结果可跳转业务页面', component: SearchWidget, hasData: true }
}

export function isWidgetType(type: string): type is WidgetType {
  return type in widgetRegistry
}
