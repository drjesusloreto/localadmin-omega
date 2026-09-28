// tests/classifier.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { NaiveBayesClassifier } from '../src/js/intelligence/classifier.js';

describe('NaiveBayesClassifier', () => {
    let classifier;

    beforeEach(() => {
        classifier = new NaiveBayesClassifier();
    });

    it('debe inicializarse vacío', () => {
        expect(classifier.totalDocs).toBe(0);
        expect(classifier.classes.size).toBe(0);
    });

    it('debe entrenar con un registro', () => {
        classifier.train('factura cliente importante', 'finanzas');
        expect(classifier.totalDocs).toBe(1);
        expect(classifier.classes.has('finanzas')).toBe(true);
    });

    it('debe predecir la categoría correcta', () => {
        classifier.train('factura de cliente', 'finanzas');
        classifier.train('presupuesto de proyecto', 'proyectos');
        classifier.train('factura pendiente de pago', 'finanzas');
        const result = classifier.predict('nueva factura de cliente');
        expect(result.category).toBe('finanzas');
        expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('debe sugerir etiquetas', () => {
        classifier.train('factura cliente importante', 'finanzas');
        classifier.train('presupuesto proyecto web', 'proyectos');
        const tags = classifier.suggestTags('factura de cliente', 3);
        expect(tags.length).toBeGreaterThan(0);
        expect(tags).toContain('factura');
    });

    it('debe exportar e importar el modelo', () => {
        classifier.train('factura cliente', 'finanzas');
        classifier.train('presupuesto proyecto', 'proyectos');
        const exported = classifier.export();
        const newClassifier = new NaiveBayesClassifier();
        newClassifier.import(exported);
        expect(newClassifier.totalDocs).toBe(2);
        expect(newClassifier.classes.size).toBe(2);
        const result = newClassifier.predict('factura');
        expect(result.category).toBe('finanzas');
    });

    it('debe manejar texto vacío', () => {
        classifier.train('factura cliente', 'finanzas');
        const result = classifier.predict('');
        expect(result).toBeDefined();
    });

    it('debe manejar categorías desconocidas', () => {
        classifier.train('factura cliente', 'finanzas');
        const result = classifier.predict('texto desconocido');
        expect(result.category).toBe('finanzas'); // Aunque no coincida, da la única categoría.
    });
	// tests/classifier.test.js (añadir al final del describe)

	it('debe obtener las palabras más importantes de una categoría', () => {
		classifier.train('factura cliente importante pago pendiente', 'finanzas');
		classifier.train('presupuesto proyecto web desarrollo', 'proyectos');
		classifier.train('factura cliente recurrente mensual', 'finanzas');
		
		const topWords = classifier.getTopWords('finanzas', 5);
		expect(topWords.length).toBeGreaterThan(0);
		expect(topWords[0][0]).toBe('factura'); // "factura" aparece 2 veces
		expect(topWords[0][1]).toBeGreaterThan(0); // Score > 0
	});

	it('debe retornar vacío para categoría inexistente en getTopWords', () => {
		const topWords = classifier.getTopWords('categoria_inexistente');
		expect(topWords).toEqual([]);
	});

	it('debe sugerir etiquetas limitando a topN', () => {
		classifier.train('factura cliente importante pago', 'finanzas');
		classifier.train('presupuesto proyecto web desarrollo', 'proyectos');
		
		const tags = classifier.suggestTags('factura cliente presupuesto proyecto', 2);
		expect(tags.length).toBe(2);
	});

	it('debe sugerir etiquetas con texto sin coincidencias', () => {
		classifier.train('factura cliente', 'finanzas');
		const tags = classifier.suggestTags('texto completamente diferente', 5);
		expect(tags.length).toBe(0);
	});

	it('debe manejar train con texto vacío', () => {
		const totalBefore = classifier.totalDocs;
		classifier.train('', 'finanzas');
		expect(classifier.totalDocs).toBe(totalBefore); // No se añade
	});

	it('debe manejar train con categoría vacía', () => {
		const totalBefore = classifier.totalDocs;
		classifier.train('factura cliente', '');
		expect(classifier.totalDocs).toBe(totalBefore); // No se añade
	});

	it('debe predecir con múltiples alternativas', () => {
		classifier.train('factura cliente pago', 'finanzas');
		classifier.train('presupuesto proyecto desarrollo', 'proyectos');
		classifier.train('contrato laboral empleado', 'legal');
		
		const result = classifier.predict('factura cliente');
		expect(result.category).toBe('finanzas');
		expect(result.alternatives.length).toBeGreaterThan(0);
		expect(result.alternatives.length).toBeLessThanOrEqual(3);
	});
	it('debe manejar getTopWords con una sola categoría', () => {
    classifier.train('factura cliente importante', 'finanzas');
    const topWords = classifier.getTopWords('finanzas', 3);
    expect(topWords.length).toBeGreaterThan(0);
    expect(topWords[0][1]).toBeGreaterThan(0); // El score NUNCA es 0 con smoothing
	});

	it('debe manejar import con modelo vacío', () => {
		const newClassifier = new NaiveBayesClassifier();
		newClassifier.import({ version: 1, totalDocs: 0, vocabulary: [], classes: {} });
		expect(newClassifier.totalDocs).toBe(0);
		expect(newClassifier.classes.size).toBe(0);
	});

	it('debe manejar suggestTags con topN mayor que tokens disponibles', () => {
		classifier.train('factura cliente', 'finanzas');
		const tags = classifier.suggestTags('factura', 100);
		expect(tags.length).toBeLessThanOrEqual(100);
	});
});