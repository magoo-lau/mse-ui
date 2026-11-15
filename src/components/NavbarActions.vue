<template>
  <!-- 导航栏右侧操作区（left 布局在导航栏、top/mix 布局在顶栏行尾复用）：全局搜索 + 消息铃铛 +
       端别标识 + 用户下拉（命令经 command 上抛，宿主 Layout 统一处理弹窗/登出/跳转） -->
  <div class="navbar-actions">
    <global-search v-if="portal.globalSearchEnabled" />
    <notification-bell />
    <el-tag v-if="userStore.platform" type="warning" effect="plain" size="small">平台运营端</el-tag>
    <el-tag v-else type="info" effect="plain" size="small">{{ userStore.tenantName || `租户 ${userStore.tenantId}` }}</el-tag>
    <el-dropdown trigger="click" @command="(command: string) => emit('command', command)">
      <span class="user-entry">
        <el-avatar :size="28" :src="resolveAssetSrc(userStore.avatar) || undefined" icon="UserFilled" />
        <span class="nickname">{{ userStore.nickname || '用户' }}</span>
        <el-icon><ArrowDown /></el-icon>
      </span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="theme">
            <el-icon><Brush /></el-icon>主题设置
          </el-dropdown-item>
          <el-dropdown-item command="customize">
            <el-icon><Check v-if="portal.customizing" /><Edit v-else /></el-icon>
            {{ portal.customizing ? '保存布局' : '自定义首页' }}
          </el-dropdown-item>
          <el-dropdown-item v-permission="'system:profile:update'" command="avatar" divided>
            <el-icon><Avatar /></el-icon>上传头像
          </el-dropdown-item>
          <el-dropdown-item v-permission="'system:profile:update'" command="password">
            <el-icon><Lock /></el-icon>修改密码
          </el-dropdown-item>
          <!-- 绑定入口随生效模式显隐（/me 下发 totpMode）：关闭=登录不校验动态码，入口一并隐藏 -->
          <el-dropdown-item v-if="userStore.totpMode !== 'off'" v-permission="'system:profile:update'" command="twofactor">
            <el-icon><Cellphone /></el-icon>双因子认证
          </el-dropdown-item>
          <el-dropdown-item command="sessions">
            <el-icon><Iphone /></el-icon>登录设备
          </el-dropdown-item>
          <el-dropdown-item command="logout" divided>
            <el-icon><SwitchButton /></el-icon>退出登录
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { resolveAssetSrc } from '../utils/asset'
import { useUserStore } from '../stores/user'
import { usePortalStore } from '../stores/portal'
import GlobalSearch from './GlobalSearch.vue'
import NotificationBell from './NotificationBell.vue'

const emit = defineEmits<{ (e: 'command', command: string): void }>()

const userStore = useUserStore()
const portal = usePortalStore()
</script>

<style scoped>
.navbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  /* 右侧工具区永不压缩：宽度不足时由菜单区收纳溢出项（ellipsis）让位 */
  flex-shrink: 0;
}
.user-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--el-text-color-primary);
  outline: none;
}
.nickname {
  font-size: 14px;
}
</style>
