import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// base: "./" makes every built asset URL relative, so the same build works
// whether it's served from a GitHub Pages project site (https://you.github.io/repo/)
// or a user/organization root site (https://you.github.io/) without editing this file.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Ledger — Daily Project Tracker",
        short_name: "Ledger",
        description: "Log one action a day against every project you're running.",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#F2F2F7",
        theme_color: "#F2F2F7",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // app-shell precache; storage.js/localStorage handles your actual data,
        // this just lets the app boot while offline
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
      },
    }),
  ],
});
