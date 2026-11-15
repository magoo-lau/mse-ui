<template>
  <template v-for="node in nodes" :key="node.menu.id">
    <el-sub-menu v-if="node.children?.length" :index="fullPath(node)">
      <template #title>
        <el-icon v-if="node.menu.icon"><component :is="node.menu.icon" /></el-icon>
        <span>{{ node.menu.name }}</span>
      </template>
      <menu-tree :nodes="node.children" :base="fullPath(node)" />
    </el-sub-menu>
    <!-- type=3 子应用页面：index 已解析为 /sub/{name}{path}，无图标时用 Box 与子应用单项保持一致 -->
    <el-menu-item v-else-if="node.menu.type === 2 || node.menu.type === 3" :index="fullPath(node)">
      <el-icon v-if="node.menu.icon || node.menu.type === 3">
        <component :is="node.menu.icon || Box" />
      </el-icon>
      <template #title>{{ node.menu.name }}</template>
    </el-menu-item>
  </template>
</template>

<script setup lang="ts">
import { Box } from '@element-plus/icons-vue'
import type { MenuNode } from '../stores/user'
import { menuFullPath } from '../micro/apps'

const props = defineProps<{ nodes: MenuNode[]; base: string }>()

/** 完整路由地址：子应用页面解析为 /sub/{name}{path}；目录/菜单绝对路径原样、相对路径基于父级拼接 */
function fullPath(node: MenuNode): string {
  return menuFullPath(node.menu, props.base)
}
</script>
