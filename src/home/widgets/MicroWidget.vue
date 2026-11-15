<template>
  <div class="micro-body" :style="{ height: bodyHeight }">
    <WujieVue
      v-if="app"
      :name="instanceName"
      width="100%"
      height="100%"
      :url="entryUrl"
      :sync="false"
      :alive="true"
      :props="wujieProps"
    />
    <el-empty v-else :image-size="48" :description="`未找到子应用 ${widget.app || ''}`" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import WujieVue from 'wujie-vue3'
import type { HomeWidget } from '../types'
import { getEntry } from '../../micro/apps'
import { useMicroStore } from '../../stores/micro'
import { useUserStore } from '../../stores/user'

const props = defineProps<{ widget: HomeWidget }>()

const microStore = useMicroStore()
const userStore = useUserStore()
const { bus } = WujieVue

const app = computed(() => microStore.apps.find((item) => item.name === props.widget.app))
const entryUrl = computed(() => {
  if (!app.value) return ''
  const base = getEntry(app.value)
  // 指定了页面路径时直接落地（dev 走 Vite SPA 回退，生产要求 nginx 对子应用路径做 index.html 回退）
  return props.widget.path && props.widget.path !== '/' ? `${base}${props.widget.path}` : base
})
// 实例名加卡片 id 后缀：首页嵌入与 /sub/{app} 全页是两个 wujie 实例，互不冲突
const instanceName = computed(() => `home-${app.value?.name}-${props.widget.id}`)

const wujieProps = computed(() => ({
  urlPrefix: `/sub/${app.value?.name}`,
  token: userStore.token,
  tenantId: userStore.tenantId,
  platform: userStore.platform,
  nickname: userStore.nickname,
  permissions: userStore.permissions
}))

const bodyHeight = computed(() => `${props.widget.height || 260}px`)

// 子应用就绪后补发目标路由（alive/直达场景 sub:ready 早于本监听的时序问题与主容器同源同解）
function onSubReady(msg: { urlPrefix: string }) {
  if (!app.value || msg.urlPrefix !== `/sub/${app.value.name}`) return
  if (!props.widget.path || props.widget.path === '/') return
  bus.$emit('sub:navigate', { urlPrefix: `/sub/${app.value.name}`, path: props.widget.path })
}

onMounted(() => bus.$on('sub:ready', onSubReady))
onBeforeUnmount(() => bus.$off('sub:ready', onSubReady))
</script>

<style scoped>
.micro-body {
  overflow: hidden;
  border-radius: 4px;
}
</style>
