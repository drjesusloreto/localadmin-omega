// tests/e2e-production/pwa-production.spec.js
import { test, expect } from '@playwright/test';

test.describe('PWA en Producción', () => {
    test('debe tener el manifest.json accesible y correcto', async ({ request }) => {
        const response = await request.get('/manifest.json');
        expect(response.ok()).toBe(true);

        const manifest = await response.json();
        expect(manifest.name).toBe('LocalAdmin Omega');
        expect(manifest.short_name).toBe('LocalAdmin');
        expect(manifest.start_url).toBe('/');
        expect(manifest.display).toBe('standalone');
        expect(manifest.theme_color).toBe('#3b82f6');
    });

    test('debe tener el sw.js accesible', async ({ request }) => {
        const response = await request.get('/sw.js');
        expect(response.ok()).toBe(true);
    });

    test('debe tener el sw.js con la lógica de caché correcta', async ({ request }) => {
        const response = await request.get('/sw.js');
        const content = await response.text();

        // Verificar constantes y eventos
        expect(content).toContain('CACHE_NAME');
        expect(content).toContain('localadmin-omega');
        expect(content).toContain("addEventListener('install'");
        expect(content).toContain("addEventListener('activate'");
        expect(content).toContain("addEventListener('fetch'");
        expect(content).toContain('cache.addAll');
        expect(content).toContain('skipWaiting');
        expect(content).toContain('clients.claim');
    });

    test.skip('debe registrar el Service Worker en navegador', async ({ page }) => {
        // ⚠️ SKIPPED: Playwright headless no soporta SW en localhost.
        // Validar manualmente:
        //   1. npm run build && npm run preview
        //   2. Abrir http://localhost:4173 en Chrome
        //   3. DevTools → Application → Service Workers
        //   4. Verificar que el SW aparece como "activated and is running"
    });
});