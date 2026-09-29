// tests/hnsw-wasm-coverage.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HNSWIndex } from '../src/js/vectordb/hnsw-wasm.js';

describe('HNSWIndex - Cobertura adicional', () => {
    let index;

    beforeEach(async () => {
        index = new HNSWIndex({ dimension: 4 });
        await index.init();
    });

    // ============================================================
    // WASM fallback paths
    // ============================================================
    it('debe manejar _allocateVector cuando WASM no está disponible', () => {
        index.useWASM = false;
        expect(index.wasmModule).toBeNull();
    });

    it('debe manejar getStats con WASM deshabilitado', () => {
        const stats = index.getStats();
        expect(stats.backend).toBe('js-bruteforce');
    });

    it('debe manejar clear sin WASM', () => {
        index.add('a', [1, 0, 0, 0]);
        index.clear();
        expect(index.size).toBe(0);
    });

    // ============================================================
    // addBatch con errores
    // ============================================================
    it('debe manejar addBatch con vector de dimensión incorrecta', () => {
        expect(() => {
            index.addBatch([
                { id: 'a', vector: [1, 0, 0, 0] },
                { id: 'b', vector: [1, 0] } // Dimensión incorrecta
            ]);
        }).toThrow();
    });

    // ============================================================
    // search con edge cases
    // ============================================================
    it('debe retornar array vacío si el índice está vacío', () => {
        const results = index.search([1, 0, 0, 0], 5);
        expect(results).toEqual([]);
    });

    it('debe manejar search con k mayor que size', () => {
        index.add('a', [1, 0, 0, 0]);
        const results = index.search([1, 0, 0, 0], 100);
        expect(results.length).toBe(1);
    });

    it('debe manejar search con vector cero', () => {
        index.add('a', [1, 0, 0, 0]);
        const results = index.search([0, 0, 0, 0], 1);
        expect(results).toBeDefined();
    });

    // ============================================================
    // remove edge cases
    // ============================================================
    it('debe manejar remove de ID inexistente', () => {
        const result = index.remove('no-existe');
        expect(result).toBe(false);
    });

    it('debe manejar remove de ID numérico', () => {
        index.add(42, [1, 0, 0, 0]);
        const result = index.remove(42);
        expect(result).toBe(true);
    });

    // ============================================================
    // Serialización edge cases
    // ============================================================
    it('debe manejar toJSON con índice vacío', () => {
        const json = index.toJSON();
        expect(json.entries).toEqual([]);
        expect(json.dimension).toBe(4);
    });

    it('debe manejar fromJSON con entries vacío', () => {
        const restored = HNSWIndex.fromJSON({
            dimension: 4,
            maxConnections: 16,
            efConstruction: 200,
            efSearch: 50,
            entries: []
        });
        expect(restored.size).toBe(0);
    });

    it('debe preservar la dimensión al serializar/deserializar', () => {
        index.add('a', [1, 0, 0, 0]);
        const json = index.toJSON();
        const restored = HNSWIndex.fromJSON(json);
        expect(restored.dimension).toBe(4);
    });

    // ============================================================
    // _hashId con diferentes tipos
    // ============================================================
    it('debe generar hash consistente para strings', () => {
        const id1 = index._hashId('test-string');
        const id2 = index._hashId('test-string');
        expect(id1).toBe(id2);
    });

    it('debe generar hash diferente para strings diferentes', () => {
        const id1 = index._hashId('test-a');
        const id2 = index._hashId('test-b');
        expect(id1).not.toBe(id2);
    });

    it('debe manejar IDs numéricos', () => {
        const id = index._hashId(42);
        expect(id).toBe(42);
    });

    // ============================================================
    // has() y get()
    // ============================================================
    it('has() debe retornar false para ID inexistente', () => {
        expect(index.has('no-existe')).toBe(false);
    });

    it('get() debe retornar null para ID inexistente', () => {
        expect(index.get('no-existe')).toBeNull();
    });

    // ============================================================
    // init con URL inválida (silenciar logs)
    // ============================================================
    it('debe hacer fallback a JS con URL inválida', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const idx = new HNSWIndex({ dimension: 4 });

        await idx.init('https://invalid-url-that-does-not-exist.wasm');

        expect(idx.useWASM).toBe(false);
        expect(idx.initialized).toBe(true);
        warnSpy.mockRestore();
    });
});
