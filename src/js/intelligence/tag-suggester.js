// src/js/intelligence/tag-suggester.js
import { NaiveBayesClassifier } from './classifier.js';

/**
 * Sugeridor de etiquetas basado en el contenido y registros similares.
 * Combina: frecuencia global + co-ocurrencia + similitud de tokens.
 */
export class TagSuggester {
    constructor(db) {
        this.db = db;
        this.classifier = new NaiveBayesClassifier();
        this.frequencyMap = new Map();
        this.coOccurrence = new Map();
    }

    /**
     * Entrena con los registros existentes.
     * @returns {Promise<TagSuggester>}
     */
    async train() {
        const records = await this.db.getAllRecords();
        this.classifier.trainAll(records);
        
        for (const r of records) {
            // Frecuencia global de tags
            for (const tag of (r.tags || [])) {
                this.frequencyMap.set(tag, (this.frequencyMap.get(tag) || 0) + 1);
            }
            
            // Co-ocurrencia de tags
            const tags = r.tags || [];
            for (let i = 0; i < tags.length; i++) {
                for (let j = i + 1; j < tags.length; j++) {
                    const key = [tags[i], tags[j]].sort().join('|');
                    this.coOccurrence.set(key, (this.coOccurrence.get(key) || 0) + 1);
                }
            }
        }
        return this;
    }

    /**
     * Sugiere tags para un texto.
     * @param {string} text - Texto para analizar.
     * @param {Array<string>} existingTags - Tags ya seleccionados por el usuario.
     * @param {number} topN - Número de sugerencias a retornar.
     * @returns {Array<Object>} - Lista de { tag, score }.
     */
    suggest(text, existingTags = [], topN = 8) {
        const suggestions = new Map();

        // 1. Frecuencia global (peso bajo)
        for (const [tag, count] of this.frequencyMap) {
            suggestions.set(tag, count * 0.3);
        }

        // 2. Co-ocurrencia con tags existentes (peso alto)
        for (const existing of existingTags) {
            for (const [tag, count] of this.frequencyMap) {
                const key = [existing, tag].sort().join('|');
                const cooc = this.coOccurrence.get(key) || 0;
                if (cooc > 0) {
                    suggestions.set(tag, (suggestions.get(tag) || 0) + cooc * 2);
                }
            }
        }

        // 3. Similitud con tokens del contenido (peso medio)
        const tokens = this._tokenize(text);
        for (const token of tokens) {
            if (this.frequencyMap.has(token)) {
                suggestions.set(token, (suggestions.get(token) || 0) + 5);
            }
        }

        return Array.from(suggestions.entries())
            .filter(([tag]) => !existingTags.includes(tag))
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN)
            .map(([tag, score]) => ({ tag, score }));
    }

    /**
     * Predice categoría y tags combinados.
     * @param {string} text
     * @returns {Object} - { category, tags, topWords }
     */
    predict(text) {
        const categoryResult = this.classifier.predict(text);
        return {
            category: categoryResult,
            tags: this.suggest(text).map(s => s.tag),
            topWords: this.classifier.getTopWords(categoryResult.category, 5)
        };
    }

    /**
     * Tokeniza un texto.
     * @private
     */
    _tokenize(text) {
        return String(text).toLowerCase()
            .replace(/[^\wáéíóúñü\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 3);
    }
}