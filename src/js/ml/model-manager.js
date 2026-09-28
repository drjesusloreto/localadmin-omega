// src/js/ml/model-manager.js
import { NaiveBayesClassifier } from '../intelligence/classifier.js';
import { TagSuggester } from '../intelligence/tag-suggester.js';
import { AnomalyDetector } from '../intelligence/anomaly-detector.js';

/**
 * Gestor central de modelos ML: entrenamiento, persistencia y análisis.
 */
export class ModelManager {
    constructor(db) {
        this.db = db;
        this.classifier = new NaiveBayesClassifier();
        this.tagSuggester = new TagSuggester(db);
        this.anomalyDetector = new AnomalyDetector();
        this.lastTrained = null;
        this.stats = { trainedRecords: 0, accuracy: null };
    }

    /**
     * Carga el modelo desde localStorage o entrena uno nuevo.
     * @returns {Promise<Object>} - { loaded, trainedAt, records }
     */
    async loadOrTrain() {
        const stored = localStorage.getItem('ml_model');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                this.classifier.import(data.classifier);
                this.lastTrained = data.trainedAt;
                this.stats.trainedRecords = data.records;
                return { loaded: true, trainedAt: this.lastTrained };
            } catch (e) {
                console.warn('Error cargando modelo, entrenando de nuevo:', e);
            }
        }
        return this.train();
    }

    /**
     * Entrena todos los modelos con los registros actuales.
     * @returns {Promise<Object>} - { loaded, trainedAt, records }
     */
    async train() {
        const records = await this.db.getAllRecords();
        this.classifier.trainAll(records);
        await this.tagSuggester.train();
        
        this.lastTrained = new Date().toISOString();
        this.stats.trainedRecords = records.length;
        this._persist();
        
        return { loaded: false, trainedAt: this.lastTrained, records: records.length };
    }

    /**
     * Persiste el modelo en localStorage.
     * @private
     */
    _persist() {
        try {
            localStorage.setItem('ml_model', JSON.stringify({
                version: 1,
                trainedAt: this.lastTrained,
                records: this.stats.trainedRecords,
                classifier: this.classifier.export()
            }));
        } catch (e) {
            console.warn('No se pudo persistir el modelo:', e);
        }
    }

    /**
     * Predice categoría y tags para un texto.
     * @param {string} text
     * @returns {Object}
     */
    predict(text) {
        const category = this.classifier.predict(text);
        const tags = this.tagSuggester.suggest(text).map(s => s.tag);
        return {
            category: category.category,
            confidence: category.confidence,
            tags,
            topWords: this.classifier.getTopWords(category.category, 5)
        };
    }

    /**
     * Analiza los registros actuales (duplicados, baja calidad, anomalías).
     * @returns {Promise<Object>}
     */
    async analyze() {
        const records = await this.db.getAllRecords();
        return {
            duplicates: this.anomalyDetector.detectDuplicates(records),
            lowQuality: this.anomalyDetector.detectLowQuality(records),
            bySize: records.length > 10
                ? this.anomalyDetector.detectRecordAnomalies(
                    records.filter(r => r.files?.length),
                    'files.length'
                  )
                : []
        };
    }

    /**
     * Reentrena solo si hay suficientes cambios.
     * @returns {Promise<Object>}
     */
    async retrainIfNeeded() {
        const records = await this.db.getAllRecords();
        if (records.length > this.stats.trainedRecords * 1.2) {
            return this.train();
        }
        return { skipped: true, records: records.length };
    }

    /**
     * Devuelve información del modelo actual.
     * @returns {Object}
     */
    getInfo() {
        return {
            trained: !!this.lastTrained,
            lastTrained: this.lastTrained,
            records: this.stats.trainedRecords,
            categories: this.classifier.classes.size,
            tags: this.tagSuggester.frequencyMap.size
        };
    }
}