// tests/sync-integration.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from '../src/js/db/db.js';
import { GasClient } from '../src/js/sync/gas-client.js';
import { ConflictResolver } from '../src/js/sync/conflict-resolver.js';
import { SyncEngine } from '../src/js/sync/sync-engine.js';

describe('Integración Nivel 4: db + gas-client + conflict-resolver + sync-engine', () => {
    let db;
    let gasClient;
    let conflictResolver;
    let syncEngine;
    const TEST_PASSWORD = 'integration-test-password';

    beforeEach(async () => {
        // 1. Crear DB real con fake-indexeddb
        db = new Database();
        await db.init();
        await db.clearAll();
        await db.setEncryptionKey(TEST_PASSWORD);

        // 2. Crear GasClient con mock de fetch
        gasClient = new GasClient({
            webAppUrl: 'https://mock-gas.com',
            maxRetries: 0,
            retryDelay: 10,
            timeout: 1000
        });

        // 3. Crear ConflictResolver real
        conflictResolver = new ConflictResolver();

        // 4. Crear SyncEngine con dependencias reales
        syncEngine = new SyncEngine(db, gasClient, conflictResolver);
    });

    afterEach(() => {
        if (db?.db) db.close();
        vi.restoreAllMocks();
    });

    // ============================================================
    // ESCENARIO 1: Upload integrado
    // ============================================================
    describe('Escenario 1: Upload integrado con DB real', () => {
        it('debe crear un registro, generar change log y subirlo', async () => {
            // 1. Crear registro (genera change log)
            const record = await db.createRecord({
                name: 'Registro integrado',
                content: 'Contenido de prueba'
            });

            expect(record.id).toBeDefined();

            // 2. Verificar change log
            const changes = await db.getUnsyncedChanges();
            expect(changes.length).toBe(1);
            expect(changes[0].operation).toBe('CREATE');

            // 3. Mock de gasClient.syncMetadata
            vi.spyOn(gasClient, 'syncMetadata').mockResolvedValue({ success: true });

            // 4. Subir cambios
            const report = await syncEngine.uploadLocalChanges();

            expect(report.uploaded).toBe(1);
            expect(report.failed).toBe(0);

            // 5. Verificar que el change log se marcó como synced
            const unsyncedAfter = await db.getUnsyncedChanges();
            expect(unsyncedAfter.length).toBe(0);
        });

        it('debe manejar fallo de GAS sin perder cambios', async () => {
            await db.createRecord({ name: 'Test', content: 'Contenido' });

            vi.spyOn(gasClient, 'syncMetadata').mockRejectedValue(new Error('GAS offline'));

            const report = await syncEngine.uploadLocalChanges();

            expect(report.uploaded).toBe(0);
            expect(report.failed).toBe(1);
            expect(report.errors.length).toBe(1);

            // Los cambios siguen en la DB como no sincronizados
            const unsynced = await db.getUnsyncedChanges();
            expect(unsynced.length).toBe(1);
        });
    });

    // ============================================================
    // ESCENARIO 2: Download integrado
    // ============================================================
    describe('Escenario 2: Download integrado con DB real', () => {
        it('debe descargar un registro remoto nuevo y aplicarlo', async () => {
            const remoteChanges = [
                {
                    change_id: 100,
                    record_id: 5000,
                    operation: 'CREATE',
                    data: {
                        id: 5000,
                        name: 'Remoto nuevo',
                        content: 'Contenido remoto',
                        _vc: { deviceId: 'dev_B', clock: { dev_B: 1 } },
                        updated_at: new Date().toISOString()
                    },
                    timestamp: new Date().toISOString()
                }
            ];

            vi.spyOn(gasClient, 'getChangesSince').mockResolvedValue({
                changes: remoteChanges
            });

            const report = await syncEngine.downloadRemoteChanges();

            expect(report.downloaded).toBe(1);
            expect(report.applied).toBe(1);

            // Verificar que el registro remoto está en la DB local
            const localRecord = await db.getRecord(5000);
            expect(localRecord).toBeDefined();
            expect(localRecord.name).toBe('Remoto nuevo');
            expect(localRecord.is_dirty).toBe(0);
        });

        it('debe resolver conflicto concurrent con field-merge', async () => {
            // 1. Crear registro local
            const localRecord = await db.createRecord({
                name: 'Local Name',
                content: 'Local Content'
            });

            // 2. Simular cambio remoto con vector clock concurrente
            const remoteChange = {
                change_id: 200,
                record_id: localRecord.id,
                operation: 'UPDATE',
                data: {
                    ...localRecord,
                    name: 'Remote Name',
                    _vc: { deviceId: 'dev_B', clock: { dev_A: 1, dev_B: 1 } },
                    updated_at: new Date(Date.now() + 1000).toISOString()
                },
                timestamp: new Date().toISOString()
            };

            vi.spyOn(gasClient, 'getChangesSince').mockResolvedValue({
                changes: [remoteChange]
            });

            const report = await syncEngine.downloadRemoteChanges();

            expect(report.downloaded).toBe(1);
            expect(report.applied).toBeGreaterThan(0);

            // Verificar que el registro se actualizó (por LWW o field-merge)
            const updated = await db.getRecord(localRecord.id);
            expect(updated).toBeDefined();
            // El nombre debería ser el remoto (más reciente)
            expect(updated.name).toBe('Remote Name');
        });

        it('debe actualizar lastChangeId después de descargar', async () => {
            const remoteChanges = [
                { change_id: 10, record_id: 1, operation: 'CREATE', data: { id: 1, name: 'A', _vc: {} }, timestamp: '2026-01-01T00:00:00Z' },
                { change_id: 20, record_id: 2, operation: 'CREATE', data: { id: 2, name: 'B', _vc: {} }, timestamp: '2026-01-01T00:01:00Z' }
            ];

            vi.spyOn(gasClient, 'getChangesSince').mockResolvedValue({ changes: remoteChanges });

            await syncEngine.downloadRemoteChanges();

            const lastId = await db.getLastChangeId();
            expect(lastId).toBe(20);
        });
    });

    // ============================================================
    // ESCENARIO 3: Sync bidireccional completo
    // ============================================================
    describe('Escenario 3: Sync bidireccional completo', () => {
        it('debe subir cambios locales y descargar remotos en un solo sync', async () => {
            // 1. Crear registro local (genera change log)
            await db.createRecord({ name: 'Local', content: 'Contenido local' });

            // 2. Mock de gasClient
            vi.spyOn(gasClient, 'syncMetadata').mockResolvedValue({ success: true });
            vi.spyOn(gasClient, 'getChangesSince').mockResolvedValue({
                changes: [{
                    change_id: 300,
                    record_id: 6000,
                    operation: 'CREATE',
                    data: { id: 6000, name: 'Remoto', _vc: {}, updated_at: new Date().toISOString() },
                    timestamp: new Date().toISOString()
                }]
            });

            // 3. Ejecutar sync
            const report = await syncEngine.sync();

            expect(report.success).toBe(true);
            expect(report.upload.uploaded).toBe(1);
            expect(report.download.downloaded).toBe(1);
            expect(report.download.applied).toBe(1);

            // 4. Verificar estado final
            const local = await db.getAllRecords();
            expect(local.length).toBe(2); // 1 local + 1 remoto
        });

        it('debe retornar success: false si falla la subida', async () => {
            await db.createRecord({ name: 'Test', content: 'Contenido' });

            vi.spyOn(gasClient, 'syncMetadata').mockRejectedValue(new Error('Falló GAS'));
            vi.spyOn(gasClient, 'getChangesSince').mockResolvedValue({ changes: [] });

            const report = await syncEngine.sync();

            expect(report.success).toBe(false);
            expect(report.upload.failed).toBeGreaterThan(0);
        });

        it('debe retornar success: false si falla la descarga', async () => {
            vi.spyOn(gasClient, 'syncMetadata').mockResolvedValue({ success: true });
            vi.spyOn(gasClient, 'getChangesSince').mockRejectedValue(new Error('Falló GAS'));

            const report = await syncEngine.sync();

            expect(report.success).toBe(false);
            expect(report.download.errors.length).toBeGreaterThan(0);
        });
    });

    // ============================================================
    // ESCENARIO 4: Robustez ante fallos
    // ============================================================
    describe('Escenario 4: Robustez', () => {
        it('debe manejar múltiples registros en change log sin duplicar', async () => {
            // Crear 3 registros
            await db.createRecord({ name: 'A', content: 'A' });
            await db.createRecord({ name: 'B', content: 'B' });
            await db.createRecord({ name: 'C', content: 'C' });

            const changes = await db.getUnsyncedChanges();
            expect(changes.length).toBe(3);

            vi.spyOn(gasClient, 'syncMetadata').mockResolvedValue({ success: true });

            const report = await syncEngine.uploadLocalChanges();
            expect(report.uploaded).toBe(3);

            const after = await db.getUnsyncedChanges();
            expect(after.length).toBe(0);
        });

        it('debe reintentar cambios fallidos en una segunda sync', async () => {
            await db.createRecord({ name: 'Test', content: 'Contenido' });

            // Primera sync: falla
            vi.spyOn(gasClient, 'syncMetadata').mockRejectedValueOnce(new Error('Temporal'));
            const report1 = await syncEngine.uploadLocalChanges();
            expect(report1.failed).toBe(1);

            // Segunda sync: éxito
            vi.spyOn(gasClient, 'syncMetadata').mockResolvedValue({ success: true });
            const report2 = await syncEngine.uploadLocalChanges();
            expect(report2.uploaded).toBe(1);

            const after = await db.getUnsyncedChanges();
            expect(after.length).toBe(0);
        });
    });
});