// tests/e2e/app.spec.js
import { test, expect } from '@playwright/test';

test.describe('LocalAdmin Omega — E2E', () => {
    test.beforeEach(async ({ page }) => {
		await page.goto('/');

		// Esperar a que la app esté lista
		await page.waitForSelector('header h1', { timeout: 10000 });
		
		// ⬇️ CRÍTICO: Esperar a que window.app esté disponible
		await page.waitForFunction(() => window.app !== undefined, { timeout: 10000 });
		
		// ⬇️ Esperar a que el usuario actual sea 'viewer' (default)
		await page.waitForFunction(() => window.app?.currentUser === 'viewer', { timeout: 5000 });
	});

    // ============================================================
    // CARGA INICIAL
    // ============================================================
    test('debe cargar la aplicación correctamente', async ({ page }) => {
        // Verificar título
        await expect(page).toHaveTitle(/LocalAdmin/);

        // Verificar header
        await expect(page.locator('header h1')).toContainText('LocalAdmin Omega');

        // Verificar selector de usuario
        await expect(page.locator('#user-select')).toBeVisible();

        // Verificar botón de nuevo registro
        await expect(page.locator('#btn-new')).toBeVisible();

        // Verificar búsqueda
        await expect(page.locator('#search-input')).toBeVisible();
    });

    test('debe mostrar estado vacío al inicio', async ({ page }) => {
        await expect(page.locator('#empty-state')).toBeVisible();
    });

    // ============================================================
    // CAMBIO DE USUARIO Y RBAC
    // ============================================================
    test('debe deshabilitar el botón Nuevo para Viewer', async ({ page }) => {
        await page.selectOption('#user-select', 'viewer');
        await expect(page.locator('#btn-new')).toBeDisabled();
    });

    test('debe habilitar el botón Nuevo para Editor', async ({ page }) => {
        await page.selectOption('#user-select', 'editor');
        await expect(page.locator('#btn-new')).toBeEnabled();
    });

    test('debe habilitar el botón Nuevo para Admin', async ({ page }) => {
		// Cambiar el select Y disparar el evento change manualmente
		await page.selectOption('#user-select', 'admin');
		await page.evaluate(() => {
			const select = document.getElementById('user-select');
			select.dispatchEvent(new Event('change', { bubbles: true }));
		});
		
		// Esperar a que el botón se habilite
		await expect(page.locator('#btn-new')).toBeEnabled({ timeout: 5000 });
	});

    // ============================================================
    // FLUJO COMPLETO CRUD
    // ============================================================
    test('debe crear un registro completo', async ({ page }) => {
        // Cambiar a Editor
        await page.selectOption('#user-select', 'editor');

        // Abrir modal
        await page.click('#btn-new');
        await expect(page.locator('#record-modal')).toBeVisible();

        // Rellenar formulario
        await page.fill('#record-name', 'Registro E2E');
        await page.fill('#record-content', 'Contenido de prueba E2E');
        await page.fill('#record-category', 'test');

        // Guardar
        await page.click('#btn-save');

        // Verificar que se cerró el modal
        await expect(page.locator('#record-modal')).not.toBeVisible();

        // Verificar que aparece en la lista
        await expect(page.locator('.record-card')).toHaveCount(1);
        await expect(page.locator('.record-card h3')).toContainText('Registro E2E');
    });

    test('debe buscar registros por nombre', async ({ page }) => {
        await page.selectOption('#user-select', 'editor');

        // Crear 3 registros
        for (const name of ['Factura A', 'Presupuesto B', 'Contrato C']) {
            await page.click('#btn-new');
            await page.fill('#record-name', name);
            await page.fill('#record-content', `Contenido de ${name}`);
            await page.click('#btn-save');
        }

        await expect(page.locator('.record-card')).toHaveCount(3);

        // Buscar
        await page.fill('#search-input', 'factura');
        await expect(page.locator('.record-card')).toHaveCount(1);
        await expect(page.locator('.record-card h3')).toContainText('Factura A');
    });

    test('debe buscar registros por contenido descifrado', async ({ page }) => {
        await page.selectOption('#user-select', 'editor');

        await page.click('#btn-new');
        await page.fill('#record-name', 'Documento');
        await page.fill('#record-content', 'Contenido super secreto');
        await page.click('#btn-save');

        // Buscar por contenido (que está cifrado en la DB)
        await page.fill('#search-input', 'secreto');
        await expect(page.locator('.record-card')).toHaveCount(1);
    });

    test('debe editar un registro existente', async ({ page }) => {
        await page.selectOption('#user-select', 'editor');

        // Crear
        await page.click('#btn-new');
        await page.fill('#record-name', 'Original');
        await page.click('#btn-save');

        // Editar
        await page.click('.record-card button:has-text("Editar")');
        await page.fill('#record-name', 'Editado');
        await page.click('#btn-save');

        // Verificar
        await expect(page.locator('.record-card h3')).toContainText('Editado');
    });

    test('debe eliminar un registro', async ({ page }) => {
        await page.selectOption('#user-select', 'editor');

        // Crear
        await page.click('#btn-new');
        await page.fill('#record-name', 'Para eliminar');
        await page.click('#btn-save');

        await expect(page.locator('.record-card')).toHaveCount(1);

        // Eliminar
        await page.click('.record-card button:has-text("Eliminar")');
        await expect(page.locator('.record-card')).toHaveCount(0);
    });

    // ============================================================
    // RBAC EN ACCIÓN
    // ============================================================
    test('Viewer no debe ver botones de Editar/Eliminar', async ({ page }) => {
        // Crear como Editor
        await page.selectOption('#user-select', 'editor');
        await page.click('#btn-new');
        await page.fill('#record-name', 'Test');
        await page.click('#btn-save');

        // Cambiar a Viewer
        await page.selectOption('#user-select', 'viewer');

        // Verificar que no hay botones de editar/eliminar
        await expect(page.locator('.record-card button:has-text("Editar")')).toHaveCount(0);
        await expect(page.locator('.record-card button:has-text("Eliminar")')).toHaveCount(0);
    });

    // ============================================================
    // PERSISTENCIA
    // ============================================================
    test('debe persistir datos tras recargar la página', async ({ page }) => {
        await page.selectOption('#user-select', 'editor');

        // Crear
        await page.click('#btn-new');
        await page.fill('#record-name', 'Persistente');
        await page.click('#btn-save');

        await expect(page.locator('.record-card')).toHaveCount(1);

        // Recargar
        await page.reload();
        await page.waitForSelector('header h1');

        // Verificar que persiste
        await expect(page.locator('.record-card')).toHaveCount(1);
        await expect(page.locator('.record-card h3')).toContainText('Persistente');
    });
});