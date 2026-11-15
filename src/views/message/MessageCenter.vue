<template>
  <div class="msg-center">
    <div class="filter-bar">
      <el-select v-model="type" placeholder="消息类型" clearable style="width: 140px" @change="load(1)">
        <el-option v-for="(label, key) in TYPE_LABELS" :key="key" :label="label" :value="key" />
      </el-select>
      <el-checkbox v-model="unreadOnly" label="仅看未读" @change="load(1)" />
      <div class="filter-right">
        <el-button size="small" :disabled="!totalUnread" @click="onReadAll">全部已读</el-button>
      </div>
    </div>

    <div v-loading="loading" class="msg-rows">
      <div v-for="msg in rows" :key="msg.id" class="msg-row" :class="{ unread: !msg.readFlag }"
           @click="openMessage(msg)">
        <el-tag size="small" :type="typeTag(msg.type)" class="mr8">{{ typeLabel(msg.type) }}</el-tag>
        <span class="msg-content">{{ msg.content }}</span>
        <span class="msg-title">{{ msg.title }}</span>
        <span class="msg-time">{{ fmt(msg.createTime) }}</span>
        <el-tag v-if="!msg.readFlag" size="small" type="danger" effect="plain">未读</el-tag>
      </div>
      <el-empty v-if="!loading && !rows.length" description="暂无消息" />
    </div>

    <pagination v-model:page="pageNum" v-model:size="pageSize" :total="total" @change="load()" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { markAllRead, markRead, pageMessages, unreadCount, type SysMessage } from '../../api/message'
import { Pagination } from 'mse-ui-shared/pc'

defineOptions({ name: 'MessageCenter' })

const TYPE_LABELS: Record<string, string> = {
  TODO: '待办', CC: '抄送', RESULT: '结果', REMIND: '催办'
}

const rows = ref<SysMessage[]>([])
const total = ref(0)
const totalUnread = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const type = ref('')
const unreadOnly = ref(false)
const loading = ref(false)

function typeLabel(value: string) {
  return TYPE_LABELS[value] || '通知'
}
function typeTag(value: string) {
  return { TODO: 'warning', CC: 'success', RESULT: 'primary', REMIND: 'danger' }[value] || 'info'
}

function fmt(time: string) {
  return (time || '').replace('T', ' ').slice(0, 16)
}

async function load(page = 1) {
  if (page) pageNum.value = page
  loading.value = true
  try {
    const data: any = await pageMessages({
      pageNum: pageNum.value, pageSize: pageSize.value,
      type: type.value || undefined, unreadOnly: unreadOnly.value || undefined
    })
    rows.value = data.records
    total.value = Number(data.total ?? 0)
    totalUnread.value = Number(await unreadCount())
  } finally {
    loading.value = false
  }
}

async function openMessage(msg: SysMessage) {
  if (!msg.readFlag) {
    await markRead(msg.id)
    msg.readFlag = 1
    totalUnread.value = Math.max(0, totalUnread.value - 1)
  }
}

async function onReadAll() {
  await markAllRead()
  rows.value = rows.value.map((m) => ({ ...m, readFlag: 1 }))
  totalUnread.value = 0
}

onMounted(() => load())
</script>

<style scoped>
.msg-center {
  background: var(--el-bg-color);
  border-radius: 6px;
  padding: 12px;
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.filter-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.msg-rows {
  min-height: 200px;
}
.msg-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}
.msg-row:hover {
  background: var(--el-fill-color-light);
}
.msg-row.unread .msg-content {
  font-weight: 600;
}
.msg-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.msg-title {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  flex-shrink: 0;
}
.msg-time {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  flex-shrink: 0;
}
.mr8 {
  margin-right: 0;
  flex-shrink: 0;
}
</style>
