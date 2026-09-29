// tests/model-manager-coverage.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelManager } from '../src/js/ml/model-manager.js';

describe('ModelManager - Cobertura adicional', () => {
    let mockDb;
    let manager;

    const mockRecords = [
        { id: 1, name: 'Factura', content: 'pago', tags: ['finanzas'], category: 'finanzas' },
        { id: 2, name: 'Proyecto', content: 'web', tags: ['proyectos'], category: 'proyectos' }
    ];

    beforeEach(() => {
        localStorage.clear();
        mockDb = {
            getAllRecords: vi.fn().mockResolvedValue(mockRecords)
        };
        manager = new ModelManager(mockDb);
    });

    // ============================================================
    // loadOrTrain con modelo corrupto
    // ============================================================
    it('debe manejar modelo corrupto en localStorage', async () => {
        localStorage.setItem('ml_model', 'invalid-json');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await manager.loadOrTrain();
        expect(result).toBeDefined();
        expect(result.loaded).toBe(false);

        warnSpy.mockRestore();
    });

    // ============================================================
    // _persist con localStorage lleno
    // ============================================================
    it('debe manejar localStorage lleno al persistir', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // ⬇️ CRÍTICO: localStorage es de solo lectura en happy-dom
        // Usar Object.defineProperty en lugar de asignación directa
        const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

        const mockLocalStorage = {
            getItem: () => null,
            setItem: () => {
                throw new Error('QuotaExceededError: localStorage is full');
            },
            removeItem: () => {},
            clear: () => {},
            key: () => null,
            length: 0
        };

        Object.defineProperty(globalThis, 'localStorage', {
            value: mockLocalStorage,
            writable: true,
            configurable: true
        });

        // Ejecutar train() que llama internamente a _persist()
        const result = await manager.train();

        // Verificar que:
        // 1. train() no lanzó error
        // 2. console.warn fue llamado por el catch de _persist
        expect(result).toBeDefined();
        expect(warnSpy).toHaveBeenCalled();

        // Restaurar el descriptor original
        if (originalDescriptor) {
            Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
        }
        warnSpy.mockRestore();
    });

    // ============================================================
    // retrainIfNeeded edge cases
    // ============================================================
    it('debe reentrenar si hay >20% de nuevos registros', async () => {
        // Primer entrenamiento con 2 registros
        await manager.train();
        expect(manager.stats.trainedRecords).toBe(2);

        // Simular que ahora hay 3 registros (50% más)
        mockDb.getAllRecords.mockResolvedValue([
            ...mockRecords,
            { id: 3, name: 'Nuevo', content: 'texto', tags: [], category: 'general' }
        ]);

        const result = await manager.retrainIfNeeded();
        expect(result.skipped).toBeUndefined();
        expect(result.records).toBe(3);
    });

    it('debe saltar reentrenamiento si no hay suficientes cambios', async () => {
        await manager.train();

        const result = await manager.retrainIfNeeded();
        expect(result.skipped).toBe(true);
        expect(result.records).toBe(2);
    });

    // ============================================================
    // analyze edge cases
    // ============================================================
    it('debe manejar analyze con menos de 10 registros', async () => {
        const analysis = await manager.analyze();
        expect(analysis.bySize).toEqual([]);
    });

    it('debe manejar analyze con 15 registros', async () => {
        const manyRecords = Array.from({ length: 15 }, (_, i) => ({
            id: i,
            name: `Record ${i}`,
            content: 'lorem ipsum',
            category: 'general'
        }));
        mockDb.getAllRecords.mockResolvedValue(manyRecords);

        const analysis = await manager.analyze();
        expect(analysis).toBeDefined();
        expect(analysis.duplicates).toBeDefined();
        expect(analysis.lowQuality).toBeDefined();
    });

    // ============================================================
    // predict con modelo no entrenado
    // ============================================================
    it('debe manejar predict sin modelo entrenado', () => {
        const result = manager.predict('texto de prueba');
        expect(result.category).toBeDefined();
        expect(result.tags).toBeInstanceOf(Array);
    });

    // ============================================================
    // getInfo
    // ============================================================
    it('debe retornar info correcta sin modelo entrenado', () => {
        const info = manager.getInfo();
        expect(info.trained).toBe(false);
        expect(info.lastTrained).toBeNull();
        expect(info.records).toBe(0);
    });
});
