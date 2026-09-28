// src/js/intelligence/classifier.js
/**
 * Clasificador Naive Bayes para categorización automática de registros.
 * Aprende de los datos existentes.
 */
export class NaiveBayesClassifier {
    constructor() {
        this.classes = new Map(); // categoría -> { wordCounts, totalWords, docCount }
        this.totalDocs = 0;
        this.vocabulary = new Set();
    }

    /**
     * Entrena con un registro.
     * @param {string} text - Contenido del registro.
     * @param {string} category - Categoría del registro.
     */
    train(text, category) {
        if (!text || !category) return;
        const tokens = this._tokenize(text);
        if (!this.classes.has(category)) {
            this.classes.set(category, { wordCounts: new Map(), totalWords: 0, docCount: 0 });
        }
        const cls = this.classes.get(category);
        cls.docCount++;
        this.totalDocs++;
        for (const token of tokens) {
            cls.wordCounts.set(token, (cls.wordCounts.get(token) || 0) + 1);
            cls.totalWords++;
            this.vocabulary.add(token);
        }
    }

    /**
     * Entrena con múltiples registros.
     * @param {Array<Object>} records - Array de registros con `name`, `content`, `tags`, `category`.
     * @returns {NaiveBayesClassifier} - this para encadenamiento.
     */
    trainAll(records) {
        for (const r of records) {
            const text = [r.name, r.content, (r.tags || []).join(' ')].join(' ');
            if (r.category && r.category !== 'general') {
                this.train(text, r.category);
            }
        }
        return this;
    }

    /**
     * Predice la categoría más probable.
     * @param {string} text - Texto a clasificar.
     * @returns {Object} - { category, confidence, alternatives }.
     */
    predict(text) {
        const tokens = this._tokenize(text);
        const scores = new Map();
        for (const [category, cls] of this.classes) {
            const prior = Math.log(cls.docCount / this.totalDocs);
            let likelihood = 0;
            for (const token of tokens) {
                const count = cls.wordCounts.get(token) || 0;
                const prob = (count + 1) / (cls.totalWords + this.vocabulary.size); // Laplace smoothing
                likelihood += Math.log(prob);
            }
            scores.set(category, prior + likelihood);
        }
        const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return { category: 'general', confidence: 0 };
        const [topCategory, topScore] = sorted[0];
        const totalScore = sorted.reduce((s, [_, v]) => s + Math.exp(v), 0);
        const confidence = Math.exp(topScore) / totalScore;
        return {
            category: topCategory,
            confidence,
            alternatives: sorted.slice(1, 4).map(([cat, score]) => ({
                category: cat,
                confidence: Math.exp(score) / totalScore
            }))
        };
    }

    /**
     * Sugiere etiquetas basadas en el contenido.
     * @param {string} text - Texto para analizar.
     * @param {number} topN - Número de etiquetas a sugerir.
     * @returns {Array<string>} - Lista de etiquetas sugeridas.
     */
    suggestTags(text, topN = 5) {
        const tokens = this._tokenize(text);
        const scores = new Map();
        for (const [category, cls] of this.classes) {
            for (const token of tokens) {
                const count = cls.wordCounts.get(token) || 0;
                if (count > 0) {
                    scores.set(token, (scores.get(token) || 0) + count);
                }
            }
        }
        return Array.from(scores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN)
            .map(([word]) => word);
    }

    /**
     * Calcula la importancia de cada palabra por categoría.
     * @param {string} category - Categoría a analizar.
     * @param {number} topN - Número de palabras a retornar.
     * @returns {Array<Array>} - Lista de [palabra, score].
     */
    getTopWords(category, topN = 10) {
        const cls = this.classes.get(category);
        if (!cls) return [];
        const scores = [];
        for (const [word, count] of cls.wordCounts) {
            const tf = count / cls.totalWords;
            const docsWithWord = Array.from(this.classes.values()).filter(c => c.wordCounts.has(word)).length;
            const idf = Math.log(this.classes.size / (1 + docsWithWord));
            scores.push([word, tf * idf]);
        }
        return scores.sort((a, b) => b[1] - a[1]).slice(0, topN);
    }

    /**
     * Exporta el modelo a JSON.
     * @returns {Object} - Modelo serializable.
     */
    export() {
        const classes = {};
        for (const [category, cls] of this.classes) {
            classes[category] = {
                docCount: cls.docCount,
                totalWords: cls.totalWords,
                wordCounts: Object.fromEntries(cls.wordCounts)
            };
        }
        return {
            version: 1,
            totalDocs: this.totalDocs,
            vocabulary: Array.from(this.vocabulary),
            classes
        };
    }

    /**
     * Importa un modelo desde JSON.
     * @param {Object} data - Modelo serializado.
     * @returns {NaiveBayesClassifier} - this para encadenamiento.
     */
    import(data) {
        this.classes.clear();
        this.vocabulary = new Set(data.vocabulary || []);
        this.totalDocs = data.totalDocs || 0;
        for (const [category, cls] of Object.entries(data.classes || {})) {
            this.classes.set(category, {
                docCount: cls.docCount,
                totalWords: cls.totalWords,
                wordCounts: new Map(Object.entries(cls.wordCounts))
            });
        }
        return this;
    }

    /**
     * Tokeniza un texto.
     * @private
     */
    _tokenize(text) {
        return String(text)
            .toLowerCase()
            .replace(/[^\wáéíóúñü\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2);
    }
}