<template>
  <el-select v-model="model" filterable allow-create default-first-option clearable placeholder="图标">
    <!-- 选中后输入框内同样渲染「图标 + 名称」；手输的非内置名只显示文本 -->
    <template #label="{ label }">
      <span class="icon-option">
        <el-icon v-if="iconSet.has(label)"><component :is="label" /></el-icon>{{ label }}
      </span>
    </template>
    <el-option v-for="name in iconNames" :key="name" :value="name" :label="name">
      <span class="icon-option"><el-icon><component :is="name" /></el-icon>{{ name }}</span>
    </el-option>
  </el-select>
</template>

<script setup lang="ts">
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

/** Element Plus 图标组件名全集（与运行期按名动态渲染同体系）；下拉项左侧渲染图标预览，存储值为组件名 */
const iconNames = Object.keys(ElementPlusIconsVue)
const iconSet = new Set(iconNames)

const model = defineModel<string>({ default: '' })
</script>

<style scoped>
.icon-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
