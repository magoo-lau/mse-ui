<template>
  <div class="quick-nav">
    <div v-for="item in visible" :key="item.title + item.path" class="nav-item" @click="open(item)">
      <el-icon :size="22" :color="item.color || '#409eff'"><component :is="item.icon || 'Grid'" /></el-icon>
      <span>{{ item.title }}</span>
    </div>
    <el-empty v-if="!visible.length" :image-size="48" description="暂无可用入口" />
    <!-- 勾选「弹窗」的入口：居中弹窗内嵌打开（本系统页面或第三方 URL） -->
    <el-dialog v-model="popupVisible" :title="popupTitle" width="72%" top="6vh" destroy-on-close append-to-body>
      <iframe v-if="popupSrc" :src="popupSrc" class="popup-frame" frameborder="0" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { HomeWidget, LinkEntry } from '../types'
import { useUserStore } from '../../stores/user'

const props = defineProps<{ widget: HomeWidget }>()
const router = useRouter()
const userStore = useUserStore()

const visible = computed(() =>
  (props.widget.entries || []).filter((item) => {
    // 旧权限码字段（保留兼容）+ 角色可见性：配置了角色清单时持有任一角色才可见，空=登录可见
    if (item.perm && !userStore.hasPermission(item.perm)) return false
    if (item.roles?.length && !item.roles.some((code) => userStore.roles.includes(code))) return false
    return true
  })
)

const popupVisible = ref(false)
const popupTitle = ref('')
const popupSrc = ref('')

function open(item: LinkEntry) {
  if (item.popup) {
    popupTitle.value = item.title
    popupSrc.value = resolveEmbedUrl(item.path)
    popupVisible.value = true
    return
  }
  router.push(item.path)
}

/** 弹窗嵌入地址：外链原样；站内路由按当前 origin 解析（history 回退保证整页可直开） */
function resolveEmbedUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return new URL(path, window.location.origin).toString()
}
</script>

<style scoped>
.quick-nav {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
}
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  border: 1px solid var(--mse-card-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}
.nav-item:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 12px rgba(64, 158, 255, 0.15);
}
.popup-frame {
  width: 100%;
  height: 66vh;
  border: none;
  border-radius: 4px;
  background: var(--el-bg-color);
  display: block;
}
</style>
