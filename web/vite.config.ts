import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

// Service worker: precache the shell, runtime-cache signed packs and audio index.
// The shell + core pack stay inside the design's 2 MB gzipped budget.
export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Sopaan — Every step, signed",
        short_name: "Sopaan",
        description:
          "Offline-first guidance, skill proof and outcome-linked credits for rural students. Works without a network after install.",
        lang: "hi",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#12111f",
        theme_color: "#12111f",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/packs/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "sopaan-packs",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            urlPattern: ({ url }) => url.origin !== self.location.origin,
            handler: "NetworkFirst",
            options: { cacheName: "sopaan-external", networkTimeoutSeconds: 4 },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: "es2020",
    sourcemap: false,
    reportCompressedSize: true,
  },
  server: { host: "127.0.0.1", port: 5173 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
