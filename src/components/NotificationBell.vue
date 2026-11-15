<template>
  <el-popover placement="bottom-end" :width="360" trigger="click" @show="loadRecent">
    <template #reference>
      <span class="bell-entry" @click.stop>
        <el-badge :value="unread" :hidden="!unread" :max="99">
          <el-icon :size="17"><Bell /></el-icon>
        </el-badge>
      </span>
    </template>
    <div class="msg-head">
      <span>消息中心</span>
      <el-button size="small" link type="primary" :disabled="!unread" @click="onReadAll">全部已读</el-button>
    </div>
    <div class="msg-list">
      <div v-for="msg in recent" :key="msg.id" class="msg-item" :class="{ unread: !msg.readFlag }"
           @click="openMessage(msg)">
        <el-tag size="small" :type="typeTag(msg.type)" class="msg-type">{{ typeLabel(msg.type) }}</el-tag>
        <div class="msg-body">
          <div class="msg-content">{{ msg.content }}</div>
          <div class="msg-time">{{ fmt(msg.createTime) }}</div>
        </div>
      </div>
      <el-empty v-if="!recent.length" description="暂无消息" :image-size="50" />
    </div>
    <div class="msg-foot">
      <el-button size="small" link type="primary" @click="router.push('/message')">查看全部</el-button>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell } from '@element-plus/icons-vue'
import { markAllRead, markRead, pageMessages, unreadCount, type SysMessage } from '../api/message'

defineOptions({ name: 'NotificationBell' })

const router = useRouter()
const unread = ref(0)
const recent = ref<SysMessage[]>([])
let timer: number | undefined

const TYPE_LABELS: Record<string, string> = {
  TODO: '待办', CC: '抄送', RESULT: '结果', REMIND: '催办'
}
const TYPE_TAGS: Record<string, string> = {
  TODO: 'warning', CC: 'success', RESULT: 'primary', REMIND: 'danger'
}
function typeLabel(type: string) {
  return TYPE_LABELS[type] || '通知'
}
function typeTag(type: string) {
  return TYPE_TAGS[type] || 'info'
}

function fmt(time: string) {
  return (time || '').replace('T', ' ').slice(0, 16)
}

async function refresh() {
  try {
    unread.value = Number(await unreadCount())
  } catch {
    /* 未登录等场景静默 */
  }
}

async function loadRecent() {
  const data: any = await pageMessages({ pageNum: 1, pageSize: 10 })
  recent.value = data.records
  refresh()
}

async function openMessage(msg: SysMessage) {
  if (!msg.readFlag) {
    await markRead(msg.id)
    msg.readFlag = 1
    unread.value = Math.max(0, unread.value - 1)
  }
  router.push('/message')
}

async function onReadAll() {
  await markAllRead()
  recent.value = recent.value.map((m) => ({ ...m, readFlag: 1 }))
  unread.value = 0
}

onMounted(() => {
  refresh()
  // 轻量轮询刷新未读红点（消息由各业务服务异步投递，无推送通道）
  timer = window.setInterval(refresh, 60_000)
})
onBeforeUnmount(() => window.clearInterval(timer))

/** 供外部（如审批动作后）主动刷新红点 */
defineExpose({ refresh })
</script>

<style scoped>
.bell-entry {
  display: inline-flex;
  padding: 4px;
  cursor: pointer;
  color: var(--el-text-color-regular);
  outline: none;
}
.msg-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
}
.msg-list {
  max-height: 320px;
  overflow: auto;
}
.msg-item {
  display: flex;
  gap: 8px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  border-radius: 4px;
}
.msg-item:hover {
  background: var(--el-fill-color-light);
}
.msg-item.unread .msg-content {
  font-weight: 600;
}
.msg-type {
  flex-shrink: 0;
}
.msg-body {
  min-width: 0;
}
.msg-content {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.msg-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.msg-foot {
  text-align: center;
  margin-top: 6px;
}
</style>
