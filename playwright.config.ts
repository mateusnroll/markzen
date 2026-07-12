import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'browser',
      testMatch: /browser\/.*\.spec\.ts/,
      use: { baseURL: 'http://127.0.0.1:4173' },
    },
    {
      name: 'electron',
      testMatch: /shell\/.*\.spec\.ts/,
      timeout: 60_000,
      workers: 1,
    },
    {
      name: 'performance',
      testMatch: /performance\/.*\.spec\.ts/,
      timeout: 120_000,
      use: { baseURL: 'http://127.0.0.1:4173' },
      workers: 1,
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
})
