// tests/e2e-production/offline-production.spec.js
import { test, expect } from '@playwright/test';

test.describe('Offline en Producción', () => {
    test('debe tener el sw.js con estrategia cache-first', async ({ request }) => {
        const response = await request.get('/sw.js');
        const content = await response.text();

        // Verificar estrategia cache-first
        expect(content).toContain('caches.match');
        expect(content).toContain('caches.open');
        
        // Verificar filtros de Vite (evitar interceptar HMR)
        expect(content).toContain("@vite");
        expect(content).toContain("/src/");
    });

    test('debe tener el manifest.json con iconos opcionales', async ({ request }) => {
        const response = await request.get('/manifest.json');
        const manifest = await response.json();
        
        // Los iconos son opcionales
        expect(manifest.categories).toContain('productivity');
        expect(manifest.lang).toBe('es');
    });

    test.skip('debe cargar la app offline tras primera visita', async ({ page, context }) => {
        // ⚠️ SKIPPED: Requiere SW activo, no soportado en Playwright headless.
        // Validar manualmente:
        //   1. npm run preview
        //   2. Abrir http://localhost:4173 en Chrome
        //   3. Esperar a que SW se active (DevTools → Application)
        //   4. DevTools → Network → Offline
        //   5. Recargar (Ctrl+R). La app debe seguir funcionando.
    });

    test.skip('debe poder crear registros offline', async ({ page, context }) => {
        // ⚠️ SKIPPED: Requiere SW activo.
        // Validar manualmente (mismo procedimiento que el test anterior).
    });
});