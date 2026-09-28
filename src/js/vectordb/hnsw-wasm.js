// src/js/vectordb/hnsw-wasm.js

/**
 * Índice vectorial HNSW (Hierarchical Navigable Small World) con soporte WASM.
 * 
 * Proporciona búsqueda aproximada de vecinos más cercanos (ANN) en alta dimensión.
 * Si WASM no está disponible, usa fallback a búsqueda por fuerza bruta.
 * 
 * Aplicación en LocalAdmin:
 *   - Búsqueda semántica de registros
 *   - Recomendación de contenido similar
 *   - Clustering de datos
 * 
 * Referencia: EDC Página 844-849 + PAE Semana 2, Día 8
 */

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_DIMENSION = 384;         // Dimensión por defecto (all-MiniLM)
const DEFAULT_M = 16;                  // Máximo de conexiones por nodo
const DEFAULT_EF_CONSTRUCTION = 200;   // Tamaño de la lista dinámica en construcción
const DEFAULT_EF_SEARCH = 50;          // Tamaño de la lista dinámica en búsqueda

// ============================================================================
// UTILIDADES MATEMÁTICAS
// ============================================================================

/**
 * Calcula la similitud coseno entre dos vectores.
 * @param {Array<number>|Float32Array} a 
 * @param {Array<number>|Float32Array} b 
 * @returns {number} - Valor entre -1 y 1
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimensiones incompatibles: ${a.length} vs ${b.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * Calcula la distancia euclidiana entre dos vectores.
 * @param {Array<number>} a 
 * @param {Array<number>} b 
 * @returns {number}
 */
function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// ============================================================================
// CLASE HNSW INDEX
// ============================================================================

export class HNSWIndex {
  /**
   * @param {Object} options 
   * @param {number} options.dimension - Dimensión de los vectores
   * @param {number} options.M - Máximo de conexiones por nodo
   * @param {number} options.efConstruction - Tamaño de lista en construcción
   * @param {number} options.efSearch - Tamaño de lista en búsqueda
   */
  constructor(options = {}) {
    this.dimension = options.dimension || DEFAULT_DIMENSION;
    this.maxConnections = options.M || DEFAULT_M;
    this.efConstruction = options.efConstruction || DEFAULT_EF_CONSTRUCTION;
    this.efSearch = options.efSearch || DEFAULT_EF_SEARCH;
    
    // Almacenamiento de vectores: Map<id, Float32Array>
    this.vectors = new Map();
    
    // Mapeo de IDs numéricos a IDs originales
    this.idMap = new Map();
    this.reverseIdMap = new Map();
    
    // Módulo WASM (se inicializará en init())
    this.wasmModule = null;
    this.indexPtr = null;
    
    // Estado del índice
    this.initialized = false;
    this.useWASM = false;
  }

  /**
   * Inicializa el índice.
   * Intenta cargar WASM, si falla usa fallback JS.
   * 
   * @param {string|null} wasmUrl - URL del módulo WASM (opcional)
   * @returns {Promise<HNSWIndex>}
   */
  async init(wasmUrl = null) {
    if (wasmUrl) {
      try {
        const response = await fetch(wasmUrl);
        const bytes = await response.arrayBuffer();
        const module = await WebAssembly.instantiate(bytes, {
          env: {
            memory: new WebAssembly.Memory({ initial: 256, maximum: 2048 }),
            abort: () => { throw new Error('WASM abort'); }
          }
        });
        
        this.wasmModule = module.instance.exports;
        this.indexPtr = this.wasmModule.hnsw_create(
          this.dimension,
          this.maxConnections,
          this.efConstruction
        );
        this.useWASM = true;
      } catch (e) {
        console.warn('HNSW WASM no disponible, usando fallback JS:', e.message);
        this.useWASM = false;
      }
    }
    
    this.initialized = true;
    return this;
  }

  /**
   * Añade un vector al índice.
   * 
   * @param {string|number} id - Identificador único del vector
   * @param {Array<number>|Float32Array} vector - Vector de características
   * @returns {number} - ID numérico interno
   */
  add(id, vector) {
    if (!this.initialized) {
      throw new Error('HNSWIndex no inicializado. Llamar a init() primero.');
    }
    
    if (vector.length !== this.dimension) {
      throw new Error(
        `Vector debe tener dimensión ${this.dimension}, recibido ${vector.length}`
      );
    }
    
    // Generar ID numérico interno
    const numericId = this._hashId(id);
    
    // Almacenar vector
    const float32Vector = vector instanceof Float32Array 
      ? vector 
      : new Float32Array(vector);
    
    this.vectors.set(id, float32Vector);
    this.idMap.set(numericId, id);
    this.reverseIdMap.set(id, numericId);
    
    // Si WASM está disponible, delegar
    if (this.useWASM && this.indexPtr) {
      const vectorPtr = this._allocateVector(float32Vector);
      this.wasmModule.hnsw_add(this.indexPtr, numericId, vectorPtr);
      this.wasmModule.free(vectorPtr);
    }
    
    return numericId;
  }

  /**
   * Añade múltiples vectores en batch.
   * 
   * @param {Array<{id: string|number, vector: Array<number>}>} items 
   * @returns {number} - Número de vectores añadidos
   */
  addBatch(items) {
    for (const { id, vector } of items) {
      this.add(id, vector);
    }
    return items.length;
  }

