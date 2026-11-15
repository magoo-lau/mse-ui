<template>
  <div class="right-toolbar">
    <el-tooltip content="刷新" placement="top">
      <el-button circle icon="Refresh" @click="emit('refresh')" />
    </el-tooltip>
    <el-tooltip v-if="searchable" content="搜索" placement="top">
      <el-button circle :icon="showSearch ? 'Hide' : 'Search'" @click="emit('update:showSearch', !showSearch)" />
    </el-tooltip>
  </div>
</template>

<script setup lang="ts">
/** 列表右上方工具条：刷新 + 搜索区显隐 */
defineProps<{ showSearch?: boolean; searchable?: boolean }>()
const emit = defineEmits<{ refresh: []; 'update:showSearch': [boolean] }>()
</script>

<style scoped>
.right-toolbar {
  display: flex;
  gap: 8px;
}
.right-toolbar .el-button+.el-button {
  margin-left: 0;
}
</style>
