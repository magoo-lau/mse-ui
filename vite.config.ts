import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 双模式构建：--mode tenant（租户端）与 --mode platform（平台运营端）产出两个独立部署物
export default defineConfig(({ mode }) => {
  const platform = mode === 'platform'
  return {
    plugins: [vue()],
  // mse-ui-shared 以 file: 源码直出（.ts/.vue），排除出 dev 预构建交由插件链按源码处理
  optimizeDeps: {
    exclude: ['mse-ui-shared']
  },

    build: {
      outDir: platform ? 'dist/platform' : 'dist/tenant',
      emptyOutDir: true
    },
    server: {
      // 租户端 3000 / 平台端 3001：端口不同即不同源，浏览器存储天然隔离；
      // 端口是文档约定，被占用时直接报错而不是静默漂移
      port: platform ? 3001 : 3000,
      strictPort: true,
      // 监听双栈（Node 17+ 默认 host=localhost 可能只绑 IPv6 ::1，hosts 指到 127.0.0.1 的域名将连不上）
      host: true,
      // 允许通过租户绑定域名访问 dev server（如 hosts 映射的 demo.mse.local）
      allowedHosts: true,
      proxy: {
        // 开发代理：单体模式指向 8080（可用 MSE_API_TARGET 覆盖，如指向调试中的其他端口）；
        // 微服务模式改为 48080（网关）
        '/api': {
          target: process.env.MSE_API_TARGET || 'http://localhost:8080',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    }
  }
})
