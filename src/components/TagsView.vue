<template>
  <div class="tags-view">
    <el-scrollbar ref="scrollbarRef" class="tags-scrollbar">
      <div ref="listRef" class="tags-list">
        <router-link v-for="tag in tagsStore.views" :key="tag.path"
                     :to="tag.path" custom v-slot="{ navigate }">
          <span class="tag-item" :class="{ active: tag.path === activeKey }"
                @click="navigate" @contextmenu.prevent="openMenu($event, tag)">
            <span class="dot" />
            {{ tag.title }}
            <el-icon v-if="!tag.affix" class="close" @click.prevent.stop="closeTag(tag)">
              <Close />
            </el-icon>
          </span>
        </router-link>
      </div>
    </el-scrollbar>
    <!-- 页签溢出时的快捷滚动：方向按钮常驻最右侧（不溢出隐藏），滚到边界自动置灰 -->
    <div v-show="overflow" class="scroll-btns">
      <span class="scroll-btn" :class="{ disabled: atLeft }" @click="scrollTags(-1)">
        <el-icon><ArrowLeft /></el-icon>
      </span>
      <span class="scroll-btn" :class="{ disabled: atRight }" @click="scrollTags(1)">
        <el-icon><ArrowRight /></el-icon>
      </span>
    </div>
    <!-- 右键菜单挂到 body：标签栏的 backdrop-filter 会把 position:fixed 的包含块改成本元素（菜单漂移），
         且标签栏与内容区同为 z-index:1（内容区在 DOM 后侧，会盖住菜单）——脱离标签栏容器两层规避 -->
    <Teleport to="body">
      <ul v-show="menu.visible" class="context-menu" :style="{ left: menu.left + 'px', top: menu.top + 'px' }">
        <li @click="refreshTag()">刷新页面</li>
        <li v-if="!menu.tag?.affix" @click="closeTag(menu.tag!)">关闭当前</li>
        <li @click="closeOthers()">关闭其他</li>
        <li @click="closeAll()">全部关闭</li>
      </ul>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { ScrollbarInstance } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import WujieVue from 'wujie-vue3'
import { useTagsStore, type TagView } from '../stores/tags'

/** 多标签页栏：访问过的路由自动成签，支持右键刷新/关闭；溢出时右侧方向按钮快捷滚动 */
const route = useRoute()
const router = useRouter()
const { bus } = WujieVue
const tagsStore = useTagsStore()

/** 当前标签键：子应用路由按 path 归一（wujie sync 改写主应用 query，fullPath 随子应用内部导航抖动） */
const activeKey = computed(() => (route.path.startsWith('/sub/') ? route.path : route.fullPath))

const menu = reactive({ visible: false, left: 0, top: 0, tag: null as TagView | null })

// -------------------- 页签溢出快捷滚动 --------------------

const scrollbarRef = ref<ScrollbarInstance>()
const listRef = ref<HTMLElement>()
/** 溢出才显示方向按钮；两枚按钮滚到边界时分别置灰 */
const overflow = ref(false)
const atLeft = ref(true)
const atRight = ref(false)

/** 按 wrap 实际滚动状态刷新按钮显隐与置灰（scroll 事件 + 尺寸观察共同驱动） */
function refreshScrollState() {
  const wrap = scrollbarRef.value?.wrapRef
  if (!wrap) return
  const max = wrap.scrollWidth - wrap.clientWidth
  overflow.value = max > 1
  atLeft.value = wrap.scrollLeft <= 0
  atRight.value = wrap.scrollLeft >= max - 1
}

/** 点击方向按钮：按可视宽度的大部分平滑滚动一步 */
function scrollTags(direction: -1 | 1) {
  const wrap = scrollbarRef.value?.wrapRef
  if (!wrap) return
  const step = Math.max(wrap.clientWidth - 80, 120)
  wrap.scrollTo({ left: wrap.scrollLeft + direction * step, behavior: 'smooth' })
}

