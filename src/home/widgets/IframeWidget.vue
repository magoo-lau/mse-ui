<template>
  <iframe v-if="widget.url" :src="widget.url" class="iframe-body" :style="{ height: bodyHeight }" frameborder="0" />
  <el-empty v-else :image-size="48" description="未配置嵌入地址" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HomeWidget } from '../types'

const props = defineProps<{ widget: HomeWidget }>()
const bodyHeight = computed(() => `${props.widget.height || 260}px`)
</script>

<style scoped>
.iframe-body {
  width: 100%;
  border: none;
  border-radius: 4px;
  background: var(--el-bg-color);
  display: block;
}
</style>
