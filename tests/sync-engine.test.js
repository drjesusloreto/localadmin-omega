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