  /**
   * Busca los k vecinos más cercanos a un vector de consulta.
   * 
   * @param {Array<number>|Float32Array} query - Vector de consulta
   * @param {number} k - Número de vecinos a retornar
   * @returns {Array<{id: string|number, score: number}>}
   */
  search(query, k = 10) {
    if (!this.initialized) {
      throw new Error('HNSWIndex no inicializado. Llamar a init() primero.');
    }
    
    if (query.length !== this.dimension) {
      throw new Error(
        `Query debe tener dimensión ${this.dimension}, recibido ${query.length}`
      );
    }
    
    // Si WASM está disponible, usar búsqueda WASM
    if (this.useWASM && this.indexPtr) {
      const queryPtr = this._allocateVector(query);
      const resultsPtr = this.wasmModule.hnsw_search(
        this.indexPtr,
        queryPtr,
        k,
        this.efSearch
      );
      const results = this._readResults(resultsPtr, k);
      this.wasmModule.free(queryPtr);
      this.wasmModule.free(resultsPtr);
      
      return results.map(r => ({
        id: this.idMap.get(r.id),
        score: r.distance
      }));
    }
    
    // Fallback: búsqueda por fuerza bruta
    return this._bruteForceSearch(query, k);
  }

  /**
   * Búsqueda por fuerza bruta (Cosine Similarity).
   * Usado como fallback cuando WASM no está disponible.
   * 
   * @private
   * @param {Array<number>|Float32Array} query 
   * @param {number} k 
   * @returns {Array<{id: string|number, score: number}>}
   */
  _bruteForceSearch(query, k) {
    const queryArray = query instanceof Float32Array ? query : new 
Float32Array(query);
    
    const results = [];
    
    for (const [id, vector] of this.vectors) {
      results.push({
        id,
        score: cosineSimilarity(queryArray, vector)
      });
    }
    
    // Ordenar por similitud descendente
    results.sort((a, b) => b.score - a.score);
    
    // Retornar top-k
    return results.slice(0, k);
  }

  /**
   * Elimina un vector del índice.
   * 
   * @param {string|number} id 
   * @returns {boolean}
   */
  remove(id) {
    const numericId = this.reverseIdMap.get(id);
    if (!numericId) return false;
    
    this.vectors.delete(id);
    this.idMap.delete(numericId);
    this.reverseIdMap.delete(id);
    
    if (this.useWASM && this.indexPtr) {
      this.wasmModule.hnsw_remove(this.indexPtr, numericId);
    }
    
    return true;
  }

  /**
   * Número de vectores en el índice.
   * @returns {number}
   */
  get size() {
    return this.vectors.size;
  }

  /**
   * Verifica si un ID existe en el índice.
   * @param {string|number} id 
   * @returns {boolean}
   */
  has(id) {
    return this.vectors.has(id);
  }

  /**
   * Obtiene un vector por ID.
   * @param {string|number} id 
   * @returns {Float32Array|null}
   */
  get(id) {
    return this.vectors.get(id) || null;
  }

  /**
   * Limpia el índice completamente.
   */
  clear() {
    this.vectors.clear();
    this.idMap.clear();
    this.reverseIdMap.clear();
    
    if (this.useWASM && this.indexPtr) {
      this.wasmModule.hnsw_destroy(this.indexPtr);
      this.indexPtr = null;
    }
  }

  /**
   * Genera un ID numérico único para un ID de cualquier tipo.
   * @private
   */
  _hashId(id) {
    if (typeof id === 'number') return id;
    
    let hash = 0;
    const str = String(id);
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * Aloca un vector en memoria WASM.
   * @private
   */
  _allocateVector(vector) {
    const ptr = this.wasmModule.malloc(vector.length * 4);
    const view = new Float32Array(
      this.wasmModule.memory.buffer,
      ptr,
      vector.length
    );
    view.set(vector);
    return ptr;
  }

  /**
   * Lee resultados de memoria WASM.
   * @private
   */
  _readResults(ptr, k) {
    const results = [];
    for (let i = 0; i < k; i++) {
      const offset = ptr + i * 8;
      const view = new DataView(this.wasmModule.memory.buffer);
      results.push({
        id: view.getUint32(offset, true),
        distance: view.getFloat32(offset + 4, true)
      });
    }
    return results;
  }

  /**
   * Retorna estadísticas del índice.
   * @returns {Object}
   */
  getStats() {
    return {
      size: this.vectors.size,
      dimension: this.dimension,
      maxConnections: this.maxConnections,
      efConstruction: this.efConstruction,
      efSearch: this.efSearch,
      backend: this.useWASM ? 'wasm' : 'js-bruteforce'
    };
  }

  /**
   * Serializa el índice (sin WASM).
   * @returns {Object}
   */
  toJSON() {
    const entries = [];
    for (const [id, vector] of this.vectors) {
      entries.push({
        id,
        vector: Array.from(vector)
      });
    }
    return {
      dimension: this.dimension,
      maxConnections: this.maxConnections,
      efConstruction: this.efConstruction,
      efSearch: this.efSearch,
      entries
    };
  }

  /**
	 * Deserializa el índice desde JSON.
	 * El índice retornado está listo para usar (initialized = true).
	 * 
	 * @param {Object} json 
	 * @returns {HNSWIndex}
	 */
	static fromJSON(json) {
	  const index = new HNSWIndex({
		dimension: json.dimension,
		M: json.maxConnections,
		efConstruction: json.efConstruction,
		efSearch: json.efSearch
	  });
	  
	  // Marcar como inicializado ANTES de añadir vectores
	  index.initialized = true;
	  index.useWASM = false;  // Sin WASM (serialización no incluye estado WASM)
	  
	  // Añadir vectores (ahora sí funciona porque initialized = true)
	  for (const entry of json.entries) {
		index.add(entry.id, entry.vector);
	  }
	  
	  return index;
	}
}