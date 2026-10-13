import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' 使构建产物可在任意静态路径下部署（Vercel / GitHub Pages 子目录等）
//
// 小工具（小红书离线 H5）构建要求：
//   1) 最低基线 Android 8.1 出场 Chrome / WebView 61（ES2017）→ build.target='chrome61'
//   2) 离线 zip 无目录服务，`type="module"` 的相对 import 解析不可靠 → 产物必须是经典脚本
//      通过 output.format='iife' + inlineDynamicImports 生成单文件 IIFE，再由 postbuild 剥离
//      HTML 中的 type="module" / crossorigin 与 modulepreload 标签。
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'chrome61',
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
