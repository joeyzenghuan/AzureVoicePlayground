import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.test.ts',
  timeout: 120000,
  use: {
    baseURL: 'http://localhost:5199',
    headless: false,
    screenshot: 'on',
    permissions: ['microphone'],
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--allow-file-access',
          ],
        },
      },
    },
  ],
});
