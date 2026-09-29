// tests/e2e/pwa.spec.js (reemplazar todo el archivo)

import { test, expect } from '@playwright/test';

test.describe('PWA — Progressive Web App', () => {
    test('debe tener un manifest.json válido', async ({ page, request }) => {
        const response = await request.get('/manifest.json');
        expect(response.ok()).toBe(true);

        const manifest = await response.json();
        expect(manifest.name).toBe('LocalAdmin Omega');
        expect(manifest.short_name).toBe('LocalAdmin');
        expect(manifest.start_url).toBe('/');
        expect(manifest.display).toBe('standalone');
    });

    test('debe tener el theme-color correcto', async ({ page }) => {
        await page.goto('/');
        const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
        expect(themeColor).toBe('#3b82f6');
    });

    test('debe tener el manifest link en el HTML', async ({ page }) => {
        await page.goto('/');
        const manifestLink = page.locator('link[rel="manifest"]');
        await expect(manifestLink).toHaveAttribute('href', '/manifest.json');
    });

    // ⬇️ NOTA: El test de registro del SW fue movido a pwa-production.spec.js
    // porque el SW solo se registra en producción (no en localhost).
});