/** 激活签滚入可视区（切路由/新开签后调用）：已在可视区则不动，8px 对齐列表内边距 */
async function scrollActiveIntoView() {
  await nextTick()
  const wrap = scrollbarRef.value?.wrapRef
  if (!wrap) return
  const active = wrap.querySelector<HTMLElement>('.tag-item.active')
  if (!active) return
  const wrapRect = wrap.getBoundingClientRect()
  const rect = active.getBoundingClientRect()
  if (rect.left < wrapRect.left) {
    wrap.scrollTo({ left: wrap.scrollLeft + rect.left - wrapRect.left - 8, behavior: 'smooth' })
  } else if (rect.right > wrapRect.right) {
    wrap.scrollTo({ left: wrap.scrollLeft + rect.right - wrapRect.right + 8, behavior: 'smooth' })
  }
}

let scrollObserver: ResizeObserver | null = null

onMounted(() => document.addEventListener('click', closeMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))

onMounted(() => {
  const wrap = scrollbarRef.value?.wrapRef
  if (wrap) {
    wrap.addEventListener('scroll', refreshScrollState, { passive: true })
    // 尺寸观察覆盖两类溢出变化：容器宽（折叠侧栏/缩放窗口）与页签增删/改名（list 宽随内容）
    scrollObserver = new ResizeObserver(refreshScrollState)
    scrollObserver.observe(wrap)
    if (listRef.value) scrollObserver.observe(listRef.value)
  }
  refreshScrollState()
  // 启动恢复上次会话的页签时，激活签可能在可视区外
  scrollActiveIntoView()
})

onBeforeUnmount(() => {
  scrollbarRef.value?.wrapRef?.removeEventListener('scroll', refreshScrollState)
  scrollObserver?.disconnect()
  scrollObserver = null
})

watch(activeKey, scrollActiveIntoView)

function openMenu(event: MouseEvent, tag: TagView) {
  menu.visible = true
  menu.left = event.clientX
  menu.top = event.clientY
  menu.tag = tag
}

function closeMenu() {
  menu.visible = false
}

function closeTag(tag: TagView) {
  closeMenu()
  const target = tagsStore.removeView(tag.path)
  if (target && tag.path === activeKey.value) {
    router.push(target)
  }
}

function refreshTag() {
  closeMenu()
  // 子应用页签：refreshKey 重挂容器在 keep-alive 下只会触发 wujie alive 复用（DOM 原样搬回，
  // 谈不上刷新，还会把旧容器滞留在缓存），广播 sub:refresh 让容器销毁沙箱重建 = 真刷新
  const key = activeKey.value
  if (key.startsWith('/sub/')) {
    const name = key.split('/')[2]
    if (name) bus.$emit('sub:refresh', { urlPrefix: `/sub/${name}` })
    return
  }
  tagsStore.refresh()
}

function closeOthers() {
  closeMenu()
  tagsStore.closeOthers(activeKey.value)
}

function closeAll() {
  closeMenu()
  const target = tagsStore.closeAll()
  if (activeKey.value !== target) {
    router.push(target)
  } else {
    tagsStore.refresh()
  }
}
</script>

<style scoped>
.tags-view {
  position: relative;
  display: flex;
  align-items: stretch;
  height: 30px;
  background: var(--mse-card-bg);
  border-bottom: 1px solid var(--mse-card-border);
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, .06);
}
.tags-scrollbar {
  flex: 1;
  min-width: 0;
}
.tags-list {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 30px;
  /* 宽随内容撑开（溢出滚动靠它），未溢出时拉满保持内边距铺满整行 */
  width: max-content;
  min-width: 100%;
  box-sizing: border-box;
}
.tag-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 3px;
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.tag-item .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-border-color-darker);
}
.tag-item.active {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}
.tag-item.active .dot {
  background: #fff;
}
.tag-item .close {
  font-size: 12px;
  border-radius: 50%;
}
.tag-item .close:hover {
  background: rgba(0, 0, 0, .16);
  color: #fff;
}
.scroll-btns {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding: 0 6px 0 4px;
}
.scroll-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  user-select: none;
}
.scroll-btn:hover {
  background: var(--el-fill-color);
  color: var(--el-color-primary);
}
.scroll-btn.disabled {
  color: var(--el-border-color-darker);
  cursor: not-allowed;
}
.scroll-btn.disabled:hover {
  background: transparent;
  color: var(--el-border-color-darker);
}
.context-menu {
  position: fixed;
  z-index: 3000;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, .1);
  font-size: 12px;
  color: var(--el-text-color-primary);
}
.context-menu li {
  padding: 6px 16px;
  cursor: pointer;
}
.context-menu li:hover {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
</style>
