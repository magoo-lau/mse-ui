import { computed, ref } from 'vue'
import request from '../api/request'
import { resolveAssetSrc } from '../utils/asset'
import { APP_TITLE } from '../config/side'

/** 后端 /auth/domain/config 返回体（域名绑定租户时附带租户三要素） */
interface DomainBranding {
  domain: string
  tenantId: number | null
  tenantCode: string | null
  tenantName: string | null
  siteTitle: string | null
  siteLogo: string | null
  loginBackground: string | null
  backgroundColor: string | null
  copyright: string | null
}

/** 域名命中的绑定租户（登录页据此锁定并隐藏租户编码、显示欢迎语） */
export interface BoundTenant {
  tenantId: number
  tenantCode: string
  tenantName: string
}

/** 未命中域名配置时的默认背景（与历史登录页一致） */
const DEFAULT_BACKGROUND = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'

/**
 * 品牌图地址解析：后端落库的上传素材是站内规范路径（/tenant/domain-config/asset/…
 * 与 mse-fs 通道 /fs/asset/{tenantId}/{fileId}.{后缀}），浏览器加载须经前端 /api 代理（dev proxy 与
 * 生产 nginx 同约定）；绝对地址与 data:image 原样返回。
 */
export function resolveBrandingUrl(url: string | null | undefined): string {
  return resolveAssetSrc(url)
}

/**
 * 登录页域名个性化：按当前访问主机名从后端（启动注册的域名缓存）拉取
 * 标题/Logo/背景/版权与绑定租户；未命中、停用或接口异常时静默回退默认样式（不阻断登录）。
 */
export function useDomainBranding() {
  const branding = ref<DomainBranding | null>(null)

  const title = computed(() => branding.value?.siteTitle || APP_TITLE)
  const logo = computed(() => resolveBrandingUrl(branding.value?.siteLogo))
  const copyright = computed(() => branding.value?.copyright || '')
  const boundTenant = computed<BoundTenant | null>(() => {
    const b = branding.value
    return b?.tenantId ? { tenantId: b.tenantId, tenantCode: b.tenantCode || '', tenantName: b.tenantName || '' } : null
  })

  /** 背景样式：背景图优先（cover 居中），背景色垫底/独立生效 */
  const backgroundStyle = computed(() => {
    const b = branding.value
    if (b?.loginBackground) {
      return {
        backgroundImage: `url("${resolveBrandingUrl(b.loginBackground)}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: b.backgroundColor || '#f5f7fa'
      }
    }
    return { background: b?.backgroundColor || DEFAULT_BACKGROUND }
  })

  /** 拉取域名个性化配置，返回原始数据（登录页据 tenantId 判断域名是否绑定租户） */
  async function loadBranding(): Promise<DomainBranding | null> {
    try {
      // skipErrorToast：装饰性接口，后端未升级/网络异常时静默回退默认样式，不打扰登录
      const data = await request.get('/auth/domain/config', { params: { host: window.location.hostname }, skipErrorToast: true })
      if (data) branding.value = data as DomainBranding
      return (data as DomainBranding) || null
    } catch {
      // 保持默认样式
      return null
    }
  }

  return { title, logo, copyright, boundTenant, backgroundStyle, loadBranding }
}
