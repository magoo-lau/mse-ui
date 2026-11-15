<template>
  <el-dialog
    :model-value="widget != null"
    title="卡片参数（仅本人生效）"
    width="560px"
    :append-to-body="true"
    @update:model-value="close"
  >
    <template v-if="draft">
      <el-alert
        type="info"
        :closable="false"
        class="mb8"
        title="在此调整的数据接口/参数/字段映射仅对本人首页生效；管理员后续调整模板时，未覆盖的字段自动跟随"
      />
      <el-form label-width="82px" size="small" @submit.prevent>
        <el-form-item label="标题">
          <el-input v-model="draft.title" maxlength="60" />
        </el-form-item>
        <el-form-item label="数据接口">
          <el-input v-model="draft.api" placeholder="/模块/接口/path（走同源 /api 代理）" />
        </el-form-item>
        <el-form-item label="请求方式">
          <el-radio-group v-model="draft.method">
            <el-radio-button value="get">GET</el-radio-button>
            <el-radio-button value="post">POST</el-radio-button>
          </el-radio-group>
          <span class="flex1" />
          <el-button size="small" :loading="previewing" @click="preview">拉取预览</el-button>
        </el-form-item>
        <el-form-item label="请求参数">
          <el-input
            v-model="paramsText"
            type="textarea"
            :rows="3"
            placeholder='JSON 对象，如 {"pageNum": 1, "pageSize": 10}'
          />
          <span v-if="paramsError" class="params-error">{{ paramsError }}</span>
        </el-form-item>
        <el-form-item label="刷新秒数">
          <el-input-number v-model="draft.refreshSeconds" :min="0" :max="86400" :step="10" :controls="false" style="width: 110px" />
          <span class="form-tip">0 = 不自动刷新</span>
        </el-form-item>

        <!-- list 卡：行字段映射与跳转 -->
        <template v-if="draft.type === 'list'">
          <el-form-item label="行标题字段">
            <el-select v-model="draft.fieldMap!.title" clearable filterable allow-create style="width: 100%" placeholder="选择或输入字段名">
              <el-option v-for="f in fieldOptions" :key="f" :label="f" :value="f" />
            </el-select>
          </el-form-item>
          <el-form-item label="副标题字段">
            <el-select v-model="draft.fieldMap!.sub" clearable filterable allow-create style="width: 100%" placeholder="可空">
              <el-option v-for="f in fieldOptions" :key="f" :label="f" :value="f" />
            </el-select>
          </el-form-item>
          <el-form-item label="时间字段">
            <el-select v-model="draft.fieldMap!.time" clearable filterable allow-create style="width: 100%" placeholder="可空">
              <el-option v-for="f in fieldOptions" :key="f" :label="f" :value="f" />
            </el-select>
          </el-form-item>
          <el-form-item label="行点击跳转">
            <el-input v-model="draft.link" placeholder="如 /sub/oa/task/{taskId}，{字段} 取行数据" />
          </el-form-item>
        </template>

        <!-- stat 卡：指标列表 -->
        <template v-if="draft.type === 'stat'">
          <el-form-item label="指标列表">
            <div class="metrics">
              <div v-for="(m, i) in draft.metrics" :key="i" class="metric-row">
                <el-select v-model="m.field" filterable allow-create style="width: 150px" placeholder="字段">
                  <el-option v-for="f in fieldOptions" :key="f" :label="f" :value="f" />
                </el-select>
                <el-input v-model="m.label" style="width: 110px" placeholder="名称" />
                <el-input v-model="m.suffix" style="width: 70px" placeholder="单位" />
                <el-button link type="danger" @click="draft.metrics!.splice(i, 1)">删除</el-button>
              </div>
              <el-button size="small" @click="draft.metrics!.push({ field: '', label: '' })">加指标</el-button>
            </div>
          </el-form-item>
        </template>

        <!-- search 卡：占位文案 -->
        <el-form-item v-if="draft.type === 'search'" label="占位文案">
          <el-input v-model="draft.placeholder" maxlength="100" placeholder="搜索框提示文案" />
        </el-form-item>

        <el-form-item v-if="previewRows.length" label="预览">
          <div class="preview">
            <div class="preview-fields">字段：{{ fieldOptions.join('、') }}</div>
            <div v-for="(row, i) in previewRows.slice(0, 3)" :key="i" class="preview-row">{{ JSON.stringify(row) }}</div>
          </div>
        </el-form-item>
      </el-form>
    </template>
    <template #footer>
      <el-button v-if="hasOverride" type="warning" plain @click="clear">清除自定义</el-button>
      <span class="flex1" />
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!!paramsError" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../api/request'
import { toRows } from './useWidgetData'
import type { HomeWidget, StatMetric } from './types'

/**
 * 用户端卡片参数设置（数据卡：list/stat/search）：仅覆盖数据展示类字段
 * （标题/接口/参数/字段映射/指标/刷新），保存时按「与管理员基线的差异」生成
 * 覆盖补丁——用户改回与基线相同的值即视为未覆盖，管理员后续改动自动跟随。
 */
