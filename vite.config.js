import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base: './' 使构建产物可在任意静态路径下部署（Vercel / GitHub Pages 子目录等）
export default defineConfig({
    plugins: [react()],
    base: './',
});
