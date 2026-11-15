import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// 暗色变量基线（html.dark 作用域）+ --mse-* 外观默认值（顺序：EP 变量在前，可被后者引用）
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/theme.css'
import './style.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import WujieVue from 'wujie-vue3'
import App from './App.vue'
import router from './router'
import { initMicro } from './micro'
import { permission } from './directives/permission'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn, size: 'small' }) // 紧凑型 UI 风格（约定见 AGENTS.md）
app.use(WujieVue)
app.directive('permission', permission)
// 全量注册图标：菜单 icon 字段（如 User/Setting）直接以组件名字符串动态渲染
for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, component)
}
initMicro()
app.mount('#app')
