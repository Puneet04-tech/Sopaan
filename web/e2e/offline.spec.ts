import { expect, test, type Page } from "@playwright/test";

/**
 * The Must flows run once, then the browser is switched offline and the same screens must work
 * from the cached pack and the local store. Nothing here talks to the API while offline.
 * Assertions are language-independent: the UI is Hindi by default.
 */
const API = process.env.SOPAAN_API ?? "http://localhost:8080";

async function signUpDirect(page: Page): Promise<void> {
  const username = `e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const response = await page.request.post(`${API}/v1/auth/register`, {
    data: { username, password: "TestPass1", display_name: "E2E learner" },
  });
  expect(response.ok(), `register failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  const body = (await response.json()) as { token: string };
  await page.addInitScript(
    ([token]) => {
      window.localStorage.setItem("sopaan_auth_token", token);
      window.localStorage.setItem("sopaan_server_url", "http://localhost:8080");
    },
    [body.token],
  );
}

/** One online visit: the shell and the signed pack get cached by the service worker. */
async function primeApp(page: Page): Promise<void> {
  await page.goto("/#/discover");
  // The boot skeleton also uses .screen, so wait for the shell (bottom navigation) instead.
  await expect(page.locator("nav").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, { timeout: 60_000 });
  await page.waitForTimeout(1_500);
}

test("discovery and eligibility run in airplane mode", async ({ page, context }) => {
  await signUpDirect(page);
  await primeApp(page);

  await context.setOffline(true);
  await page.reload();

  await expect(page.locator("nav").first()).toBeVisible({ timeout: 60_000 });
  await page.goto("/#/act");
  await expect(page.locator(".buttonlike").first()).toBeVisible({ timeout: 60_000 });
  const eligible = await page.locator(".buttonlike").count();
  expect(eligible).toBeGreaterThan(2);

  // Every result carries the pack it was decided from, even with no network.
  const actText = await page.locator("body").innerText();
  expect(actText).toContain("pack 2026.10.14-1");

  await context.setOffline(false);
});

test("the eligibility page survives a hard offline reload", async ({ page, context }) => {
  await signUpDirect(page);
  await primeApp(page);
  await page.goto("/#/act");
  await expect(page.locator(".buttonlike").first()).toBeVisible({ timeout: 60_000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("nav").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".buttonlike").first()).toBeVisible({ timeout: 60_000 });
  const body = await page.locator("body").innerText();
  expect(body.length).toBeGreaterThan(120);
  await context.setOffline(false);
});
