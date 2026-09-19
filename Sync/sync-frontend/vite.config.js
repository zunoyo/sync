import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SoundWave 프론트엔드 (React) — 백엔드(Spring Boot, 8081)와 별도 프로세스로 실행
// 개발 서버는 5173, API/OAuth 요청은 프록시로 8081에 전달
// iTunes 검색은 백엔드의 /api/itunes-proxy(브라우저 직접 호출 시 403 차단 우회용)를
// 거치므로 /api 프록시 규칙 하나로 충분 — 별도의 /itunes-api 규칙은 더 이상 필요 없음
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
    },
  },
})
