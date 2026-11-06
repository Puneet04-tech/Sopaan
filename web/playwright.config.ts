import { defineConfig, devices } from "@playwright/test";

/**
 * Offline end-to-end run (design 8.1: "Playwright with the browser context set offline").
 * The service worker is only registered by a production build, so the suite runs against
 * `vite preview` and not the dev server.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Pixel 5"] } }],
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
