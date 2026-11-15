/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 构建侧别：tenant 租户端 / platform 平台运营端（.env.tenant / .env.platform） */
  readonly VITE_SIDE: 'tenant' | 'platform'
  /** 页面标题（index.html 与布局品牌区共用） */
  readonly VITE_APP_TITLE: string
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
