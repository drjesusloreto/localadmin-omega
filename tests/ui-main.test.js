// tests/ui-main.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppUI } from '../src/js/ui/main.js';
import { Database } from '../src/js/db/db.js';

/**
 * Helper para crear el HTML mínimo necesario para los tests.
 */
function setupDOM() {
	const modal = document.getElementById('record-modal');
	if (modal && !modal.showModal) {
		modal.showModal = function() { this.open = true; };
		modal.close = function() { this.open = false; };
	};
    document.body.innerHTML = `
        <select id="user-select">
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="viewer" selected>Viewer</option>
        </select>
        <input type="search" id="search-input">
        <button id="btn-new">Nuevo</button>
        <div id="records-list"></div>
        <div id="empty-state" style="display: none;"></div>
        <dialog id="record-modal">
            <form id="record-form">
                <h2 id="modal-title">Nuevo</h2>
                <input type="text" id="record-name">
                <textarea id="record-content"></textarea>
                <input type="text" id="record-category" value="general">
                <button type="button" id="btn-cancel">Cancelar</button>
                <button type="submit" id="btn-save">Guardar</button>
            </form>
        </dialog>
    `;
    // NO intentar sobrescribir showModal/close: happy-dom ya los implementa
}

describe('AppUI', () => {
    let app;
    let db;

    beforeEach(async () => {
		setupDOM();
		
		// 1. Crear DB nueva
		db = new Database();
		await db.init();
		
		// 2. LIMPIAR TODOS LOS STORES (evita contaminación entre tests)
		await db.clearAll();
		await db.setEncryptionKey('ui-test-password');

		// 3. Crear AppUI con la DB ya limpia
		app = new AppUI({ db });
		await app.init();
	});

	afterEach(() => {
		if (app) app.destroy();
		if (db?.db) db.close();
		vi.restoreAllMocks();
	});

    // ============================================================
    // INIT
    // ============================================================
    describe('init', () => {
        it('debe inicializar la DB y el RBAC', () => {
            expect(app.db).toBeDefined();
            expect(app.rbac).toBeDefined();
            expect(app.policyEngine).toBeDefined();
        });

        it('debe cargar registros vacíos al inicio', () => {
            expect(app.records.length).toBe(0);
            expect(app.filteredRecords.length).toBe(0);
        });

        it('debe asignar roles por defecto', () => {
            expect(app.rbac.getRole('admin')).toBe('Admin');
            expect(app.rbac.getRole('editor')).toBe('Editor');
            expect(app.rbac.getRole('viewer')).toBe('Viewer');
        });
    });

    // ============================================================
    // RBAC + POLICY ENGINE
    // ============================================================
    describe('control de acceso', () => {
        it('Viewer NO puede crear registros', () => {
            app.setCurrentUser('viewer');
            expect(app.can('records', 'write')).toBe(false);
        });

        it('Editor SÍ puede crear registros', () => {
            app.setCurrentUser('editor');
            expect(app.can('records', 'write')).toBe(true);
        });

        it('Admin puede hacer todo', () => {
            app.setCurrentUser('admin');
            expect(app.can('records', 'write')).toBe(true);
            expect(app.can('records', 'delete')).toBe(true);
        });

        it('Viewer SÍ puede leer', () => {
            app.setCurrentUser('viewer');
            expect(app.can('records', 'read')).toBe(true);
        });
    });

    // ============================================================
    // CRUD A TRAVÉS DE LA UI
    // ============================================================
    describe('saveRecord', () => {
        it('Editor puede crear un registro', async () => {
            app.setCurrentUser('editor');
            const saved = await app.saveRecord({
                name: 'Nuevo registro',
                content: 'Contenido'
            });

            expect(saved).toBeDefined();
            expect(saved.name).toBe('Nuevo registro');
            expect(app.records.length).toBe(1);
        });

        it('Viewer NO puede crear registro', async () => {
            app.setCurrentUser('viewer');
            const result = await app.saveRecord({ name: 'Test' });
            expect(result).toBeNull();
        });
    });

    describe('deleteRecord', () => {
        it('Editor puede eliminar', async () => {
            app.setCurrentUser('editor');
            const created = await app.saveRecord({ name: 'Test' });
            const result = await app.deleteRecord(created.id);
            expect(result).toBe(true);
        });

        it('Viewer NO puede eliminar', async () => {
            app.setCurrentUser('editor');
            const created = await app.saveRecord({ name: 'Test' });
            app.setCurrentUser('viewer');
            const result = await app.deleteRecord(created.id);
            expect(result).toBe(false);
        });
    });

    // ============================================================
    // BÚSQUEDA
    // ============================================================
    describe('setSearch', () => {
		beforeEach(async () => {
			app.setCurrentUser('editor');
			
			// Verificar DB limpia
			expect(app.records.length).toBe(0);
			
			await app.saveRecord({ name: 'Factura A', content: 'Pago pendiente' });
			await app.saveRecord({ name: 'Presupuesto B', content: 'Proyecto web' });
			await app.saveRecord({ name: 'Contrato C', content: 'Legal importante' });
		});

		it('debe filtrar por nombre', async () => {
			await app.setSearch('factura');
			expect(app.filteredRecords.length).toBe(1);
			expect(app.filteredRecords[0].name).toBe('Factura A');
		});

		it('debe filtrar por contenido descifrado', async () => {
			await app.setSearch('proyecto');
			expect(app.filteredRecords.length).toBe(1);
			expect(app.filteredRecords[0].name).toBe('Presupuesto B');
		});

		it('debe retornar todos si la búsqueda está vacía', async () => {
			await app.setSearch('');
			expect(app.filteredRecords.length).toBe(3);
		});

		it('debe retornar vacío si no hay coincidencias', async () => {
			await app.setSearch('xyz123');
			expect(app.filteredRecords.length).toBe(0);
		});

		it('debe buscar en tags también', async () => {
			await app.saveRecord({ 
				name: 'Doc especial', 
				content: 'Contenido', 
				tags: ['importante', 'urgente'] 
			});
			await app.setSearch('urgente');
			expect(app.filteredRecords.length).toBe(1);
			expect(app.filteredRecords[0].name).toBe('Doc especial');
		});
	});

    // ============================================================
    // RENDER
    // ============================================================
    describe('render', () => {
        it('debe renderizar tarjetas para cada registro', async () => {
            app.setCurrentUser('editor');
            await app.saveRecord({ name: 'Registro 1' });
            await app.saveRecord({ name: 'Registro 2' });

            const cards = document.querySelectorAll('.record-card');
            expect(cards.length).toBe(2);
        });
		it('debe mostrar estado vacío cuando no hay registros', () => {
            app.render();
            const emptyEl = document.getElementById('empty-state');
            expect(emptyEl.style.display).not.toBe('none');
        });

        it('debe deshabilitar el botón Nuevo para Viewer', () => {
            app.setCurrentUser('viewer');
            app.render();
            const newBtn = document.getElementById('btn-new');
            expect(newBtn.disabled).toBe(true);
        });

        it('debe habilitar el botón Nuevo para Editor', () => {
            app.setCurrentUser('editor');
            app.render();
            const newBtn = document.getElementById('btn-new');
            expect(newBtn.disabled).toBe(false);
        });
    });

    // ============================================================
    // MODAL
    // ============================================================
   describe('modal', () => {
		it('openModalForCreate debe abrir el modal para Editor', () => {
			app.setCurrentUser('editor');
			app.openModalForCreate();
			const modal = document.getElementById('record-modal');
			expect(modal.open).toBe(true);
		});

		it('openModalForCreate NO debe abrir para Viewer', () => {
			app.setCurrentUser('viewer');
			app.openModalForCreate();
			const modal = document.getElementById('record-modal');
			expect(modal.open).toBe(false);
		});

		it('closeModal debe cerrar el modal', () => {
			app.setCurrentUser('editor');
			app.openModalForCreate();
			app.closeModal();
			const modal = document.getElementById('record-modal');
			expect(modal.open).toBe(false);
		});
	});
});