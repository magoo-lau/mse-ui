<template>
  <!-- 顶部横向菜单（top / mix 布局顶栏顶层数据源）。
       EP 水平菜单的 ellipsis 溢出收纳按「插槽 vnode 数组」切片、按「ul DOM 子节点」测量宽度，
       两者必须一一对应——首层节点必须平铺在本组件插槽里（若经子组件包裹则是 1 个 vnode 对 N 个 li，
       切片错位导致收纳错乱/永不生效）；下拉内的子层级不受影响，仍走 MenuTree 递归。
       top 布局：目录为下拉子菜单（ellipsis 溢出项自动收进「⋯」），router 直连导航；
       mix 布局（flat）：一级拍平为单项——目录不再下拉（与左侧子级栏重复），点击经 select 上抛，
       由宿主切换子级栏或导航，el-menu 关闭 router 防止目录项导航到无路由的目录路径 -->
  <el-menu :default-active="active" :router="!flat" mode="horizontal" :collapse="false" :ellipsis="ellipsisOn" class="horizontal-menu">
    <el-menu-item index="/home" @click="onItemClick('/home')">
      <el-icon><HomeFilled /></el-icon>
      <template #title>首页</template>
    </el-menu-item>
    <template v-for="node in nodes" :key="node.menu.id">
      <el-menu-item v-if="flat" :index="fullPath(node)" @click="onItemClick(node)">
        <el-icon v-if="node.menu.icon"><component :is="node.menu.icon" /></el-icon>
        <template #title>{{ node.menu.name }}</template>
      </el-menu-item>
      <template v-else>
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
    <template v-if="microApps.length">
      <el-menu-item
        v-for="microApp in microApps"
        :key="microApp.name"
        :index="`/sub/${microApp.name}`"
        @click="onItemClick(`/sub/${microApp.name}`)"
      >
        <el-icon><Box /></el-icon>
        <template #title>{{ microApp.title }}</template>
      </el-menu-item>
    </template>
  </el-menu>
</template>

<script setup lang="ts">
import { Box, HomeFilled } from '@element-plus/icons-vue'
import { nextTick, ref, watch } from 'vue'
import type { MenuNode } from '../stores/user'
import { menuFullPath } from '../micro/apps'
import MenuTree from './MenuTree.vue'

const props = defineProps<{
  /** 动态菜单树（top 传全树 / mix 传全树，flat 模式只取一级渲染） */
  nodes: MenuNode[]
  /** 未登记页面菜单的子应用兜底单项（Layout 已按端与页面菜单登记过滤） */
  microApps: { name: string; title: string }[]
  /** 当前激活菜单（宿主计算，mix 模式含一级选中态归并） */
  active: string
  /** mix 布局：一级拍平为单项，目录不弹下拉，点击经 select 上抛由宿主导航/切换子级栏 */
  flat?: boolean
}>()

const emit = defineEmits<{ (e: 'select', payload: { path: string; node?: MenuNode }): void }>()

// EP 水平菜单收纳的确定性重建：ellipsis 短暂翻转（false→true）强制 EP 销毁并重建其
// ResizeObserver 与切片状态——其内部 ul ref 初始挂载存在绑定竞态（可能为 null 直至后续
// 补丁才补绑），切片重算撞上 null 窗口即永久失灵；翻转时 ref 已随补丁重新绑定，重建的
// RO 以初始回调立即按真实宽度重算，菜单数据异步到达时收纳一次到位，不依赖时序运气
const ellipsisOn = ref(true)
watch([() => props.nodes, () => props.microApps], () => {
  nextTick(() => {
    ellipsisOn.value = false
    nextTick(() => { ellipsisOn.value = true })
  })
}, { deep: true })

/** 一级节点完整路由地址（flat 模式只渲染一级，base 恒为空） */
function fullPath(node: MenuNode): string {
  return menuFullPath(node.menu, '')
}

/** flat 模式点击上抛；非 flat 模式 el-menu router 已导航，不再重复处理 */
function onItemClick(nodeOrPath: MenuNode | string) {
  if (!props.flat) return
  if (typeof nodeOrPath === 'string') {
    emit('select', { path: nodeOrPath })
  } else {
    emit('select', { path: fullPath(nodeOrPath), node: nodeOrPath })
  }
}
</script>

<style scoped>
/* 颜色全部走 --el-menu-* 变量（由宿主按导航栏基色注入），随主题库/深浅色联动 */
.horizontal-menu {
  flex: 1;
  min-width: 0;
  /* 切片重算滞后一帧时按 ul 边界裁剪，防溢出项画到右侧操作区；
     一级下拉 popper 已 teleport 到 body，不受此裁剪影响 */
  overflow: hidden;
  border-bottom: none;
}
</style>
