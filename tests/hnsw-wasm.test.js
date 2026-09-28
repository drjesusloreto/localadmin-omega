// tests/hnsw-wasm.test.js

import { describe, it, expect, beforeEach } from 'vitest';
import { HNSWIndex } from '../src/js/vectordb/hnsw-wasm.js';

describe('HNSWIndex', () => {
  let index;
  
  // Vectores de prueba (dimensión 4 para simplificar)
  const vectors = {
    a: [1, 0, 0, 0],
    b: [0.9, 0.1, 0, 0],
    c: [0, 1, 0, 0],
    d: [0, 0, 1, 0],
    e: [0, 0, 0, 1]
  };

  beforeEach(async () => {
  index = new HNSWIndex({ dimension: 4 });
  await index.init();  // Sin WASM (fallback a JS)
});

  // ============ INIT ============
  describe('init', () => {
    it('debe inicializar el índice sin WASM', async () => {
      const idx = new HNSWIndex({ dimension: 4 });
      await idx.init();
      
      expect(idx.initialized).toBe(true);
      expect(idx.useWASM).toBe(false);
    });

    it('debe usar fallback a JS si WASM no está disponible', async () => {
      const idx = new HNSWIndex({ dimension: 4 });
      await idx.init(null);
      
      expect(idx.useWASM).toBe(false);
      expect(idx.getStats().backend).toBe('js-bruteforce');
    });
  });

  // ============ ADD ============
  describe('add', () => {
    it('debe añadir un vector al índice', () => {
      index.add('a', vectors.a);
      expect(index.size).toBe(1);
      expect(index.has('a')).toBe(true);
    });

    it('debe lanzar error si la dimensión no coincide', () => {
      expect(() => index.add('x', [1, 2])).toThrow();
      expect(() => index.add('x', [1, 2, 3, 4, 5])).toThrow();
    });

    it('debe lanzar error si el índice no está inicializado', () => {
      const idx = new HNSWIndex({ dimension: 4 });
      expect(() => idx.add('a', vectors.a)).toThrow();
    });

    it('debe añadir múltiples vectores en batch', () => {
      const items = [
        { id: 'a', vector: vectors.a },
        { id: 'b', vector: vectors.b },
        { id: 'c', vector: vectors.c }
      ];
      
      index.addBatch(items);
      expect(index.size).toBe(3);
    });
  });

  // ============ SEARCH ============
  describe('search', () => {
    beforeEach(() => {
      index.addBatch([
        { id: 'a', vector: vectors.a },
        { id: 'b', vector: vectors.b },
        { id: 'c', vector: vectors.c },
        { id: 'd', vector: vectors.d },
        { id: 'e', vector: vectors.e }
      ]);
    });

    it('debe encontrar el vector idéntico primero', () => {
      const results = index.search(vectors.a, 1);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('a');
      expect(results[0].score).toBeCloseTo(1.0, 5);
    });

    it('debe encontrar los k vecinos más cercanos', () => {
      const results = index.search(vectors.a, 3);
      expect(results.length).toBe(3);
      
      // a debe estar primero (idéntico)
      expect(results[0].id).toBe('a');
      
      // b es más similar a a que c, d, e
      expect(results[1].id).toBe('b');
    });

    it('debe retornar resultados ordenados por similitud', () => {
      const results = index.search(vectors.a, 5);
      
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('debe retornar menos resultados si hay menos vectores', () => {
      const results = index.search(vectors.a, 100);
      expect(results.length).toBe(5);
    });

    it('debe lanzar error con dimensión incorrecta', () => {
      expect(() => index.search([1, 2], 1)).toThrow();
    });
  });

  // ============ REMOVE ============
  describe('remove', () => {
    beforeEach(() => {
      index.addBatch([
        { id: 'a', vector: vectors.a },
        { id: 'b', vector: vectors.b }
      ]);
    });

    it('debe eliminar un vector existente', () => {
      const result = index.remove('a');
      expect(result).toBe(true);
      expect(index.size).toBe(1);
      expect(index.has('a')).toBe(false);
    });

    it('debe retornar false al eliminar un ID inexistente', () => {
      const result = index.remove('inexistente');
      expect(result).toBe(false);
    });
  });

  // ============ GET ============
  describe('get', () => {
    beforeEach(() => {
      index.add('a', vectors.a);
    });

    it('debe retornar el vector almacenado', () => {
      const vector = index.get('a');
      expect(vector).toBeInstanceOf(Float32Array);
      expect(Array.from(vector)).toEqual(vectors.a);
    });

    it('debe retornar null para ID inexistente', () => {
      expect(index.get('inexistente')).toBeNull();
    });
  });

  // ============ CLEAR ============
  describe('clear', () => {
    it('debe limpiar todos los vectores', () => {
      index.addBatch([
        { id: 'a', vector: vectors.a },
        { id: 'b', vector: vectors.b }
      ]);
      
      index.clear();
      expect(index.size).toBe(0);
    });
  });

  // ============ STATS ============
  describe('getStats', () => {
    it('debe retornar estadísticas correctas', () => {
      index.add('a', vectors.a);
      index.add('b', vectors.b);
      
      const stats = index.getStats();
      expect(stats.size).toBe(2);
      expect(stats.dimension).toBe(4);
      expect(stats.backend).toBe('js-bruteforce');
    });
  });

  // ============ SERIALIZACIÓN ============
  describe('toJSON / fromJSON', () => {
    it('debe serializar y deserializar correctamente', () => {
      index.addBatch([
        { id: 'a', vector: vectors.a },
        { id: 'b', vector: vectors.b }
      ]);
      
      const json = index.toJSON();
      expect(json.dimension).toBe(4);
      expect(json.entries.length).toBe(2);
      
      const restored = HNSWIndex.fromJSON(json);
      expect(restored.size).toBe(2);
      expect(restored.get('a')).toBeDefined();
    });
  });

  // ============ CASOS REALES ============
  describe('Casos reales de búsqueda semántica', () => {
    it('debe encontrar documentos similares en un corpus', () => {
      // Simular embeddings de 4 dimensiones (normalmente 384)
      const corpus = [
        { id: 'doc1', vector: [0.9, 0.1, 0.0, 0.0] },  // Tecnología
        { id: 'doc2', vector: [0.85, 0.15, 0.0, 0.0] }, // Tecnología
        { id: 'doc3', vector: [0.1, 0.9, 0.0, 0.0] },  // Salud
        { id: 'doc4', vector: [0.05, 0.85, 0.1, 0.0] }, // Salud
        { id: 'doc5', vector: [0.0, 0.0, 0.9, 0.1] }   // Finanzas
      ];
      
      const idx = new HNSWIndex({ dimension: 4 });
      idx.initialized = true;
      idx.addBatch(corpus);
      
      // Buscar similar a "tecnología"
      const results = idx.search([0.88, 0.12, 0, 0], 2);
      
      expect(results[0].id).toBe('doc1');
      expect(results[1].id).toBe('doc2');
    });

    it('debe manejar 100 vectores sin problemas', () => {
      const idx = new HNSWIndex({ dimension: 8 });
      idx.initialized = true;
      
      // Generar 100 vectores aleatorios
      const vectors = [];
      for (let i = 0; i < 100; i++) {
        vectors.push({
          id: `vec${i}`,
          vector: Array.from({ length: 8 }, () => Math.random())
        });
      }
      
      idx.addBatch(vectors);
      expect(idx.size).toBe(100);
      
      // Buscar
      const query = Array.from({ length: 8 }, () => Math.random());
      const results = idx.search(query, 5);
      
      expect(results.length).toBe(5);
    });
  });
    // ============ COBERTURA ADICIONAL ============
  describe('Cobertura adicional del fallback', () => {
    it('debe cubrir _hashId con strings largos', () => {
      index.add('id-con-muchos-caracteres-para-forzar-hash-largo-12345', 
        vectors.a);
      expect(index.size).toBe(1);
    });

    it('debe cubrir _hashId con IDs numéricos', () => {
      index.add(42, vectors.a);
      expect(index.has(42)).toBe(true);
      expect(index.get(42)).toBeDefined();
    });

    it('debe serializar con toJSON y verificar estructura', () => {
      index.addBatch([
        { id: 'a', vector: vectors.a },
        { id: 'b', vector: vectors.b }
      ]);

      const json = index.toJSON();
      
      expect(json).toHaveProperty('dimension');
      expect(json).toHaveProperty('maxConnections');
      expect(json).toHaveProperty('efConstruction');
      expect(json).toHaveProperty('efSearch');
      expect(json).toHaveProperty('entries');
      expect(json.entries.length).toBe(2);
      expect(json.entries[0]).toHaveProperty('id');
      expect(json.entries[0]).toHaveProperty('vector');
    });

    it('debe preservar la dimensión al deserializar', () => {
      index.add('a', vectors.a);
      const json = index.toJSON();
      const restored = HNSWIndex.fromJSON(json);
      
      expect(restored.dimension).toBe(4);
      expect(restored.maxConnections).toBe(index.maxConnections);
      expect(restored.efConstruction).toBe(index.efConstruction);
      expect(restored.efSearch).toBe(index.efSearch);
    });

    it('debe permitir búsqueda después de deserializar', () => {
      index.addBatch([
        { id: 'a', vector: vectors.a },
        { id: 'b', vector: vectors.b },
        { id: 'c', vector: vectors.c }
      ]);

      const json = index.toJSON();
      const restored = HNSWIndex.fromJSON(json);
      
      const results = restored.search(vectors.a, 2);
      expect(results.length).toBe(2);
      expect(results[0].id).toBe('a');
    });

    it('debe manejar init con URL inválida (fallback a JS)', async () => {
	  // Silenciar logs de red durante este test
	  const originalWarn = console.warn;
	  const originalError = console.error;
	  console.warn = () => {};
	  console.error = () => {};

	  const idx = new HNSWIndex({ dimension: 4 });
	  await idx.init('https://invalid-url-that-does-not-exist.wasm');

	  // Restaurar logs
	  console.warn = originalWarn;
	  console.error = originalError;

	  expect(idx.useWASM).toBe(false);
	  expect(idx.initialized).toBe(true);
	});

    it('debe retornar vector Float32Array en get()', () => {
      index.add('a', vectors.a);
      const vector = index.get('a');
      
      expect(vector).toBeInstanceOf(Float32Array);
      expect(vector.length).toBe(4);
    });

    it('debe permitir search con Float32Array como query', () => {
      index.addBatch([
        { id: 'a', vector: vectors.a },
        { id: 'b', vector: vectors.b }
      ]);

      const query = new Float32Array(vectors.a);
      const results = index.search(query, 1);
      
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('a');
    });

    it('debe limpiar correctamente después de clear()', () => {
      index.addBatch([
        { id: 'a', vector: vectors.a },
        { id: 'b', vector: vectors.b }
      ]);

      index.clear();

      expect(index.size).toBe(0);
      expect(index.has('a')).toBe(false);
      expect(index.get('a')).toBeNull();
      expect(index.search(vectors.a, 5).length).toBe(0);
    });
  });
});