<template>
  <div class="search-body">
    <div class="search-bar">
      <div class="search-row">
        <el-select v-model="activeDomain" class="domain-select" @change="onDomainChange">
          <el-option label="全部域" value="" />
          <el-option v-for="d in domains" :key="d" :label="d" :value="d" />
        </el-select>
        <el-input
          v-model="keyword"
          :placeholder="widget.placeholder || '搜索业务数据，回车搜索'"
          clearable
          @keyup.enter="doSearch"
        />
        <el-button type="primary" class="search-btn" :icon="Search" @click="doSearch">搜索</el-button>
      </div>
    </div>
    <template v-if="searched">
      <div v-if="groups.length > 1" class="group-tags">
        <el-tag
          v-for="g in groups"
          :key="g.sourceCode"
          size="small"
          :type="activeGroup === g.sourceCode ? 'primary' : 'info'"
          class="group-tag"
          @click="activeGroup = activeGroup === g.sourceCode ? '' : g.sourceCode"
        >
          {{ g.sourceName }} {{ g.count }}
        </el-tag>
      </div>
      <div v-loading="loading" class="result-list">
        <div
          v-for="item in visibleRecords"
          :key="item.id"
          class="result-row"
          :class="{ clickable: !!item.jumpUrl }"
          @click="go(item)"
        >
          <div class="row-title" v-html="sanitizeSearchHighlight(item.title)" />
          <div class="row-sub">
            <el-tag size="small" type="info">{{ item.sourceName }}</el-tag>
            <span class="row-content" v-html="sanitizeSearchHighlight(item.content)" />
          </div>
        </div>
        <el-empty
          v-if="!loading && !visibleRecords.length"
          :image-size="56"
          :description="error ? '搜索服务不可达' : '无匹配结果'"
        />
      </div>
    </template>
    <div v-else class="search-idle">输入关键词回车搜索，结果可点击跳转到对应业务页面</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { sanitizeSearchHighlight } from 'mse-ui-shared'
import { SEARCH_CARD_DEFAULT, type HomeWidget } from '../types'
import request from '../../api/request'

interface SearchItem {
  id: string
  sourceCode: string
  sourceName: string
  bizId: string
  title: string
  content: string
  jumpUrl: string | null
  updateTime: string
}

interface GroupCount {
  sourceCode: string
  sourceName: string
  count: number
}

/** 首页搜索卡：默认调搜索引擎服务 /search/api/query（与顶栏全局搜索同接口），结果点击跳转子应用页面（jumpUrl 由服务端渲染）。
 *  接口/方式/参数取卡片配置（设计器预填 SEARCH_CARD_DEFAULT），未配置时回退默认，旧模板零改动；
 *  业务域为搜索前过滤（/search/api/domains 拉已注册源去重域，失败静默隐藏），输入框左侧下拉框选域，
 *  默认「全部域」不过滤；搜索按钮或回车触发；搜索后按源分组页签为结果内筛选，两者互不冲突。 */
const props = defineProps<{ widget: HomeWidget }>()
const router = useRouter()

const keyword = ref('')
const searched = ref(false)
const loading = ref(false)
const error = ref(false)
const records = ref<SearchItem[]>([])
const groups = ref<GroupCount[]>([])
const total = ref(0)
const activeGroup = ref('')
const domains = ref<string[]>([])
const activeDomain = ref('')

const visibleRecords = computed(() =>
  activeGroup.value ? records.value.filter((r) => r.sourceCode === activeGroup.value) : records.value
)

onMounted(loadDomains)

async function loadDomains() {
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
  // keyword/domain 由组件注入（覆盖同名字段），分页等其余参数走卡片配置
  const payload = {
    ...SEARCH_CARD_DEFAULT.params,
    ...(props.widget.params || {}),
    keyword: kw,
    domain: activeDomain.value || undefined
  }
  const api = props.widget.api?.trim() || SEARCH_CARD_DEFAULT.api
  try {
    const data =
      props.widget.method === 'get'
        ? (await request.get(api, { params: payload })) as any
        : (await request.post(api, payload)) as any
    records.value = data.records || []
    groups.value = data.groups || []
    total.value = Number(data.total || 0)
    searched.value = true
    activeGroup.value = ''
  } catch {
    error.value = true
    searched.value = true
  } finally {
    loading.value = false
  }
}

function go(item: SearchItem) {
  if (item.jumpUrl) router.push(item.jumpUrl)
}
</script>

<style scoped>
.search-body {
  padding: 4px 0;
}
.search-bar {
  padding: 0 4px;
}
.search-row {
  display: flex;
  gap: 8px;
}
.search-row .el-input {
  flex: 1;
  min-width: 0;
}
.domain-select {
  width: 108px;
  flex-shrink: 0;
}
.search-btn {
  flex-shrink: 0;
}
.group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 4px 0;
}
.group-tag {
  cursor: pointer;
}
.result-list {
  margin-top: 8px;
  max-height: 280px;
  overflow: auto;
}
.result-row {
  padding: 7px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
.result-row.clickable {
  cursor: pointer;
}
.result-row.clickable:hover {
  background: var(--el-fill-color-light);
}
.row-title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-title :deep(em) {
  color: var(--el-color-danger);
  font-style: normal;
}
.row-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  min-width: 0;
}
.row-content {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-content :deep(em) {
  color: var(--el-color-danger);
  font-style: normal;
}
.search-idle {
  padding: 18px 4px 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
