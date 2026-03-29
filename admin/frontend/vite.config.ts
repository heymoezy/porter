import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

// Disable proxy buffering for SSE endpoints so events stream in real-time
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sseProxyConfig(proxy: any) {
  proxy.on("proxyRes", (proxyRes: any, req: any) => {
    if (req.url?.includes("/events") || req.headers?.accept === "text/event-stream") {
      proxyRes.headers["cache-control"] = "no-cache"
      proxyRes.headers["x-accel-buffering"] = "no"
      delete proxyRes.headers["content-length"]
    }
  })
}

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  build: {
    // Single bundle — no code splitting. 1.9MB total is fine for an admin panel.
    // Eliminates per-route chunk downloads that cause multi-second delays over SSH.
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5176,
    proxy: {
      // All API routes → Brain on 3001 (admin absorbed into Brain)
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        configure: sseProxyConfig,
      },
    },
  },
})
