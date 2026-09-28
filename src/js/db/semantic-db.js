// src/js/db/semantic-db.js

/**
 * Extensión de Database con búsqueda semántica mediante embeddings.
 * 
 * Funcionalidades:
 *   - Almacenar embeddings junto a los registros
 *   - Buscar por similitud semántica (HNSW)
 *   - Fallback a búsqueda por tokens (fuzzy) si no hay embeddings
 *   - Persistencia del índice HNSW en IndexedDB
 * 
 * Referencia: EDC Página 346-357 + PAE Semana 2, Día 9
 */

import { Database } from './db.js';
import { HNSWIndex } from '../vectordb/hnsw-wasm.js';
import { CryptoUtils } from '../core/crypto-utils.js';

const HNSW_STORE = 'hnsw_index';
const HNSW_CONFIG_KEY = 'hnsw_config';

export class SemanticDatabase extends Database {
  constructor() {
    super();
    this.hnswIndex = null;
    this.hnswDimension = 384;  // all-MiniLM-L6-v2
    this.embeddingGenerator = null;
  }

  /**
   * Inicializa la base de datos + índice HNSW.
   * @param {Object} options
   * @param {number} options.dimension - Dimensión de embeddings
   * @param {Function} options.embedder - Función generadora de embeddings
   */
  async init(options = {}) {
    // 1. Inicializar DB base
    await super.init();

    // 2. Configurar dimensión
    this.hnswDimension = options.dimension || 384;
    this.embeddingGenerator = options.embedder || this._defaultEmbedder();

    // 3. Cargar o crear índice HNSW
    await this._loadOrCreateHNSW();

    return this;
  }

  /**
   * Carga el índice HNSW desde IndexedDB o crea uno nuevo.
   * @private
   */
  async _loadOrCreateHNSW() {
	  // Intentar cargar desde meta
	  const storedConfig = await this.getMeta(HNSW_CONFIG_KEY);
	  
	  this.hnswIndex = new HNSWIndex({ dimension: this.hnswDimension });
	  await this.hnswIndex.init();

	  // Solo restaurar si hay config Y no está vacía
	  if (storedConfig && storedConfig.entries && storedConfig.entries.length > 0) {
		const restored = HNSWIndex.fromJSON(storedConfig);
		this.hnswIndex = restored;
	  }
	}

  /**
   * Persiste el índice HNSW en IndexedDB.
   * @private
   */
  async _persistHNSW() {
    if (!this.hnswIndex) return;
    const json = this.hnswIndex.toJSON();
    await this.setMeta(HNSW_CONFIG_KEY, json);
  }

  /**
   * Crea un registro CON embedding para búsqueda semántica.
   * 
   * @param {Object} data - Datos del registro
   * @param {File[]} files - Archivos adjuntos
   * @param {string} [embeddingText] - Texto a usar para el embedding (por defecto: name + content)
   * @returns {Promise<Object>}
   */
  async createRecordWithEmbedding(data, files = [], embeddingText = null) {
	  const record = await super.createRecord(data, files);

	  if (this.embeddingGenerator) {
		try {
		  const text = embeddingText || this._buildEmbeddingText(record);
		  const embedding = await this.embeddingGenerator(text);

		  // Eliminar del índice si ya existe (evitar duplicados)
		  if (this.hnswIndex.has(record.id)) {
			this.hnswIndex.remove(record.id);
		  }

		  this.hnswIndex.add(record.id, embedding);

		  record.embedding = Array.from(embedding);
		  await this._tx('records', 'readwrite', store => store.put(record));
		  await this._persistHNSW();
		} catch (e) {
		  console.warn(`Error generando embedding para registro ${record.id}:`, e);
		}
	  }

	  return record;
	}

  /**
   * Búsqueda semántica por similitud de embeddings.
   * 
   * @param {string} query - Texto de la consulta
   * @param {Object} options
   * @param {number} options.k - Número de resultados (default: 10)
   * @param {number} options.threshold - Similitud mínima (default: 0.3)
   * @param {boolean} options.hybrid - Combinar con búsqueda por tokens
   * @returns {Promise<Array<Object>>}
   */
  async searchSemantic(query, options = {}) {
    const k = options.k || 10;
    const threshold = options.threshold || 0.3;
    const hybrid = options.hybrid !== false;

    // 1. Si no hay embeddings, fallback a búsqueda por tokens
    if (!this.embeddingGenerator || this.hnswIndex.size === 0) {
      return this._fallbackTokenSearch(query, k);
    }

    try {
      // 2. Generar embedding de la query
      const queryEmbedding = await this.embeddingGenerator(query);

      // 3. Buscar en HNSW
      const results = this.hnswIndex.search(queryEmbedding, k * 2);

      // 4. Filtrar por threshold
      const filtered = results.filter(r => r.score >= threshold);

      // 5. Cargar registros completos
      const records = [];
      for (const r of filtered.slice(0, k)) {
        const record = await this.getRecord(r.id);
        if (record) {
          records.push({
            ...record,
            _semantic_score: r.score
          });
        }
      }

      // 6. Si es híbrido, combinar con búsqueda por tokens
      if (hybrid) {
        return this._mergeResults(records, query, k);
      }

      return records;

    } catch (e) {
      console.warn('Error en búsqueda semántica, usando fallback:', e);
      return this._fallbackTokenSearch(query, k);
    }
  }

