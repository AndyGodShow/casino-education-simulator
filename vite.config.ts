import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/')
          if (normalizedId.includes('/src/modules/traditional/games/baccarat/')) return 'baccarat'
          if (normalizedId.includes('/src/modules/traditional/games/blackjack/')) return 'blackjack'
          if (normalizedId.includes('/src/modules/traditional/games/roulette/')) return 'roulette'
          return undefined
        },
      },
    },
  },
})
