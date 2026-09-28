// tests/diff-engine.test.js
import { describe, it, expect } from 'vitest';
import { DiffEngine } from '../src/js/intelligence/diff-engine.js';

describe('DiffEngine', () => {
    it('debe calcular diff de caracteres', () => {
        const diff = DiffEngine.charDiff('hello', 'hallo');
        const added = diff.filter(d => d.type === 'added');
        const removed = diff.filter(d => d.type === 'removed');
        expect(added.length).toBe(1);
        expect(removed.length).toBe(1);
    });

    it('debe calcular diff de palabras', () => {
        const diff = DiffEngine.wordDiff('el gato corre', 'el perro corre');
        const added = diff.filter(d => d.type === 'added');
        expect(added.length).toBeGreaterThan(0);
    });

    it('debe calcular diff de líneas', () => {
        const diff = DiffEngine.lineDiff('línea 1\nlínea 2', 'línea 1\nlínea 3');
        expect(diff.length).toBeGreaterThan(0);
    });

    it('debe calcular diff de objetos', () => {
        const a = { name: 'A', age: 30 };
        const b = { name: 'B', age: 30, city: 'NYC' };
        const diff = DiffEngine.objectDiff(a, b);
        expect(diff).toHaveLength(2);
        expect(diff.find(d => d.field === 'name').type).toBe('modified');
        expect(diff.find(d => d.field === 'city').type).toBe('added');
    });

    it('debe ignorar campos con _', () => {
        const a = { name: 'A', _internal: 1 };
        const b = { name: 'A', _internal: 2 };
        const diff = DiffEngine.objectDiff(a, b);
        expect(diff).toEqual([]);
    });

    it('debe calcular similitud', () => {
        expect(DiffEngine.similarity('hello', 'hello')).toBe(100);
        expect(DiffEngine.similarity('hello', 'world')).toBeLessThan(50);
        expect(DiffEngine.similarity('', '')).toBe(100);
        expect(DiffEngine.similarity('a', '')).toBe(0);
    });

    it('debe generar HTML', () => {
        const diff = DiffEngine.charDiff('abc', 'axc');
        const html = DiffEngine.toHTML(diff);
        expect(html).toContain('<ins');
        expect(html).toContain('<del');
    });

    it('debe manejar strings vacíos', () => {
        const diff = DiffEngine.charDiff('', '');
        expect(diff).toEqual([]);
    });

    it('debe manejar objetos con valores undefined', () => {
        const diff = DiffEngine.objectDiff({ a: 1 }, { a: 1, b: 2 });
        expect(diff).toHaveLength(1);
        expect(diff[0].type).toBe('added');
    });
});