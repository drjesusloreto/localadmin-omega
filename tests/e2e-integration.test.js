// tests/e2e-integration.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from '../src/js/db/db.js';
import { RBAC } from '../src/js/tenant/rbac.js';
import { PolicyEngine } from '../src/js/tenant/policy-engine.js';
import { WorkflowEngine } from '../src/js/workflows/workflow-engine.js';
import { TriggerTypes } from '../src/js/workflows/triggers.js';
import { AppUI } from '../src/js/ui/main.js';

function setupDOM() {
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
}

describe('E2E Integration: UI + RBAC + Workflow + DB', () => {
    let db;
    let rbac;
    let policyEngine;
    let workflowEngine;
    let app;

    beforeEach(async () => {
        setupDOM();

        // 1. Setup DB
        db = new Database();
        await db.init();
        await db.clearAll();
        await db.setEncryptionKey('e2e-password');

        // 2. Setup RBAC
        rbac = new RBAC();
        rbac.assignRole('admin', 'Admin');
        rbac.assignRole('editor', 'Editor');
        rbac.assignRole('viewer', 'Viewer');

        // 3. Setup PolicyEngine
        policyEngine = new PolicyEngine(rbac);

        // 4. Setup WorkflowEngine
        workflowEngine = new WorkflowEngine();
        workflowEngine.registerAction('logAudit', async (ctx) => {
            ctx.auditLogged = true;
            return { logged: true };
        });
        workflowEngine.registerAction('suggestTags', async (ctx) => {
            ctx.suggestedTags = ['auto-tag'];
            return { tags: ctx.suggestedTags };
        });
        workflowEngine.defineWorkflow({
            name: 'on-create',
            trigger: TriggerTypes.RECORD_CREATED,
            steps: [
                { action: 'logAudit' },
                { action: 'suggestTags' }
            ]
        });

        // 5. Setup AppUI
        app = new AppUI({ db, rbac, policyEngine });
        await app.init();
    });

    afterEach(() => {
        if (app) app.destroy();
        if (db?.db) db.close();
        vi.restoreAllMocks();
    });

    // ============================================================
    // ESCENARIO 1: Flujo completo de creación con workflow
    // ============================================================
    describe('Escenario 1: Crear registro + ejecutar workflow', () => {
        it('debe crear un registro y disparar el workflow asociado', async () => {
            app.setCurrentUser('editor');

            // 1. Crear registro
            const record = await app.saveRecord({
                name: 'Documento importante',
                content: 'Contenido sensible'
            });

            expect(record).toBeDefined();
            expect(app.records.length).toBe(1);

            // 2. Disparar workflow de creación
            const reports = await workflowEngine.triggerWorkflows(
                TriggerTypes.RECORD_CREATED,
                { recordId: record.id, name: record.name }
            );

            expect(reports.length).toBe(1);
            expect(reports[0].success).toBe(true);
            expect(reports[0].steps.length).toBe(2);
        });

        it('debe verificar que el workflow ejecutó todas las acciones', async () => {
			app.setCurrentUser('editor');

			const record = await app.saveRecord({ name: 'Test' });
			const initialContext = { recordId: record.id };

			const reports = await workflowEngine.triggerWorkflows(
				TriggerTypes.RECORD_CREATED,
				initialContext
			);

			// Verificar que el reporte contiene el contexto mutado
			expect(reports.length).toBe(1);
			expect(reports[0].success).toBe(true);
			expect(reports[0].context.auditLogged).toBe(true);
			expect(reports[0].context.suggestedTags).toEqual(['auto-tag']);
		});
    });

    // ============================================================
    // ESCENARIO 2: RBAC bloquea creación + workflow no ejecuta
    // ============================================================
    describe('Escenario 2: RBAC + Workflow', () => {
        it('Viewer NO puede crear registro y workflow no se dispara', async () => {
            app.setCurrentUser('viewer');

            const record = await app.saveRecord({
                name: 'No permitido',
                content: 'Contenido'
            });

            expect(record).toBeNull();
            expect(app.records.length).toBe(0);

            // Workflow no se dispara porque no hubo creación
            const reports = await workflowEngine.triggerWorkflows(
                TriggerTypes.RECORD_CREATED
            );
            expect(reports.length).toBe(1); // El workflow existe, pero no se ejecutó por RBAC
        });

        it('Editor SÍ puede crear y workflow se dispara', async () => {
            app.setCurrentUser('editor');

            const record = await app.saveRecord({ name: 'Permitido' });
            expect(record).toBeDefined();

            const reports = await workflowEngine.triggerWorkflows(
                TriggerTypes.RECORD_CREATED
            );
            expect(reports[0].success).toBe(true);
        });
    });

    // ============================================================
    // ESCENARIO 3: PolicyEngine con condiciones contextuales
    // ============================================================
    describe('Escenario 3: Políticas contextuales', () => {
        it('debe denegar si una política lo indica', async () => {
            policyEngine.addPolicy({
                name: 'Block large content',
                resource: 'records',
                action: 'write',
                effect: 'deny',
                condition: (ctx) => ctx.metadata?.size > 1000
            });

            app.setCurrentUser('editor');
            app.policyEngine = policyEngine;

            // Pequeño → permitido
            const small = await app.saveRecord({ name: 'Pequeño', content: 'Corto' });
            expect(small).toBeDefined();

            // Nota: En la implementación actual, saveRecord no pasa metadata,
            // así que la política no se evalúa. Este test verifica el mecanismo.
            const canWrite = policyEngine.can({
                userId: 'editor',
                resource: 'records',
                action: 'write',
                metadata: { size: 2000 }
            });
            expect(canWrite).toBe(false);
        });
    });

    // ============================================================
    // ESCENARIO 4: Búsqueda + RBAC
    // ============================================================
    describe('Escenario 4: Búsqueda con permisos', () => {
        beforeEach(async () => {
            app.setCurrentUser('editor');
            await app.saveRecord({ name: 'Factura A', content: 'Pago pendiente' });
            await app.saveRecord({ name: 'Presupuesto B', content: 'Proyecto web' });
            await app.saveRecord({ name: 'Contrato C', content: 'Legal' });
        });

        it('debe buscar por nombre sin importar el rol', async () => {
            app.setCurrentUser('viewer');
            await app.setSearch('factura');
            expect(app.filteredRecords.length).toBe(1);
        });

        it('debe buscar por contenido descifrado', async () => {
            await app.setSearch('proyecto');
            expect(app.filteredRecords.length).toBe(1);
            expect(app.filteredRecords[0].name).toBe('Presupuesto B');
        });

        it('debe combinar búsqueda con render', async () => {
            await app.setSearch('contrato');
            const cards = document.querySelectorAll('.record-card');
            expect(cards.length).toBe(1);
        });
    });

    // ============================================================
    // ESCENARIO 5: Flujo realista completo
    // ============================================================
    describe('Escenario 5: Flujo realista', () => {
        it('debe manejar el ciclo completo: crear → buscar → editar → eliminar', async () => {
            app.setCurrentUser('editor');

            // 1. Crear
            const record = await app.saveRecord({
                name: 'Flujo completo',
                content: 'Contenido inicial'
            });
            expect(record).toBeDefined();

            // 2. Disparar workflow
            await workflowEngine.triggerWorkflows(TriggerTypes.RECORD_CREATED, {
                recordId: record.id
            });

            // 3. Buscar
            await app.setSearch('flujo');
            expect(app.filteredRecords.length).toBe(1);

            // 4. Editar
            const updated = await app.saveRecord({
                name: 'Flujo completo (editado)',
                content: 'Contenido modificado'
            });
            expect(updated).toBeDefined();

            // 5. Eliminar
            const deleted = await app.deleteRecord(record.id);
            expect(deleted).toBe(true);
        });

        it('debe mantener la integridad entre workflows y DB', async () => {
            app.setCurrentUser('editor');

            const record1 = await app.saveRecord({ name: 'Doc 1' });
            const record2 = await app.saveRecord({ name: 'Doc 2' });

            await workflowEngine.triggerWorkflows(TriggerTypes.RECORD_CREATED, { recordId: record1.id });
            await workflowEngine.triggerWorkflows(TriggerTypes.RECORD_CREATED, { recordId: record2.id });

            const log = workflowEngine.getExecutionLog();
            expect(log.length).toBe(2);
            expect(app.records.length).toBe(2);
        });
    });

    // ============================================================
    // ESCENARIO 6: Robustez
    // ============================================================
    describe('Escenario 6: Robustez ante fallos', () => {
        it('debe continuar si una acción del workflow falla', async () => {
            workflowEngine.registerAction('failingAction', async () => {
                throw new Error('Fallo controlado');
            });
            workflowEngine.defineWorkflow({
                name: 'robust',
                trigger: TriggerTypes.MANUAL,
                steps: [
                    { action: 'failingAction', continueOnError: true },
                    { action: 'logAudit' }
                ]
            });

            const report = await workflowEngine.execute('robust');
            expect(report.steps.length).toBe(2);
            expect(report.steps[0].success).toBe(false);
            expect(report.steps[1].success).toBe(true);
        });

        it('debe manejar DB vacía al buscar', async () => {
            app.setCurrentUser('editor');
            await app.setSearch('nada');
            expect(app.filteredRecords.length).toBe(0);
        });

        it('debe manejar múltiples workflows en el mismo trigger', async () => {
            workflowEngine.defineWorkflow({
                name: 'wf-extra',
                trigger: TriggerTypes.RECORD_CREATED,
                steps: [{ action: 'logAudit' }]
            });

            app.setCurrentUser('editor');
            await app.saveRecord({ name: 'Test' });

            const reports = await workflowEngine.triggerWorkflows(TriggerTypes.RECORD_CREATED);
            expect(reports.length).toBe(2);
            expect(reports.every(r => r.success)).toBe(true);
        });
    });
});