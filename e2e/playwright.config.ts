import { defineConfig, devices } from '@playwright/test';

// Тесты идут против статического экспорта apps/web/out (сборка: см. README).
// POST /contact перехватывается через page.route; реальный API не вызывается.
const port = Number(process.env.E2E_PORT || 4173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/static-server.mjs',
    url: `${baseURL}/en/`,
    cwd: __dirname,
    env: { PORT: String(port) },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
