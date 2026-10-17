import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// the same pre-installed Chromium as playwright.config.ts, where it exists
const lokalChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = existsSync(lokalChromium) ? { executablePath: lokalChromium } : {};

export default defineConfig({
  testDir: 'tests/onecom',
  timeout: 60_000,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:4322',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
    launchOptions,
  },
  webServer: {
    command: 'npm run preview:onecom',
    url: 'http://127.0.0.1:4322/designporten-test/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobil', use: { ...devices['Pixel 7'] } },
  ],
});
