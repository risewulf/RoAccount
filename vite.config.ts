import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri sert le front sur un port fixe en dev, et attend un build dans dist/.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "esnext",
    outDir: "dist",
  },
});
