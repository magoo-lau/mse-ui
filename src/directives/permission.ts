import type { Directive } from 'vue'
import { useUserStore } from '../stores/user'

/**
 * 按钮级权限指令：v-permission="'system:user:create'"（数组 = 任一命中）。
 * 无权限时直接移除元素；权限数据源为登录后拉取的权限码集合（stores/user.ts）。
 */
export const permission: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    const userStore = useUserStore()
    if (!userStore.hasPermission(binding.value)) {
      el.parentNode?.removeChild(el)
    }
  }
}
