<template>
  <div class="welcome-row">
    <el-avatar :size="48" icon="UserFilled" />
    <div>
      <div class="hello">{{ greeting }}，{{ userStore.nickname || '用户' }}！欢迎回来</div>
      <div class="sub">今天的日期：{{ today }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from '../../stores/user'

defineProps<{ widget: { title: string } }>()

const userStore = useUserStore()

const hour = new Date().getHours()
const greeting = computed(() => (hour < 6 ? '凌晨好' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'))
const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
</script>

<style scoped>
.welcome-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 4px 0;
}
.hello {
  font-size: 18px;
  font-weight: bold;
}
.sub {
  color: #909399;
  font-size: 13px;
  margin-top: 4px;
}
</style>
