<template>
  <div ref="rootRef" class="global-search" :class="{ expanded }" @keydown.esc="collapse">
    <div class="search-clip">
      <span v-if="!expanded" class="search-entry" title="全局搜索" @click.stop="expand">
        <el-icon :size="17"><Search /></el-icon>
      </span>
      <div v-else class="search-inner">
        <el-input
          ref="inputRef"
          v-model="keyword"
          placeholder="搜索业务数据，回车搜索"
          clearable
          @keyup.enter="doSearch"
        >
          <template #prepend>
            <el-select v-model="activeDomain" class="domain-select" :empty-values="[undefined, null]" @change="onDomainChange">
              <el-option label="全部域" value="" />
              <el-option v-for="d in domains" :key="d" :label="d" :value="d" />
            </el-select>
          </template>
          <template #suffix>
            <el-icon class="search-btn" @click="doSearch"><Search /></el-icon>
          </template>
        </el-input>
      </div>
    </div>
    <el-popover
      :visible="panelVisible"
      trigger="manual"
      placement="bottom-end"
      :width="420"
      popper-class="global-search-popover"
      :virtual-ref="rootRef"
      virtual-triggering
    >
      <div v-loading="loading" class="result-list">
        <div
          v-for="item in records"
          :key="item.id"
          class="result-item"
          :class="{ clickable: !!item.jumpUrl }"
          @click="go(item)"
        >
          <div class="item-title" v-html="sanitizeSearchHighlight(item.title)" />
          <div class="item-sub">
            <el-tag size="small" type="info">{{ item.sourceName }}</el-tag>
            <span class="item-content" v-html="sanitizeSearchHighlight(item.content)" />
          </div>
        </div>
        <el-empty
          v-if="searched && !loading && !records.length"
          :image-size="50"
          :description="error ? '搜索服务不可达' : '无匹配结果'"
        />
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { sanitizeSearchHighlight } from 'mse-ui-shared'
import request from '../api/request'

interface SearchItem {
  id: string
  sourceCode: string
  sourceName: string
  bizId: string
  title: string
  content: string
  jumpUrl: string | null
}

/**
 * 顶栏全局搜索：默认只显示一个放大镜，点击带宽度过渡动画展开为「域下拉 + 关键词输入框」
 * 一体的组合框（el-input prepend 槽拼接，共享边框），点外部 / Esc 收回放大镜；再点放大镜收起。
 * 调搜索引擎服务 /search/api/query（三层权限过滤服务端强制注入），结果点击跳转子应用页面；
 * 可见开关由首页模板 globalSearch 字段控制（Layout 挂载处判定）。
 * 结果弹出层手动控制：回车/点搜索发出请求，等结果返回后才展开（加载中不弹空层）。
 * 业务域过滤：/search/api/domains 拉已注册源的去重域（首次展开懒加载，失败静默只留「全部域」），
 * 默认「全部域」不过滤，选中域随 query 提交 domain 参数，切域后自动重搜。
 */
const router = useRouter()
const rootRef = ref<HTMLElement>()
const inputRef = ref()
const expanded = ref(false)
const keyword = ref('')
const searched = ref(false)
const loading = ref(false)
const error = ref(false)
const records = ref<SearchItem[]>([])
const domains = ref<string[]>([])
const activeDomain = ref('')
const panelVisible = ref(false)
let domainsTried = false

function expand() {
  expanded.value = true
  loadDomains()
  nextTick(() => inputRef.value?.focus())
}

function collapse() {
  expanded.value = false
  panelVisible.value = false
}

async function loadDomains() {
  if (domainsTried) return
  domainsTried = true
  try {
    const list = await request.get('/search/api/domains') as any
    domains.value = Array.isArray(list) ? list : []
  } catch {
    domains.value = []
  }
}

function onDomainChange() {
  if (searched.value && !error.value && keyword.value.trim()) doSearch()
}

async function doSearch() {
  const kw = keyword.value.trim()
  if (!kw) return
  loading.value = true
  error.value = false
  try {
    const data = await request.post('/search/api/query', {
      keyword: kw,
      domain: activeDomain.value || undefined,
      pageNum: 1,
      pageSize: 8
    }) as any
    records.value = data.records || []
    searched.value = true
  } catch {
    error.value = true
    searched.value = true
  } finally {
    loading.value = false
    panelVisible.value = true
  }
}

function onDocClick(e: MouseEvent) {
  if (!expanded.value && !panelVisible.value) return
  // 用派发时固化的传播路径判定归属：trusted 事件里 target.closest 偶发误判，路径不会
  const path = e.composedPath()
  const inside = path.some((n) => {
    const cls = (n as HTMLElement).classList
    return !!cls && (cls.contains('global-search') || cls.contains('global-search-popover'))
  })
  if (inside) return
  collapse()
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

function go(item: SearchItem) {
  if (item.jumpUrl) {
    collapse()
    router.push(item.jumpUrl)
  }
}
</script>

<style scoped>
.search-entry {
  display: inline-flex;
  padding: 4px;
  cursor: pointer;
  color: var(--el-text-color-regular);
  outline: none;
}
/* 展开/收起只动宽度：右缘固定（右边是铃铛等常驻项），左缘向左扫出；
 * 图标与组合框在定高裁剪容器内瞬时切换，无竖直位移 */
.search-clip {
  width: 26px;
  height: 24px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  transition: width 0.25s ease;
}
.expanded .search-clip {
  width: 304px;
}
.search-entry {
  width: 26px;
  display: inline-flex;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  color: var(--el-text-color-regular);
  outline: none;
}
.search-inner {
  width: 304px;
  flex-shrink: 0;
}
.search-inner :deep(.domain-select) {
  width: 96px;
}
.search-btn {
  cursor: pointer;
}
.result-list {
  max-height: 360px;
  overflow: auto;
  min-height: 60px;
}
.result-item {
  padding: 7px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
.result-item.clickable {
  cursor: pointer;
}
.result-item.clickable:hover {
  background: var(--el-fill-color-light);
}
.item-title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-title :deep(em) {
  color: var(--el-color-danger);
  font-style: normal;
}
.item-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  min-width: 0;
}
.item-content {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-content :deep(em) {
  color: var(--el-color-danger);
  font-style: normal;
}
</style>
