// tests/model-manager.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { ModelManager } from '../src/js/ml/model-manager.js';

describe('ModelManager', () => {
    let manager;
    let mockDb;

    const mockRecords = [
    { id: 1, name: 'Factura cliente', content: 'pago pendiente', tags: ['finanzas'], category: 'finanzas' },
    { id: 2, name: 'Presupuesto proyecto', content: 'desarrollo', tags: ['proyectos'], category: 'proyectos' },
    { id: 3, name: 'Factura cliente', content: 'pago', tags: ['finanzas'], category: 'finanzas' }
	];

    beforeEach(() => {
        localStorage.clear();
        mockDb = {
            getAllRecords: async () => mockRecords
        };
        manager = new ModelManager(mockDb);
    });

    it('debe entrenar y persistir el modelo', async () => {
        const result = await manager.train();
        expect(result.records).toBe(3);
        expect(result.trainedAt).toBeDefined();
        expect(localStorage.getItem('ml_model')).toBeDefined();
    });

    it('debe cargar el modelo desde localStorage', async () => {
        await manager.train();
        const newManager = new ModelManager(mockDb);
        const result = await newManager.loadOrTrain();
        expect(result.loaded).toBe(true);
        expect(result.trainedAt).toBeDefined();
    });

    it('debe predecir con el modelo entrenado', async () => {
        await manager.train();
        const result = manager.predict('Nueva factura de cliente');
        expect(result.category).toBeDefined();
        expect(result.tags).toBeInstanceOf(Array);
    });

    it('debe analizar los registros', async () => {
        await manager.train();
        const analysis = await manager.analyze();
        expect(analysis.duplicates).toBeDefined();
        expect(analysis.lowQuality).toBeDefined();
    });

    it('debe saltarse el reentrenamiento si no hay cambios', async () => {
        await manager.train();
        const result = await manager.retrainIfNeeded();
        expect(result.skipped).toBe(true);
    });

    it('debe devolver info del modelo', async () => {
        await manager.train();
        const info = manager.getInfo();
        expect(info.trained).toBe(true);
        expect(info.records).toBe(3);
        expect(info.categories).toBeGreaterThan(0);
    });
});