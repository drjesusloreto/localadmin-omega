// tests/anomaly-detector.test.js
import { describe, it, expect } from 'vitest';
import { AnomalyDetector } from '../src/js/intelligence/anomaly-detector.js';

describe('AnomalyDetector', () => {
    it('debe detectar anomalías por Z-Score', () => {
        const detector = new AnomalyDetector({ zScoreThreshold: 2 });
        const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
        const anomalies = detector.detectZScore(values);
        expect(anomalies.length).toBe(1);
        expect(anomalies[0].value).toBe(100);
    });

    it('debe retornar vacío si no hay suficientes muestras', () => {
        const detector = new AnomalyDetector({ minSamples: 10 });
        const anomalies = detector.detectZScore([1, 2, 3]);
        expect(anomalies).toEqual([]);
    });

    it('debe detectar picos en una serie temporal', () => {
        const detector = new AnomalyDetector();
        const values = [1, 1, 1, 1, 1, 1, 10, 1, 1, 1, 1, 1, 1];
        const anomalies = detector.detectPeaks(values);
        expect(anomalies.length).toBeGreaterThan(0);
        expect(anomalies[0].type).toBe('peak');
    });

    it('debe detectar duplicados', () => {
        const detector = new AnomalyDetector();
        const records = [
            { id: 1, name: 'Factura de cliente' },
            { id: 2, name: 'Factura de cliente' },
            { id: 3, name: 'Presupuesto' }
        ];
        const duplicates = detector.detectDuplicates(records);
        expect(duplicates.length).toBe(1);
        expect(duplicates[0].a).toBe(1);
        expect(duplicates[0].b).toBe(2);
    });

    it('debe detectar registros de baja calidad', () => {
        const detector = new AnomalyDetector({ minLength: 5 });
        const records = [
            { id: 1, name: 'A', content: 'B' },
            { id: 2, name: 'Factura', content: 'Contenido largo' }
        ];
        const lowQuality = detector.detectLowQuality(records);
        expect(lowQuality.length).toBe(1);
        expect(lowQuality[0].id).toBe(1);
    });
});