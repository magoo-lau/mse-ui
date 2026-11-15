import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import request from '../api/request'
import type { HomeWidget } from './types'

export interface WidgetDataState<T = unknown> {
  loading: Ref<boolean>
  error: Ref<boolean>
  data: Ref<T | null>
  reload: () => Promise<void>
}

/**
 * 数据卡（list/stat）取数：挂载即拉取 + refreshSeconds 轮询 + 手动刷新。
 * 接口失败静默（卡片内展示错误态，不弹全局提示）。
 */
export function useWidgetData(widget: Ref<HomeWidget | undefined>): WidgetDataState {
  const loading = ref(false)
  const error = ref(false)
  const data = ref<unknown>(null)
  let timer: number | undefined
  let seq = 0

  async function reload() {
    const conf = widget.value
    if (!conf?.api) {
      error.value = true
      return
    }
    const current = ++seq
    loading.value = true
    try {
      const method = conf.method === 'post' ? 'post' : 'get'
      const resp = method === 'post'
        ? await request.post(conf.api, conf.params || {}, { skipErrorToast: true })
        : await request.get(conf.api, { params: conf.params, skipErrorToast: true })
      if (current === seq) {
        data.value = resp
        error.value = false
      }
    } catch {
      if (current === seq) error.value = true
    } finally {
      if (current === seq) loading.value = false
    }
  }

  function setupPolling() {
    stopPolling()
    const seconds = widget.value?.refreshSeconds || 0
    if (seconds > 0) timer = window.setInterval(reload, seconds * 1000)
  }

  function stopPolling() {
    if (timer) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  onMounted(() => {
    reload()
    setupPolling()
  })
  onBeforeUnmount(stopPolling)

  return { loading, error, data, reload }
}

/** 归一化列表数据：PageResult({records}) / 数组 / {list} 均返回行数组 */
export function toRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  const obj = data as Record<string, unknown> | null
  if (obj && Array.isArray(obj.records)) return obj.records as Record<string, unknown>[]
  if (obj && Array.isArray(obj.list)) return obj.list as Record<string, unknown>[]
  return []
}

/** 时间字段显示：yyyy-MM-ddThh:mm(:ss) / 时间戳 → 紧凑格式 */
export function formatTime(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? String(value) : pad(d)
  }
  const text = String(value)
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(text)
  return m ? `${m[2]}-${m[3]} ${m[4]}:${m[5]}` : text
}

function pad(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
