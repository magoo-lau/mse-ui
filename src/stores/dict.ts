import { defineStore } from 'pinia'
import request from '../api/request'

export interface DictData {
  id: number
  dictType: string
  dictLabel: string
  dictValue: string
  dictSort: number
  listClass: string | null
  isDefault: number
  status: number
}

/** 字典 store：按类型内存缓存（登录会话内有效，管理页变更后刷新浏览器或调 clearDict） */
export const useDictStore = defineStore('dict', {
  state: () => ({
    cache: new Map<string, DictData[]>(),
    loading: new Map<string, Promise<DictData[]>>()
  }),
  actions: {
    /** 取字典数据（带缓存；失败返回空数组不缓存） */
    async getDict(dictType: string): Promise<DictData[]> {
      const cached = this.cache.get(dictType)
      if (cached) return cached
      const pending = this.loading.get(dictType)
      if (pending) return pending
      const task = request.get(`/system/dict/data/type/${dictType}`)
        .then((list: DictData[]) => {
          this.cache.set(dictType, list || [])
          this.loading.delete(dictType)
          return list || []
        })
        .catch(() => {
          this.loading.delete(dictType)
          return []
        })
      this.loading.set(dictType, task)
      return task
    },
    /** 按值取标签文本（未加载到时回退原值） */
    async label(dictType: string, value: string | number): Promise<string> {
      const list = await this.getDict(dictType)
      const hit = list.find((item) => item.dictValue === String(value))
      return hit?.dictLabel ?? String(value)
    },
    clearDict(dictType?: string) {
      if (dictType) {
        this.cache.delete(dictType)
      } else {
        this.cache.clear()
      }
    }
  }
})
