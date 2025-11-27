// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 아래 define 부분이 없어서 에러가 난 것입니다. 이 부분을 추가해주세요!
  define: {
    'process.env': {},
  },
})
