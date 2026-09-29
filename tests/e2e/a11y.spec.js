// tests/e2e/a11y.spec.js
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accesibilidad (a11y)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('header h1', { timeout: 10000 });
        await page.waitForFunction(() => window.app !== undefined, { timeout: 10000 });
    });

    // ============================================================
    // ANÁLISIS GLOBAL
    // ============================================================
    test('debe pasar análisis de accesibilidad completo', async ({ page }) => {
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

        // ⬇️ LOG detallado para debugging
        if (results.violations.length > 0) {
            console.log('\n═══════════════════════════════════════════════════════');
            console.log(`🔴 ${results.violations.length} VIOLACIONES ENCONTRADAS`);
            console.log('═══════════════════════════════════════════════════════');

            results.violations.forEach((v, i) => {
                console.log(
                    `\n[${i + 1}/${results.violations.length}] [${v.impact.toUpperCase()}] ${v.id}`
                );
                console.log(`   Descripción: ${v.description}`);
                console.log(`   Ayuda: ${v.helpUrl}`);
                console.log(`   Nodos afectados: ${v.nodes.length}`);

                v.nodes.slice(0, 3).forEach((node, j) => {
                    console.log(`\n   ─── Nodo ${j + 1} ───`);
                    console.log(`   Target: ${node.target.join(' ')}`);
                    console.log(`   HTML: ${node.html.substring(0, 200)}`);
                    if (node.failureSummary) {
                        console.log(`   Falla: ${node.failureSummary}`);
                    }
                });
            });
            console.log('\n═══════════════════════════════════════════════════════\n');
        }

        expect(results.violations).toEqual([]);
    });

    test('debe pasar análisis en la página de creación', async ({ page }) => {
        await page.selectOption('#user-select', 'editor');
        await page.waitForFunction(() => window.app?.currentUser === 'editor');
        await page.click('#btn-new');
        await page.waitForSelector('#record-modal[open]');

        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

        expect(results.violations).toEqual([]);
    });

    test('debe pasar análisis con registros en la lista', async ({ page }) => {
        await page.selectOption('#user-select', 'editor');
        await page.waitForFunction(() => window.app?.currentUser === 'editor');

        // Crear 3 registros
        for (const name of ['Registro A', 'Registro B', 'Registro C']) {
            await page.click('#btn-new');
            await page.fill('#record-name', name);
            await page.fill('#record-content', `Contenido de ${name}`);
            await page.click('#btn-save');
        }

        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

        expect(results.violations).toEqual([]);
    });

    // ============================================================
    // ANÁLISIS ESPECÍFICO
    // ============================================================
    test('debe tener un header con h1 único', async ({ page }) => {
        const h1Count = await page.locator('h1').count();
        expect(h1Count).toBe(1);
    });

    test('debe tener lang="es" en el HTML', async ({ page }) => {
        const lang = await page.locator('html').getAttribute('lang');
        expect(lang).toBe('es');
    });

    test('debe tener labels en el formulario', async ({ page }) => {
        await page.selectOption('#user-select', 'editor');
        await page.waitForFunction(() => window.app?.currentUser === 'editor');
        await page.click('#btn-new');
        await page.waitForSelector('#record-modal[open]');

        // Verificar que cada input tiene un label
        const nameInput = page.locator('#record-name');
        const contentInput = page.locator('#record-content');

        await expect(nameInput).toHaveAttribute('aria-label', /.+/);
        await expect(contentInput).toHaveAttribute('aria-label', /.+/);
    });

    test('debe tener contraste suficiente en el header', async ({ page }) => {
        const results = await new AxeBuilder({ page })
            .include('header')
            .withTags(['wcag2aa'])
            .analyze();

        expect(results.violations).toEqual([]);
    });

    test('debe tener botones con texto o aria-label', async ({ page }) => {
        const buttons = await page.locator('button').all();

        for (const button of buttons) {
            const text = await button.textContent();
            const ariaLabel = await button.getAttribute('aria-label');

            // Debe tener texto visible O aria-label
            expect(text?.trim() || ariaLabel).toBeTruthy();
        }
    });
});
