// tests/e2e/offline.spec.js
import { test, expect } from '@playwright/test';

test.describe('Offline Mode — Funcionamiento sin conexión', () => {
    // ⬇️ NOTA: Los tests de offline requieren SW activo, que solo
    // se registra en producción. Estos tests se ejecutan contra
    // el build de producción con `npm run preview`.
    // Ver: tests/e2e/offline-production.spec.js

    test.skip('debe cargar la app offline tras primera visita', async ({ page, context }) => {
        // Skipped en dev. Ver offline-production.spec.js
    });

    test.skip('debe poder crear registros offline', async ({ page, context }) => {
        // Skipped en dev. Ver offline-production.spec.js
    });
});