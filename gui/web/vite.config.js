import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' 让产物用相对路径引用资源，方便被本地服务端从根目录托管。
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