const props = defineProps<{
  /** 生效中的卡片（模板内容 + 已有用户覆盖） */
  widget: HomeWidget | null
  /** 管理员基线版本（模板卡片；用户自添加卡片与 widget 相同） */
  baseline: HomeWidget | null
  /** 当前是否已有用户覆盖（决定「清除自定义」按钮显隐） */
  hasOverride?: boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:widget', widget: HomeWidget | null): void
  (e: 'save', patch: Partial<HomeWidget>): void
  (e: 'clear'): void
}>()

/** 可覆盖字段的默认值（draft 编辑副本用） */
const draft = ref<HomeWidget | null>(null)
const paramsText = ref('{}')
const paramsError = ref('')
const previewing = ref(false)
const previewRows = ref<Record<string, unknown>[]>([])
const fieldOptions = ref<string[]>([])

watch(
  () => props.widget,
  (w) => {
    if (!w) {
      draft.value = null
      return
    }
    draft.value = JSON.parse(JSON.stringify({ ...w })) as HomeWidget
    draft.value.fieldMap = { ...(w.fieldMap || {}) }
    draft.value.metrics = (w.metrics || []).map((m) => ({ ...m }))
    paramsText.value = JSON.stringify(w.params || {})
    paramsError.value = ''
    previewRows.value = []
    fieldOptions.value = currentFields(w)
  },
  { immediate: true }
)

/** 请求参数 JSON 校验（对象） */
watch(paramsText, (text) => {
  try {
    const parsed = JSON.parse(text || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object')
    paramsError.value = ''
  } catch {
    paramsError.value = '参数须为 JSON 对象'
  }
})

function currentFields(w: HomeWidget): string[] {
  const keys = new Set<string>()
  if (w.fieldMap) Object.values(w.fieldMap).forEach((v) => v && keys.add(v))
  w.metrics?.forEach((m) => m.field && keys.add(m.field))
  return [...keys]
}

async function preview() {
  if (!draft.value?.api) {
    ElMessage.warning('请先填写数据接口')
    return
  }
  let params: Record<string, unknown> = {}
  try {
    params = JSON.parse(paramsText.value || '{}')
  } catch {
    paramsError.value = '参数须为 JSON 对象'
    return
  }
  previewing.value = true
  try {
    const resp = draft.value.method === 'post'
      ? await request.post(draft.value.api, params, { skipErrorToast: true })
      : await request.get(draft.value.api, { params, skipErrorToast: true })
    previewRows.value = toRows(resp).slice(0, 5)
    const keys = new Set<string>(currentFields(draft.value))
    for (const row of previewRows.value) {
      Object.keys(row || {}).forEach((k) => keys.add(k))
    }
    if (!previewRows.value.length && resp && typeof resp === 'object') {
      Object.keys(resp as Record<string, unknown>).forEach((k) => keys.add(k))
    }
    fieldOptions.value = [...keys]
    if (!previewRows.value.length) ElMessage.info('接口无数据，已展示返回对象字段')
  } catch {
    /* request 静默标记已抑制全局提示 */
  } finally {
    previewing.value = false
  }
}

/** 按基线求差：仅保存与基线不同的字段（改回基线值 = 取消该字段覆盖） */
function save() {
  const base = props.baseline || ({} as HomeWidget)
  const next = draft.value!
  let params: Record<string, unknown> = {}
  try {
    params = JSON.parse(paramsText.value || '{}')
  } catch {
    return
  }
  const patch: Partial<HomeWidget> = {}
  const put = (key: keyof HomeWidget, value: unknown, baselineValue: unknown) => {
    if (JSON.stringify(value) !== JSON.stringify(baselineValue ?? undefined)) {
      ;(patch as Record<string, unknown>)[key] = value
    }
  }
  put('title', (next.title || '').trim(), base.title)
  put('api', (next.api || '').trim(), base.api)
  put('method', next.method === 'post' ? 'post' : 'get', base.method)
  put('params', params, base.params)
  put('refreshSeconds', next.refreshSeconds || 0, base.refreshSeconds)
  if (next.type === 'list') {
    put('fieldMap', cleanMap(next.fieldMap), base.fieldMap)
    put('link', (next.link || '').trim(), base.link)
  }
  if (next.type === 'stat') {
    put('metrics', (next.metrics || []).filter((m) => m.field), base.metrics)
  }
  if (next.type === 'search') {
    put('placeholder', (next.placeholder || '').trim(), base.placeholder)
  }
  emit('save', patch)
}

function cleanMap(map?: { title?: string; sub?: string; time?: string }) {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(map || {})) {
    if (value) result[key] = value
  }
  return result
}

function clear() {
  emit('clear')
}

function close() {
  emit('update:widget', null)
}
</script>

<style scoped>
.mb8 {
  margin-bottom: 8px;
}
.flex1 {
  flex: 1;
}
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 8px;
}
.params-error {
  font-size: 12px;
  color: var(--el-color-danger);
}
.metrics {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.metric-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.preview {
  width: 100%;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 12px;
  max-height: 140px;
  overflow: auto;
}
.preview-fields {
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
  word-break: break-all;
}
.preview-row {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.8;
}
</style>
