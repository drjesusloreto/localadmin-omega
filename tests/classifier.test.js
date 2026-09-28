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
});