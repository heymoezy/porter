import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  server: {
    port: 5175,
    proxy: {
      // Auth routes go to main Porter backend (shared session cookie)
      "/api/v1/auth": {
        target: "http://127.0.0.1:8877",
        changeOrigin: true,
      },
      // Admin API routes go to admin backend
      "/api/admin": {
        target: "http://127.0.0.1:5180",
        changeOrigin: true,
      },
    },
  },
})
