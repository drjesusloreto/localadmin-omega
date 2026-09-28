// tests/sync-engine.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncEngine } from '../src/js/sync/sync-engine.js';

describe('SyncEngine - uploadLocalChanges', () => {
    let syncEngine;
    let mockDb;
    let mockGasClient;
    let mockConflictResolver;

    const mockChanges = [
        {
            change_id: 1,
            record_id: 100,
            operation: 'CREATE',
            data: { id: 100, name: 'Test 1' },
            timestamp: '2026-01-01T00:00:00Z',
            synced: 0
        },
        {
            change_id: 2,
            record_id: 101,
            operation: 'UPDATE',
            data: { id: 101, name: 'Test 2' },
            timestamp: '2026-01-01T00:01:00Z',
            synced: 0
        }
    ];

    beforeEach(() => {
        mockDb = {
            getUnsyncedChanges: vi.fn().mockResolvedValue(mockChanges),
            markChangeSynced: vi.fn().mockResolvedValue(true)
        };
        mockGasClient = {
            syncMetadata: vi.fn().mockResolvedValue({ success: true })
        };
        mockConflictResolver = {};

        syncEngine = new SyncEngine(mockDb, mockGasClient, mockConflictResolver);
    });

    it('debe subir cambios correctamente', async () => {
        const report = await syncEngine.uploadLocalChanges();

        expect(report.uploaded).toBe(2);
        expect(report.failed).toBe(0);
        expect(mockGasClient.syncMetadata).toHaveBeenCalledTimes(2);
        expect(mockDb.markChangeSynced).toHaveBeenCalledTimes(2);
    });

    it('debe retornar reporte vacío si no hay cambios', async () => {
        mockDb.getUnsyncedChanges.mockResolvedValue([]);
        const report = await syncEngine.uploadLocalChanges();

        expect(report.uploaded).toBe(0);
        expect(report.failed).toBe(0);
        expect(mockGasClient.syncMetadata).not.toHaveBeenCalled();
    });

    it('debe manejar fallos de gasClient sin detener el proceso', async () => {
        mockGasClient.syncMetadata
            .mockResolvedValueOnce({ success: true })
            .mockRejectedValueOnce(new Error('Network error'));

        const report = await syncEngine.uploadLocalChanges();

        expect(report.uploaded).toBe(1);
        expect(report.failed).toBe(1);
        expect(report.errors.length).toBe(1);
    });

    it('debe manejar respuesta con success: false', async () => {
        mockGasClient.syncMetadata.mockResolvedValue({ 
            success: false, 
            error: 'Error de GAS' 
        });

        const report = await syncEngine.uploadLocalChanges();

        expect(report.uploaded).toBe(0);
        expect(report.failed).toBe(2);
        expect(report.errors.length).toBe(2);
    });

    it('debe manejar error en getUnsyncedChanges', async () => {
        mockDb.getUnsyncedChanges.mockRejectedValue(new Error('DB error'));

        const report = await syncEngine.uploadLocalChanges();

        expect(report.uploaded).toBe(0);
        expect(report.failed).toBe(0);
        expect(report.errors.length).toBe(1);
        expect(report.errors[0].phase).toBe('getChanges');
    });

    it('debe guardar el último reporte de sincronización', async () => {
        await syncEngine.uploadLocalChanges();
        const lastReport = syncEngine.getLastSyncReport();

        expect(lastReport).toBeDefined();
        expect(lastReport.uploaded).toBe(2);
    });
});
describe('SyncEngine - downloadRemoteChanges', () => {
    let syncEngine;
    let mockDb;
    let mockGasClient;
    let mockConflictResolver;

    const remoteChanges = [
        {
            change_id: 10,
            record_id: 200,
            operation: 'CREATE',
            data: { id: 200, name: 'Remote 1', _vc: { deviceId: 'B', clock: { B: 1 } } },
            timestamp: '2026-01-01T00:00:00Z'
        },
        {
            change_id: 11,
            record_id: 201,
            operation: 'UPDATE',
            data: { id: 201, name: 'Remote 2', _vc: { deviceId: 'B', clock: { B: 2 } } },
            timestamp: '2026-01-01T00:01:00Z'
        }
    ];

    beforeEach(() => {
        mockDb = {
            getLastChangeId: vi.fn().mockResolvedValue(5),
            setLastChangeId: vi.fn().mockResolvedValue(true),
            getRecord: vi.fn().mockResolvedValue(null),
            _tx: vi.fn().mockResolvedValue(true)
        };
        mockGasClient = {
            getChangesSince: vi.fn().mockResolvedValue({ changes: remoteChanges })
        };
        mockConflictResolver = {
            resolve: vi.fn().mockReturnValue({
                winner: remoteChanges[0].data,
                resolution: 'remote-new'
            })
        };

        syncEngine = new SyncEngine(mockDb, mockGasClient, mockConflictResolver);
    });

    it('debe descargar y aplicar cambios remotos', async () => {
		const report = await syncEngine.downloadRemoteChanges();

		// Si algo falla, el log nos dice por qué
		if (report.applied !== 2) {
			console.log('DEBUG report:', JSON.stringify(report, null, 2));
		}

		expect(report.downloaded).toBe(2);
		expect(report.applied).toBe(2);
		expect(report.newLastChangeId).toBe(11);
		expect(mockDb.setLastChangeId).toHaveBeenCalledWith(11);
	});

    it('debe retornar reporte vacío si no hay cambios remotos', async () => {
        mockGasClient.getChangesSince.mockResolvedValue({ changes: [] });
        const report = await syncEngine.downloadRemoteChanges();

        expect(report.downloaded).toBe(0);
        expect(report.applied).toBe(0);
    });

    it('debe manejar error en getChangesSince', async () => {
        mockGasClient.getChangesSince.mockRejectedValue(new Error('Network error'));
        const report = await syncEngine.downloadRemoteChanges();

        expect(report.errors.length).toBe(1);
        expect(report.errors[0].phase).toBe('getChangesSince');
    });

    it('debe manejar error en getLastChangeId', async () => {
        mockDb.getLastChangeId.mockRejectedValue(new Error('DB error'));
        const report = await syncEngine.downloadRemoteChanges();

        expect(report.errors.length).toBe(1);
        expect(report.errors[0].phase).toBe('getLastChangeId');
    });

    it('debe resolver conflictos con ConflictResolver', async () => {
        const localRecord = { id: 200, name: 'Local', _vc: { deviceId: 'A', clock: { A: 1 } } };
        mockDb.getRecord.mockResolvedValue(localRecord);
        mockConflictResolver.resolve.mockReturnValue({
            winner: remoteChanges[0].data,
            resolution: 'remote-wins'
        });

        const report = await syncEngine.downloadRemoteChanges();

        expect(mockConflictResolver.resolve).toHaveBeenCalled();
        expect(report.applied).toBeGreaterThan(0);
    });

    it('debe ignorar cambios con resolution "equal"', async () => {
        mockDb.getRecord.mockResolvedValue({ id: 200 });
        mockConflictResolver.resolve.mockReturnValue({ resolution: 'equal' });

        const report = await syncEngine.downloadRemoteChanges();

        expect(report.applied).toBe(0);
    });

    it('debe ignorar cambios con resolution "local-wins"', async () => {
        mockDb.getRecord.mockResolvedValue({ id: 200 });
        mockConflictResolver.resolve.mockReturnValue({ resolution: 'local-wins' });

        const report = await syncEngine.downloadRemoteChanges();

        // Ambos cambios se cuentan como "applied" porque se procesan
        // pero el registro local NO se modifica
        expect(report.applied).toBe(2);
        expect(mockDb._tx).not.toHaveBeenCalled();
    });
});
describe('SyncEngine - sync bidireccional', () => {
    let syncEngine;
    let mockDb;
    let mockGasClient;
    let mockConflictResolver;

    beforeEach(() => {
        mockDb = {
            getUnsyncedChanges: vi.fn().mockResolvedValue([]),
            markChangeSynced: vi.fn().mockResolvedValue(true),
            getLastChangeId: vi.fn().mockResolvedValue(0),
            setLastChangeId: vi.fn().mockResolvedValue(true),
            getRecord: vi.fn().mockResolvedValue(null),
            _tx: vi.fn().mockResolvedValue(true)
        };
        mockGasClient = {
            syncMetadata: vi.fn().mockResolvedValue({ success: true }),
            getChangesSince: vi.fn().mockResolvedValue({ changes: [] })
        };
        mockConflictResolver = {
            resolve: vi.fn()
        };

        syncEngine = new SyncEngine(mockDb, mockGasClient, mockConflictResolver);
    });

    it('debe ejecutar sincronización bidireccional completa', async () => {
        const report = await syncEngine.sync();

        expect(report.upload).toBeDefined();
        expect(report.download).toBeDefined();
        expect(report.success).toBe(true);
        expect(report.duration).toBeGreaterThanOrEqual(0);
    });

    it('debe retornar success: false si hay errores', async () => {
        mockGasClient.syncMetadata.mockRejectedValue(new Error('Upload error'));
        mockDb.getUnsyncedChanges.mockResolvedValue([{ change_id: 1, data: {} }]);

        const report = await syncEngine.sync();

        expect(report.success).toBe(false);
    });

    it('debe guardar el último reporte de sync', async () => {
        await syncEngine.sync();
        const lastReport = syncEngine.getLastSyncReport();

        expect(lastReport).toBeDefined();
        expect(lastReport.timestamp).toBeDefined();
    });
});