  /**
   * Búsqueda por similitud con un registro existente.
   * Encuentra registros similares al registro dado.
   * 
   * @param {string|number} recordId 
   * @param {number} k 
   * @returns {Promise<Array<Object>>}
   */
  async findSimilar(recordId, k = 5) {
    const vector = this.hnswIndex.get(recordId);
    if (!vector) return [];

    const results = this.hnswIndex.search(vector, k + 1);
    const filtered = results.filter(r => r.id !== recordId).slice(0, k);

    const records = [];
    for (const r of filtered) {
      const record = await this.getRecord(r.id);
      if (record) {
        records.push({
          ...record,
          _similarity_score: r.score
        });
      }
    }

    return records;
  }

  /**
   * Búsqueda híbrida: semántica + tokens.
   * @private
   */
  async _mergeResults(semanticResults, query, k) {
    // Buscar por tokens
    const tokenResults = await this._fallbackTokenSearch(query, k);
    const semanticIds = new Set(semanticResults.map(r => r.id));

    // Añadir registros de token search que no estén en semantic
    const merged = [...semanticResults];
    for (const record of tokenResults) {
      if (!semanticIds.has(record.id)) {
        merged.push({
          ...record,
          _token_match: true
        });
      }
    }

    return merged.slice(0, k);
  }

  /**
   * Fallback: búsqueda por tokens (name, content, tags).
   * @private
   */
  async _fallbackTokenSearch(query, k) {
    const tokens = this._tokenize(query);
    const allRecords = await this.getAllRecords();
    const scores = new Map();

    for (const record of allRecords) {
      const text = `${record.name} ${record.content} ${(record.tags || []).join(' ')}`.toLowerCase();
      let score = 0;

      for (const token of tokens) {
        if (text.includes(token)) {
          score += 1;
          // Bonus si está en el nombre
          if (record.name.toLowerCase().includes(token)) score += 0.5;
        }
      }

      if (score > 0) {
        scores.set(record.id, score);
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id, score]) => {
        const record = allRecords.find(r => r.id === id);
        return { ...record, _token_score: score };
      });
  }

  /**
   * Construye el texto para generar embedding.
   * @private
   */
  _buildEmbeddingText(record) {
    return [
      record.name,
      record.content,
      (record.tags || []).join(' '),
      record.category
    ].filter(Boolean).join(' ');
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
      .filter(t => t.length > 1);
  }

  /**
   * Embedder por defecto (hash simple, para testing).
   * En producción se reemplaza por un modelo real (all-MiniLM, etc.)
   * @private
   */
  _defaultEmbedder() {
    return async (text) => {
      // Hash simple determinista para testing
      const hash = await CryptoUtils.hash(text);
      const bytes = [];
      for (let i = 0; i < this.hnswDimension * 2 && i < hash.length; i += 2) {
        bytes.push(parseInt(hash.substring(i, i + 2), 16) / 255);
      }
      // Rellenar hasta la dimensión completa
      while (bytes.length < this.hnswDimension) {
        bytes.push(bytes[bytes.length % hash.length / 2] || 0);
      }
      return bytes.slice(0, this.hnswDimension);
    };
  }

  /**
   * Estadísticas del índice semántico.
   * @returns {Promise<Object>}
   */
  async getSemanticStats() {
    const stats = await super.getStats();
    return {
      ...stats,
      hnsw: this.hnswIndex ? this.hnswIndex.getStats() : null,
      embeddingsCount: this.hnswIndex ? this.hnswIndex.size : 0
    };
  }

  /**
   * Reconstruye el índice HNSW desde los registros almacenados.
   * Útil si el índice se corrompe.
   * @returns {Promise<number>}
   */
  async rebuildHNSWIndex() {
    if (!this.embeddingGenerator) {
      throw new Error('No hay generador de embeddings configurado');
    }

    const records = await this.getAllRecords();
    this.hnswIndex = new HNSWIndex({ dimension: this.hnswDimension });
    await this.hnswIndex.init();

    let indexed = 0;
    for (const record of records) {
      // Usar embedding guardado o generar uno nuevo
      let embedding = record.embedding;
      if (!embedding) {
        const text = this._buildEmbeddingText(record);
        embedding = await this.embeddingGenerator(text);
        record.embedding = Array.from(embedding);
        await this._tx('records', 'readwrite', store => store.put(record));
      }
      this.hnswIndex.add(record.id, embedding);
      indexed++;
    }

    await this._persistHNSW();
    return indexed;
  }
    /**
   * Limpia TODO: IndexedDB + índice HNSW en memoria + config persistida.
   * @returns {Promise<boolean>}
   */
  async clearAll() {
    // 1. Limpiar IndexedDB (llama al método del padre)
    await super.clearAll();
    
    // 2. Limpiar el índice HNSW en memoria
    if (this.hnswIndex) {
      this.hnswIndex.clear();
    }
    
    // 3. Eliminar la config persistida del HNSW
    try {
      await this.setMeta('hnsw_config', null);
    } catch (e) {
      // Ignorar errores
    }
    
    return true;
  }
}