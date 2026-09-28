// tests/conflict-resolver.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictResolver } from '../src/js/sync/conflict-resolver.js';

describe('ConflictResolver', () => {
    let resolver;

    beforeEach(() => {
        resolver = new ConflictResolver();
    });

    it('debe devolver "remote-new" si no hay local', () => {
        const remote = { id: 1, name: 'Remote' };
        const result = resolver.resolve(null, remote);
        expect(result.resolution).toBe('remote-new');
        expect(result.winner).toBe(remote);
    });

    it('debe devolver "local-new" si no hay remote', () => {
        const local = { id: 1, name: 'Local' };
        const result = resolver.resolve(local, null);
        expect(result.resolution).toBe('local-new');
        expect(result.winner).toBe(local);
    });

    it('debe aplicar LWW cuando no hay vector clocks', () => {
        const local = { id: 1, name: 'Local', updated_at: '2024-01-01T00:00:00Z' };
        const remote = { id: 1, name: 'Remote', updated_at: '2024-06-01T00:00:00Z' };
        const result = resolver.resolve(local, remote);
        expect(result.winner.name).toBe('Remote');
        expect(result.resolution).toBe('remote-lww');
    });

    it('debe usar vector clocks para detectar "before"', () => {
        const local = { id: 1, name: 'Local', _vc: { deviceId: 'A', clock: { A: 1 } } };
        const remote = { id: 1, name: 'Remote', _vc: { deviceId: 'B', clock: { A: 2, B: 1 } } };
        const result = resolver.resolve(local, remote);
        expect(result.resolution).toBe('remote-wins');
        expect(result.winner.name).toBe('Remote');
    });

    it('debe usar vector clocks para detectar "after"', () => {
        const local = { id: 1, name: 'Local', _vc: { deviceId: 'A', clock: { A: 3 } } };
        const remote = { id: 1, name: 'Remote', _vc: { deviceId: 'B', clock: { A: 1 } } };
        const result = resolver.resolve(local, remote);
        expect(result.resolution).toBe('local-wins');
        expect(result.winner.name).toBe('Local');
    });

    it('debe detectar "equal"', () => {
        const vc = { deviceId: 'A', clock: { A: 1, B: 2 } };
        const local = { id: 1, _vc: vc };
        const remote = { id: 1, _vc: vc };
        const result = resolver.resolve(local, remote);
        expect(result.resolution).toBe('equal');
    });

    it('debe hacer merge de campos en conflicto concurrente', () => {
        const local = {
            id: 1,
            name: 'Local Name',
            content: 'Local Content',
            updated_at: '2024-06-01T00:00:00Z',
            _vc: { deviceId: 'A', clock: { A: 2, B: 1 } }
        };
        const remote = {
            id: 1,
            name: 'Remote Name',
            content: 'Remote Content',
            updated_at: '2024-06-02T00:00:00Z',
            _vc: { deviceId: 'B', clock: { A: 1, B: 3 } }
        };
        const result = resolver.resolve(local, remote);
        expect(result.resolution).toBe('field-merge');
        expect(result.conflicts.length).toBeGreaterThan(0);
        expect(result.winner.has_conflict).toBe(0);
    });

    it('debe fusionar listas de archivos sin duplicados', () => {
        const filesA = [
            { hash: 'abc', name: 'file1.txt', updated_at: '2024-01-01' },
            { hash: 'def', name: 'file2.txt', updated_at: '2024-01-01' }
        ];
        const filesB = [
            { hash: 'abc', name: 'file1.txt', updated_at: '2024-06-01' },
            { hash: 'ghi', name: 'file3.txt', updated_at: '2024-06-01' }
        ];
        const merged = ConflictResolver.mergeFiles(filesA, filesB);
        expect(merged).toHaveLength(3);
        const abc = merged.find(f => f.hash === 'abc');
        expect(abc.updated_at).toBe('2024-06-01');
    });

    it('debe fusionar tags sin duplicados', () => {
        const merged = ConflictResolver.mergeTags(['finanzas', 'urgente'], ['urgente', 'cliente']);
        expect(merged).toEqual(['finanzas', 'urgente', 'cliente']);
    });

    it('debe manejar arrays vacíos en mergeFiles', () => {
        const merged = ConflictResolver.mergeFiles([], []);
        expect(merged).toEqual([]);
    });

    it('debe manejar mergeFiles con un solo array', () => {
        const files = [{ hash: 'abc', name: 'file.txt' }];
        const merged = ConflictResolver.mergeFiles(files, []);
        expect(merged).toHaveLength(1);
    });
});