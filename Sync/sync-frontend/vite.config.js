import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SoundWave 프론트엔드 (React) — 백엔드(Spring Boot, 8081)와 별도 프로세스로 실행
// 개발 서버는 5173, API/OAuth 요청은 프록시로 8081에 전달
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      '/oauth': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      // iTunes Search API — 브라우저에서 직접 호출하면 CORS로 막히는 경우가 있어
      // dev 서버에서 프록시로 우회 (서버 대 서버 요청은 CORS 영향을 안 받음)
      '/itunes-api': {
        target: 'https://itunes.apple.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/itunes-api/, ''),
      },
    },
  },
})
