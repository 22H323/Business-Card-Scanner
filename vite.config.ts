import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

const apiTarget = process.env.VITE_API_URL || "http://127.0.0.1:5000";

export default defineConfig({
  server: {
    proxy: {
      "/admin": { target: apiTarget, changeOrigin: true },
      "/contacts": { target: apiTarget, changeOrigin: true },
      "/scan-card": { target: apiTarget, changeOrigin: true },
      "/health": { target: apiTarget, changeOrigin: true },
      "/integrations": { target: apiTarget, changeOrigin: true },
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
  ],
});
