// playwright.production.config.js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e-production',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: 'html',
    timeout: 30000,

    use: {
        baseURL: 'http://localhost:4173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        launchOptions: {
            args: [
                '--allow-insecure-localhost',
                '--no-sandbox'
            ]
        }
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        }
    ],

    webServer: {
        command: 'npm run build && npm run preview',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 180000
    }
});