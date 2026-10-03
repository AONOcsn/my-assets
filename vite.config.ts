import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 构建时间戳：注入为全局常量，用于在设置页显示版本，便于确认设备上跑的是哪一版。
// 显式按 UTC+8 格式化，避免 CI（UTC）构建出来的时间与本地部署时间对不上。
const buildStamp = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  base: './',
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp)
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (asset) => asset.name?.endsWith('.css') ? 'assets/app.css' : 'assets/[name][extname]'
      }
    }
  }
})
