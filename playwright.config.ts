import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const lokalChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = existsSync(lokalChromium) ? { executablePath: lokalChromium } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4321', trace: 'retain-on-failure', launchOptions },
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:4321',
    reuseExistingServer: true,
    timeout: 240_000,
    env: { HOST: '127.0.0.1', PORT: '4321' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobil', use: { ...devices['Pixel 7'] } },
  ],
});
