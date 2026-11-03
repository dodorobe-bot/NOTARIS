import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': path.resolve(__dirname, 'src/main'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      rollupOptions: { input: { index: path.resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: path.resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: path.resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer/src'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      // electron-vite mematikan minifikasi renderer secara bawaan; untuk waktu muat
      // dan ukuran installer, berkas produksi tetap diperkecil.
      minify: true,
      rollupOptions: {
        input: { index: path.resolve(__dirname, 'src/renderer/index.html') },
        output: {
          // Pemisahan vendor stabil agar unggahan awal kecil dan cache tetap valid
          // ketika kode halaman berubah.
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            const mod = id.replace(/\\/g, '/')
            if (/node_modules\/(react|react-dom|scheduler)\//.test(mod)) return 'react'
            if (mod.includes('node_modules/react-router')) return 'router'
            if (/node_modules\/(recharts|recharts-scale|d3-[^/]+|victory-vendor|react-smooth|internmap|decimal\.js-light)\//.test(mod)) return 'charts'
            if (mod.includes('node_modules/lucide-react')) return 'icons'
            if (mod.includes('node_modules/date-fns')) return 'date'
            return 'vendor'
          },
        },
      },
    },
  },
})
