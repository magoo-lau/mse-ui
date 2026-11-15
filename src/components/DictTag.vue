<template>
  <template v-if="options.length">
    <el-tag v-for="item in matched" :key="item.dictValue" :type="tagType(item.listClass)" size="small">
      {{ item.dictLabel }}
    </el-tag>
    <span v-if="!matched.length" style="color: var(--el-text-color-secondary)">{{ String(value) }}</span>
  </template>
  <el-tag v-else size="small">{{ String(value) }}</el-tag>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useDictStore, type DictData } from '../stores/dict'

/** 字典标签：按 dictType + value 渲染彩色标签（数据来自字典 store 缓存） */
const props = defineProps<{ dictType: string; value: string | number | null | undefined }>()

const dictStore = useDictStore()
const options = ref<DictData[]>([])

async function load() {
  options.value = await dictStore.getDict(props.dictType)
}

const matched = computed(() =>
  options.value.filter((item) => item.dictValue === String(props.value)))

/** 后端 listClass 值对齐 el-tag 的 type；default/未知归到 info 视觉 */
function tagType(listClass: string | null) {
  const allowed = ['primary', 'success', 'info', 'warning', 'danger']
  return allowed.includes(listClass || '') ? (listClass as any) : 'info'
}

onMounted(load)
watch(() => props.dictType, load)
</script>
