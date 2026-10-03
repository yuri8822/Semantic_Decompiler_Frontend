import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In development, /api is proxied to the backend so the browser sees one origin.
// Point it elsewhere with API_PROXY_TARGET (dev) or VITE_API_URL (built app).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: env.API_PROXY_TARGET || "http://127.0.0.1:8765",
          changeOrigin: true,
        },
      },
    },
  };
});
