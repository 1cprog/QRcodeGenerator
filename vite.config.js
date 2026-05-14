import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api/nbs": {
        target: "https://nbs.rs",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nbs/, "/QRcode/api/qr/v1"),
      },
    },
  },
});