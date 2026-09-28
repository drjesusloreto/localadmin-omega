// tests/tag-suggester.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { TagSuggester } from '../src/js/intelligence/tag-suggester.js';

describe('TagSuggester', () => {
    let suggester;
    let mockDb;

    const mockRecords = [
    { id: 1, name: 'Factura cliente', content: 'pago pendiente', tags: ['finanzas', 'cliente'], category: 'finanzas' },
    { id: 2, name: 'Factura proveedor', content: 'pago realizado', tags: ['finanzas', 'proveedor'], category: 'finanzas' },
    { id: 3, name: 'Presupuesto proyecto', content: 'desarrollo web', tags: ['proyectos', 'web'], category: 'proyectos' },
    { id: 4, name: 'Factura cliente', content: 'pago recurrente', tags: ['finanzas', 'cliente'], category: 'finanzas' },
    { id: 5, name: 'Contrato laboral', content: 'empleado nuevo', tags: ['legal', 'rrhh'], category: 'legal' }
	];

    beforeEach(() => {
        mockDb = {
            getAllRecords: async () => mockRecords
        };
        suggester = new TagSuggester(mockDb);
    });

    it('debe entrenar con los registros', async () => {
        await suggester.train();
        expect(suggester.frequencyMap.size).toBeGreaterThan(0);
        expect(suggester.frequencyMap.get('finanzas')).toBe(3);
    });

    it('debe sugerir tags basados en el contenido', async () => {
        await suggester.train();
        const suggestions = suggester.suggest('Factura de cliente', [], 5);
        expect(suggestions.length).toBeGreaterThan(0);
        const tags = suggestions.map(s => s.tag);
        expect(tags).toContain('finanzas');
    });

    it('debe sugerir tags basados en co-ocurrencia', async () => {
        await suggester.train();
        const suggestions = suggester.suggest('Texto nuevo', ['finanzas'], 5);
        const tags = suggestions.map(s => s.tag);
        expect(tags).toContain('cliente');
        expect(tags).toContain('proveedor');
    });

    it('debe excluir tags ya seleccionados', async () => {
        await suggester.train();
        const suggestions = suggester.suggest('Factura cliente', ['finanzas'], 5);
        const tags = suggestions.map(s => s.tag);
        expect(tags).not.toContain('finanzas');
    });

    it('debe retornar categoría y tags combinados', async () => {
        await suggester.train();
        const result = suggester.predict('Factura de cliente importante');
        expect(result.category).toBeDefined();
        expect(result.tags).toBeInstanceOf(Array);
    });

    it('debe manejar texto vacío', async () => {
        await suggester.train();
        const suggestions = suggester.suggest('', [], 5);
        expect(Array.isArray(suggestions)).toBe(true);
    });

    it('debe limitar a topN sugerencias', async () => {
        await suggester.train();
        const suggestions = suggester.suggest('Factura cliente proyecto', [], 2);
        expect(suggestions.length).toBeLessThanOrEqual(2);
    });
});