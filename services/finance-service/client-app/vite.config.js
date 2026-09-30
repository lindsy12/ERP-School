import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The built pages are served by finance-service under /finance/ (see src/app.js), and the gateway
// forwards /finance/* there, so the app shares the ERP's origin and sign-in (/auth/js/session.js).
// `npm run dev` here proxies the API and the sign-in page to a running gateway on :3000.
export default defineConfig({
  base: "/finance/",
  plugins: [react()],
  build: { outDir: "../client", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/auth": "http://localhost:3000"
    }
  }
});
