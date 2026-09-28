// src/js/intelligence/anomaly-detector.js
/**
 * Detector de anomalías basado en Z-Score y patrones temporales.
 */
export class AnomalyDetector {
    constructor(options = {}) {
        this.zScoreThreshold = options.zScoreThreshold || 3;
        this.windowSize = options.windowSize || 30;
        this.minSamples = options.minSamples || 10;
    }

    /**
     * Detecta anomalías en un array de valores numéricos.
     * @param {Array<number>} values - Valores a analizar.
     * @returns {Array<Object>} - Lista de anomalías detectadas.
     */
    detectZScore(values) {
        if (values.length < this.minSamples) return [];
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev === 0) return [];
        return values.map((v, i) => ({
            index: i,
            value: v,
            zScore: (v - mean) / stdDev,
            isAnomaly: Math.abs((v - mean) / stdDev) > this.zScoreThreshold
        })).filter(x => x.isAnomaly);
    }

    /**
     * Detecta picos en series temporales.
     * @param {Array<number>} values - Serie temporal.
     * @param {number} sensitivity - Sensibilidad de detección.
     * @returns {Array<Object>} - Picos detectados.
     */
    detectPeaks(values, sensitivity = 1.5) {
        const anomalies = [];
        const window = 5;
        for (let i = window; i < values.length - window; i++) {
            const left = values.slice(i - window, i);
            const right = values.slice(i + 1, i + 1 + window);
            const context = [...left, ...right];
            const avg = context.reduce((a, b) => a + b, 0) / context.length;
            const stdDev = Math.sqrt(context.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / context.length) || 1;
            const zScore = (values[i] - avg) / stdDev;
            if (Math.abs(zScore) > sensitivity) {
                anomalies.push({ index: i, value: values[i], zScore, type: zScore > 0 ? 'peak' : 'valley' });
            }
        }
        return anomalies;
    }

    /**
     * Detecta valores atípicos en registros (ej. duración, tamaño).
     * @param {Array<Object>} records - Registros.
     * @param {string} field - Campo a analizar.
     * @returns {Array<Object>} - Anomalías con registro asociado.
     */
    detectRecordAnomalies(records, field) {
        const values = records.map(r => Number(r[field])).filter(Number.isFinite);
        const anomalies = this.detectZScore(values);
        return anomalies.map(a => ({
            record: records[a.index],
            field,
            value: a.value,
            zScore: a.zScore,
            severity: Math.abs(a.zScore) > 4 ? 'high' : 'medium'
        }));
    }

    /**
     * Detecta duplicados por similitud de nombre.
     * @param {Array<Object>} records - Registros.
     * @param {number} threshold - Umbral de similitud (0-1).
     * @returns {Array<Object>} - Pares de duplicados.
     */
    detectDuplicates(records, threshold = 0.9) {
        const duplicates = [];
        for (let i = 0; i < records.length; i++) {
            for (let j = i + 1; j < records.length; j++) {
                const sim = this._stringSimilarity(records[i].name || '', records[j].name || '');
                if (sim >= threshold) {
                    duplicates.push({
                        a: records[i].id,
                        b: records[j].id,
                        similarity: sim,
                        name: records[i].name
                    });
                }
            }
        }
        return duplicates;
    }

    /**
     * Detecta registros con contenido vacío o muy corto.
     * @param {Array<Object>} records - Registros.
     * @param {number} minLength - Longitud mínima del contenido.
     * @returns {Array<Object>} - Registros de baja calidad.
     */
    detectLowQuality(records, minLength = 10) {
        return records.filter(r => {
            const text = [r.name, r.content].filter(Boolean).join(' ');
            return text.trim().length < minLength;
        });
    }

    /**
     * Calcula la similitud entre dos strings (Levenshtein).
     * @private
     */
    _stringSimilarity(a, b) {
        if (!a || !b) return 0;
        if (a === b) return 1;
        const longer = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;
        return (longer.length - this._levenshtein(longer, shorter)) / longer.length;
    }

    /**
     * Calcula la distancia de Levenshtein.
     * @private
     */
    _levenshtein(a, b) {
        const m = a.length, n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
            }
        }
        return dp[m][n];
    }
}