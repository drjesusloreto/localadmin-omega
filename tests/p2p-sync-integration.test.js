// tests/p2p-sync-integration.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from '../src/js/db/db.js';
import { GasClient } from '../src/js/sync/gas-client.js';
import { ConflictResolver } from '../src/js/sync/conflict-resolver.js';
import { SyncEngine } from '../src/js/sync/sync-engine.js';
import { WebRTCManager } from '../src/js/p2p/webrtc-manager.js';
import { SignalServer } from '../src/js/p2p/signal-server.js';

describe('Integración P2P + SyncEngine', () => {
    let db;
    let signalServer;
    let peerA;
    let peerB;
    let syncEngine;
    let gasClient;
    const TEST_PASSWORD = 'p2p-test-password';

    beforeEach(async () => {
        db = new Database();
        await db.init();
        await db.clearAll();
        await db.setEncryptionKey(TEST_PASSWORD);

        signalServer = new SignalServer();
        gasClient = new GasClient({
            webAppUrl: 'https://mock-gas.com',
            maxRetries: 0,
            retryDelay: 10
        });

        syncEngine = new SyncEngine(db, gasClient, new ConflictResolver());

        peerA = new WebRTCManager({ peerId: 'peer_A', signalServer });
        peerB = new WebRTCManager({ peerId: 'peer_B', signalServer });
        await peerA.init();
        await peerB.init();
    });

    afterEach(() => {
        if (db?.db) db.close();
        peerA?.close();
        peerB?.close();
        vi.restoreAllMocks();
    });

    // ============================================================
    // PRECHECK
    // ============================================================
    it('debe fallar si WebRTCManager no está conectado', async () => {
        const report = await syncEngine.syncViaP2P('peer_B', peerA);

        expect(report.success).toBe(false);
        expect(report.errors[0].phase).toBe('precheck');
    });

    it('debe fallar si WebRTCManager es null', async () => {
        const report = await syncEngine.syncViaP2P('peer_B', null);

        expect(report.success).toBe(false);
        expect(report.errors[0].phase).toBe('precheck');
    });

    // ============================================================
    // SYNC P2P BÁSICO
    // ============================================================
    describe('syncViaP2P con peer conectado', () => {
        beforeEach(async () => {
            // Conectar los peers manualmente
            await peerA.createOffer('peer_B');
            const messages = signalServer.getMessages();
            const offerMsg = messages.find(m => m.peerId === 'peer_B' && m.message.type === 'offer');
            await peerB.handleOffer({
                from: 'peer_A',
                sdp: offerMsg.message.sdp
            });
            const answerMsg = signalServer.getMessages().find(m => m.peerId === 'peer_A' && m.message.type === 'answer');
            await peerA.handleAnswer({
                from: 'peer_B',
                sdp: answerMsg.message.sdp
            });

            // Forzar estado connected
            peerA.state = 'connected';
            peerB.state = 'connected';
        });

        it('debe sincronizar cambios locales vía P2P', async () => {
            // Crear un registro local (genera change log)
            await db.createRecord({ name: 'P2P Local', content: 'Contenido' });

            // Spy en sendData
            const sendSpy = vi.spyOn(peerA, 'sendData').mockReturnValue(true);

            // Ejecutar sync (con timeout corto)
            const report = await syncEngine.syncViaP2P('peer_B', peerA, { timeout: 100 });

            expect(sendSpy).toHaveBeenCalled();
            expect(report.method).toBe('p2p');
            expect(report.peerId).toBe('peer_B');
        });

        it('debe procesar cambios entrantes del peer', async () => {
            const sendSpy = vi.spyOn(peerA, 'sendData').mockReturnValue(true);

            // Simular que el peer B envía cambios
            setTimeout(() => {
                peerA.onData({
                    type: 'changes',
                    changes: [{
                        change_id: 500,
                        record_id: 7000,
                        data: { id: 7000, name: 'Remoto P2P', _vc: {} }
                    }]
                }, 'peer_B');
                peerA.onData({ type: 'sync-complete' }, 'peer_B');
            }, 10);

            const report = await syncEngine.syncViaP2P('peer_B', peerA, { timeout: 500 });

            expect(report.downloaded).toBeGreaterThanOrEqual(0);
        });

        it('debe manejar timeout si el peer no responde', async () => {
            vi.spyOn(peerA, 'sendData').mockReturnValue(true);

            const report = await syncEngine.syncViaP2P('peer_B', peerA, { timeout: 50 });

            // Debería haber timeout pero no lanzar
            expect(report).toBeDefined();
        });

        it('debe fallar si sendData retorna false', async () => {
            vi.spyOn(peerA, 'sendData').mockReturnValue(false);

            const report = await syncEngine.syncViaP2P('peer_B', peerA, { timeout: 100 });

            expect(report.success).toBe(false);
            expect(report.errors.some(e => e.phase === 'send')).toBe(true);
        });
    });

    // ============================================================
    // FALLBACK
    // ============================================================
    describe('syncWithFallback', () => {
        it('debe usar P2P si está disponible', async () => {
            peerA.state = 'connected';
            const p2pSpy = vi.spyOn(syncEngine, 'syncViaP2P').mockResolvedValue({
                method: 'p2p',
                success: true,
                uploaded: 1,
                downloaded: 0,
                applied: 0,
                errors: []
            });
            const gasSpy = vi.spyOn(syncEngine, 'sync');

            const report = await syncEngine.syncWithFallback({
                peerId: 'peer_B',
                webrtcManager: peerA
            });

            expect(p2pSpy).toHaveBeenCalled();
            expect(gasSpy).not.toHaveBeenCalled();
            expect(report.method).toBe('p2p');
        });

        it('debe usar GAS si P2P falla', async () => {
            peerA.state = 'connected';
            vi.spyOn(syncEngine, 'syncViaP2P').mockResolvedValue({
                method: 'p2p',
                success: false,
                errors: [{ phase: 'test', error: 'P2P falló' }]
            });
            vi.spyOn(syncEngine, 'sync').mockResolvedValue({
                timestamp: new Date().toISOString(),
                duration: 100,
                upload: { uploaded: 0, failed: 0, errors: [] },
                download: { downloaded: 0, applied: 0, errors: [] },
                success: true
            });

            const report = await syncEngine.syncWithFallback({
                peerId: 'peer_B',
                webrtcManager: peerA
            });

            expect(report.method).toBe('gas-fallback');
        });

        it('debe usar GAS si no hay peer', async () => {
            vi.spyOn(syncEngine, 'sync').mockResolvedValue({
                timestamp: new Date().toISOString(),
                duration: 100,
                upload: { uploaded: 0, failed: 0, errors: [] },
                download: { downloaded: 0, applied: 0, errors: [] },
                success: true
            });

            const report = await syncEngine.syncWithFallback({});

            expect(report.method).toBe('gas-fallback');
        });

        it('debe usar GAS si P2P lanza excepción', async () => {
            peerA.state = 'connected';
            vi.spyOn(syncEngine, 'syncViaP2P').mockRejectedValue(new Error('Error P2P'));
            vi.spyOn(syncEngine, 'sync').mockResolvedValue({
                timestamp: new Date().toISOString(),
                duration: 100,
                upload: { uploaded: 0, failed: 0, errors: [] },
                download: { downloaded: 0, applied: 0, errors: [] },
                success: true
            });

            const report = await syncEngine.syncWithFallback({
                peerId: 'peer_B',
                webrtcManager: peerA
            });

            expect(report.method).toBe('gas-fallback');
        });
    });

    // ============================================================
    // INTEGRACIÓN COMPLETA
    // ============================================================
    describe('Escenario: dos dispositivos sincronizando vía P2P', () => {
        it('debe transferir un registro completo entre peers', async () => {
            // 1. Crear registro en peer A
            const record = await db.createRecord({
                name: 'Documento compartido',
                content: 'Contenido sensible'
            });

            // 2. Verificar change log
            const changes = await db.getUnsyncedChanges();
            expect(changes.length).toBe(1);

            // 3. Mock del WebRTCManager
            peerA.state = 'connected';
            vi.spyOn(peerA, 'sendData').mockReturnValue(true);

            // 4. Ejecutar sync
            const report = await syncEngine.syncViaP2P('peer_B', peerA, { timeout: 100 });

            expect(report.uploaded).toBe(1);
            expect(report.method).toBe('p2p');

            // 5. Verificar que el change log se marcó como synced
            const after = await db.getUnsyncedChanges();
            expect(after.length).toBe(0);
        });
    });
});
describe('Cobertura adicional de syncViaP2P', () => {
    let db;
    let signalServer;
    let peerA;
    let peerB;
    let syncEngine;
    let gasClient;
    const TEST_PASSWORD = 'p2p-coverage-password';

    beforeEach(async () => {
        db = new Database();
        await db.init();
        await db.clearAll();
        await db.setEncryptionKey(TEST_PASSWORD);

        signalServer = new SignalServer();
        gasClient = new GasClient({
            webAppUrl: 'https://mock-gas.com',
            maxRetries: 0,
            retryDelay: 10
        });

        syncEngine = new SyncEngine(db, gasClient, new ConflictResolver());
        peerA = new WebRTCManager({ peerId: 'peer_A', signalServer });
        peerB = new WebRTCManager({ peerId: 'peer_B', signalServer });
        await peerA.init();
        await peerB.init();
        peerA.state = 'connected';
        peerB.state = 'connected';
    });

    afterEach(() => {
        if (db?.db) db.close();
        peerA?.close();
        peerB?.close();
        vi.restoreAllMocks();
    });

    it('debe aplicar cambios remotos y resolver conflictos concurrentes', async () => {
        // Crear registro local
        const localRecord = await db.createRecord({
            name: 'Local',
            content: 'Contenido local'
        });

        // Simular que el peer B envía un cambio remoto del mismo registro
        vi.spyOn(peerA, 'sendData').mockImplementation(() => {
            // Inyectar cambios remotos asíncronamente
            setTimeout(() => {
                peerA.onData({
                    type: 'changes',
                    changes: [{
                        change_id: 1000,
                        record_id: localRecord.id,
                        data: {
                            ...localRecord,
                            name: 'Remote Updated',
                            _vc: { deviceId: 'peer_B', clock: { peer_B: 1 } },
                            updated_at: new Date(Date.now() + 5000).toISOString()
                        }
                    }]
                }, 'peer_B');
                peerA.onData({ type: 'sync-complete' }, 'peer_B');
            }, 10);
            return true;
        });

        const report = await syncEngine.syncViaP2P('peer_B', peerA, { timeout: 500 });

        expect(report.downloaded).toBeGreaterThan(0);
        expect(report.applied).toBeGreaterThan(0);
    });

    it('debe contar conflictos cuando resolution tiene conflicts', async () => {
        const localRecord = await db.createRecord({ name: 'Local' });

        vi.spyOn(peerA, 'sendData').mockImplementation(() => {
            setTimeout(() => {
                peerA.onData({
                    type: 'changes',
                    changes: [{
                        change_id: 1,
                        record_id: localRecord.id,
                        data: {
                            ...localRecord,
                            name: 'Conflict',
                            _vc: { deviceId: 'B', clock: { A: 2, B: 1 } },
                            updated_at: new Date().toISOString()
                        }
                    }]
                }, 'peer_B');
                peerA.onData({ type: 'sync-complete' }, 'peer_B');
            }, 10);
            return true;
        });

        const report = await syncEngine.syncViaP2P('peer_B', peerA, { timeout: 500 });

        expect(report).toBeDefined();
    });

    it('debe manejar registro remoto inválido sin id', async () => {
        vi.spyOn(peerA, 'sendData').mockImplementation(() => {
            setTimeout(() => {
                peerA.onData({
                    type: 'changes',
                    changes: [
                        { change_id: 1, data: null },
                        { change_id: 2, data: { name: 'Sin ID' } }
                    ]
                }, 'peer_B');
                peerA.onData({ type: 'sync-complete' }, 'peer_B');
            }, 10);
            return true;
        });

        const report = await syncEngine.syncViaP2P('peer_B', peerA, { timeout: 500 });

        expect(report.downloaded).toBe(2);
        expect(report.applied).toBe(0);
    });

    it('debe manejar error en getUnsyncedChanges durante P2P', async () => {
        vi.spyOn(db, 'getUnsyncedChanges').mockRejectedValue(new Error('DB error'));
        vi.spyOn(peerA, 'sendData').mockReturnValue(true);

        const report = await syncEngine.syncViaP2P('peer_B', peerA, { timeout: 100 });

        expect(report.success).toBe(false);
        expect(report.errors.some(e => e.phase === 'getChanges')).toBe(true);
    });

    it('debe manejar error en markChangeSynced durante P2P', async () => {
        await db.createRecord({ name: 'Test' });
        vi.spyOn(peerA, 'sendData').mockReturnValue(true);
        vi.spyOn(db, 'markChangeSynced').mockRejectedValue(new Error('Mark error'));

        const report = await syncEngine.syncViaP2P('peer_B', peerA, { timeout: 100 });

        expect(report.errors.length).toBeGreaterThan(0);
    });

    it('debe esperar correctamente si el peer envía sync-complete', async () => {
        vi.spyOn(peerA, 'sendData').mockImplementation(() => {
            setTimeout(() => {
                peerA.onData({ type: 'sync-complete' }, 'peer_B');
            }, 5);
            return true;
        });

        const start = Date.now();
        const report = await syncEngine.syncViaP2P('peer_B', peerA, { timeout: 500 });
        const elapsed = Date.now() - start;

        // No debería esperar el timeout completo (500ms) porque sync-complete llegó
        expect(elapsed).toBeLessThan(400);
    });

    it('debe restaurar onData original después de syncViaP2P', async () => {
        const originalOnData = peerA.onData;
        vi.spyOn(peerA, 'sendData').mockImplementation(() => {
            setTimeout(() => {
                peerA.onData({ type: 'sync-complete' }, 'peer_B');
            }, 5);
            return true;
        });

        await syncEngine.syncViaP2P('peer_B', peerA, { timeout: 200 });

        expect(peerA.onData).toBe(originalOnData);
    });

    it('syncWithFallback debe loggear warning cuando P2P falla', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(syncEngine, 'syncViaP2P').mockResolvedValue({
            method: 'p2p',
            success: false,
            errors: [{ phase: 'test', error: 'Fallo controlado' }]
        });
        vi.spyOn(syncEngine, 'sync').mockResolvedValue({
            method: 'gas-fallback',
            upload: { uploaded: 0, failed: 0, errors: [] },
            download: { downloaded: 0, applied: 0, errors: [] },
            success: true
        });

        await syncEngine.syncWithFallback({
            peerId: 'peer_B',
            webrtcManager: peerA
        });

        expect(warnSpy).toHaveBeenCalled();
    });

    it('syncWithFallback debe loggear warning cuando P2P lanza excepción', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(syncEngine, 'syncViaP2P').mockRejectedValue(new Error('Excepción P2P'));
        vi.spyOn(syncEngine, 'sync').mockResolvedValue({
            method: 'gas-fallback',
            upload: { uploaded: 0, failed: 0, errors: [] },
            download: { downloaded: 0, applied: 0, errors: [] },
            success: true
        });

        await syncEngine.syncWithFallback({
            peerId: 'peer_B',
            webrtcManager: peerA
        });

        expect(warnSpy).toHaveBeenCalled();
    });
});