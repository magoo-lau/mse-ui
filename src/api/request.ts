import axios from 'axios'
import { ElMessage } from 'element-plus'
import { LOGIN_PATH, storageKey } from '../config/side'
import { setHttp } from 'mse-ui-shared'

/** 单请求静默标记：非 0 业务码 / 非 401 异常不弹全局提示，由调用方自行降级（如登录页域名个性化）；
 * 另：下方响应拦截器在 code===0 时 return body.data，运行时调用侧拿到的直接是业务数据，
 * 类型层面经 AxiosInstance 增强同步该解包约定（默认 any 与运行时一致，调用方可显式泛型收紧） */
declare module 'axios' {
  export interface AxiosRequestConfig {
    skipErrorToast?: boolean
  }
  export interface AxiosInstance {
    request<T = any>(config: AxiosRequestConfig): Promise<T>
    get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>
    delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>
    head<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>
    options<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>
    post<T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
    put<T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
    patch<T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  }
}

const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
  // axios ≥1.20 会对未显式设置 Content-Type 的 post/put/patch 默认补发 application/x-www-form-urlencoded
  // （dispatchRequest 强制补发，仅"未设置"时不覆盖）。空 body 请求带上它会命中后端
  // @RequestBody(required=false) 并抛 HttpMediaTypeNotSupportedException（如「租户数据源」行级测试连接）。
  // 方法级默认 JSON 头压过它：空 body 也声明 JSON，后端按空请求体正常处理
  headers: {
    post: { 'Content-Type': 'application/json' },
    put: { 'Content-Type': 'application/json' },
    patch: { 'Content-Type': 'application/json' }
  }
})

request.interceptors.request.use((config) => {
  const token = localStorage.getItem(storageKey('token'))
  if (token) config.headers.Authorization = token
  // FormData（文件上传）：删掉方法级默认 JSON 头，否则 axios 会把 FormData 直接 JSON 序列化
  // （transformRequest 见到 application/json 就 formDataToJSON），后端收到非 multipart 请求报 MultipartException。
  // 删除后浏览器自动补 multipart/form-data; boundary=…
  if (config.data instanceof FormData) config.headers.setContentType(false)
  return config
})

/** 并发请求同时 401 时只提示/跳转一次；整页跳转后模块重载自动复位 */
let redirectingToLogin = false

request.interceptors.response.use(
  (resp) => {
    const body = resp.data
    if (body.code === 0) return body.data
    if (!resp.config.skipErrorToast) ElMessage.error(body.message || '请求失败')
    return Promise.reject(body)
  },
  (err) => {
    if (err.response?.status === 401) {
      if (!redirectingToLogin) {
        redirectingToLogin = true
        // 会话已失效：清除本地登录态并整页跳本侧登录页（双模式构建侧别固定，见 config/side）；
        // 整页跳转同时重置 pinia 与动态路由，避免守卫因残留 token 弹回首页；
        // 提示优先取后端细分消息（被强制下线/被顶下线/已过期），无则回退通用文案
        localStorage.removeItem(storageKey('token'))
        localStorage.removeItem(storageKey('user'))
        // 页签与登录态同生命周期：会话失效后清掉，避免重登换账号时残留上一账号的页面入口
        localStorage.removeItem(storageKey('tags'))
        ElMessage.error(err.response?.data?.message || '账号未登录或会话已过期')
        window.location.href = LOGIN_PATH
      }
    } else if (!err.config?.skipErrorToast) {
      ElMessage.error(err.response?.data?.message || err.message || '网络异常')
    }
    return Promise.reject(err)
  }
)

/**
 * 文件下载（Excel 等小文件 blob 响应）：文件名取 content-disposition（RFC 5987 filename*=UTF-8''）。
 * 后端异常时仍可能返回 JSON 错误体，据 content-type 识别并提示。
 * 大文件（交付介质包等）勿走本函数：请让后端签发短时下载 URL（免会话 + Range 断点续传），
 * 交浏览器原生下载流式落盘（见 DeliverExport 的 nativeDownload）。
 * 返回 true=已触发保存，false=失败（已弹提示）。
 */
export async function download(url: string, params?: Record<string, unknown>, defaultName = '下载文件'): Promise<boolean> {
  try {
    const resp = await axios.get(`/api${url}`, {
      params,
      responseType: 'blob',
      headers: { Authorization: localStorage.getItem(storageKey('token')) || '' }
    })
    const contentType = String(resp.headers['content-type'] || '')
    if (contentType.includes('application/json')) {
      const text = await (resp.data as Blob).text()
      try {
        ElMessage.error(JSON.parse(text).message || '下载失败')
      } catch {
        ElMessage.error('下载失败')
      }
      return false
    }
    const disposition = String(resp.headers['content-disposition'] || '')
    let filename = defaultName
    const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
    if (star) {
      filename = decodeURIComponent(star[1])
    } else {
      const plain = /filename="?([^";]+)"?/i.exec(disposition)
      if (plain) filename = plain[1]
    }
    const link = document.createElement('a')
    link.href = URL.createObjectURL(resp.data)
    link.download = filename
    link.click()
    URL.revokeObjectURL(link.href)
    return true
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '下载失败')
    return false
  }
}

// 接线共享包：CronInput 预览等共享组件经此实例发请求（复用拦截器/鉴权语义）
setHttp(request)

export default request
