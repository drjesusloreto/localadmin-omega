// tests/semantic-db.test.js

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SemanticDatabase } from '../src/js/db/semantic-db.js';

describe('SemanticDatabase', () => {
  let db;
  const TEST_PASSWORD = 'test-password-2024';
  const TEST_DIMENSION = 8;  // Reducido para tests rápidos

 beforeEach(async () => {
	  // 1. Cerrar conexión previa
	  if (db?.db) db.close();

	  // 2. Crear nueva instancia
	  db = new SemanticDatabase();
	  
	  // 3. Inicializar (cargará HNSW si existe en meta)
	  await db.init({ dimension: TEST_DIMENSION });
	  
	  // 4. Limpiar TODO (IndexedDB + HNSW en memoria + meta)
	  await db.clearAll();
	  
	  // 5. Verificar que el índice está limpio
	  if (db.hnswIndex.size !== 0) {
		console.warn('⚠️ hnswIndex no está limpio:', db.hnswIndex.size);
	  }
	  
	  // 6. Configurar clave
	  await db.setEncryptionKey(TEST_PASSWORD);
	});

  afterEach(() => {
    if (db?.db) db.close();
  });

  // ============ INIT ============
  describe('init', () => {
    it('debe inicializar la DB semántica', () => {
      expect(db.hnswIndex).toBeDefined();
      expect(db.hnswDimension).toBe(TEST_DIMENSION);
    });

    it('debe tener un embedder por defecto', () => {
      expect(db.embeddingGenerator).toBeDefined();
      expect(typeof db.embeddingGenerator).toBe('function');
    });
  });

  // ============ CREATE WITH EMBEDDING ============
  describe('createRecordWithEmbedding', () => {
    it('debe crear un registro con embedding', async () => {
      const record = await db.createRecordWithEmbedding({
        name: 'Documento de tecnología',
        content: 'Este documento trata sobre inteligencia artificial'
      });

      expect(record.id).toBeDefined();
      expect(record.embedding).toBeDefined();
      expect(Array.isArray(record.embedding)).toBe(true);
      expect(record.embedding.length).toBe(TEST_DIMENSION);
    });

    it('debe añadir el registro al índice HNSW', async () => {
      const record = await db.createRecordWithEmbedding({
        name: 'Test'
      });

      expect(db.hnswIndex.has(record.id)).toBe(true);
      expect(db.hnswIndex.size).toBe(1);
    });

    it('debe permitir crear múltiples registros con embeddings', async () => {
      const records = await Promise.all([
        db.createRecordWithEmbedding({ name: 'Doc A', content: 'tecnología' }),
        db.createRecordWithEmbedding({ name: 'Doc B', content: 'salud' }),
        db.createRecordWithEmbedding({ name: 'Doc C', content: 'finanzas' })
      ]);

      expect(records.length).toBe(3);
      expect(db.hnswIndex.size).toBe(3);
    });

    it('debe usar texto personalizado para el embedding', async () => {
      const record = await db.createRecordWithEmbedding(
        { name: 'Test', content: 'contenido original' },
        [],
        'texto personalizado para embedding'
      );

      expect(record.embedding).toBeDefined();
    });
  });

  // ============ SEARCH SEMANTIC ============
  describe('searchSemantic', () => {
    beforeEach(async () => {
      // Crear corpus de prueba
      await db.createRecordWithEmbedding({
        name: 'Inteligencia Artificial',
        content: 'Machine learning y deep learning',
        tags: ['ia', 'tecnología']
      });
      await db.createRecordWithEmbedding({
        name: 'Medicina moderna',
        content: 'Tratamientos y diagnósticos',
        tags: ['salud']
      });
      await db.createRecordWithEmbedding({
        name: 'Finanzas personales',
        content: 'Ahorro e inversión',
        tags: ['finanzas']
      });
    });

    it('debe retornar resultados para una query', async () => {
      const results = await db.searchSemantic('inteligencia artificial', { k: 5 });
      expect(Array.isArray(results)).toBe(true);
    });

    it('debe respetar el límite k', async () => {
      const results = await db.searchSemantic('documento', { k: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('debe usar fallback a tokens si no hay embedder', async () => {
      db.embeddingGenerator = null;
      const results = await db.searchSemantic('inteligencia');
      expect(Array.isArray(results)).toBe(true);
    });

    it('debe funcionar con búsqueda híbrida', async () => {
      const results = await db.searchSemantic('tecnología', {
        k: 5,
        hybrid: true
      });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // ============ FIND SIMILAR ============
  describe('findSimilar', () => {
    it('debe encontrar registros similares', async () => {
      const r1 = await db.createRecordWithEmbedding({ name: 'Doc A', content: 
'texto similar' });
      const r2 = await db.createRecordWithEmbedding({ name: 'Doc B', content: 
'texto similar' });
      const r3 = await db.createRecordWithEmbedding({ name: 'Doc C', content: 
'diferente' });

      const similar = await db.findSimilar(r1.id, 2);
      expect(Array.isArray(similar)).toBe(true);
    });

    it('debe retornar array vacío para ID inexistente', async () => {
      const similar = await db.findSimilar('inexistente', 5);
      expect(similar).toEqual([]);
    });
  });

  // ============ STATS ============
  describe('getSemanticStats', () => {
    it('debe retornar estadísticas completas', async () => {
      await db.createRecordWithEmbedding({ name: 'Doc A' });
      await db.createRecordWithEmbedding({ name: 'Doc B' });

      const stats = await db.getSemanticStats();
      
      expect(stats.total).toBe(2);
      expect(stats.embeddingsCount).toBe(2);
      expect(stats.hnsw).toBeDefined();
      expect(stats.hnsw.size).toBe(2);
    });
  });

  // ============ REBUILD INDEX ============
  describe('rebuildHNSWIndex', () => {
    it('debe reconstruir el índice desde registros', async () => {
      await db.createRecordWithEmbedding({ name: 'Doc A' });
      await db.createRecordWithEmbedding({ name: 'Doc B' });

      // Destruir el índice
      db.hnswIndex.clear();
      expect(db.hnswIndex.size).toBe(0);

      // Reconstruir
      const indexed = await db.rebuildHNSWIndex();
      
      expect(indexed).toBe(2);
      expect(db.hnswIndex.size).toBe(2);
    });
  });

  // ============ INTEGRACIÓN CON NIVEL 1 ============
  describe('Integración con Nivel 1', () => {
    it('debe preservar cifrado al añadir embeddings', async () => {
      const record = await db.createRecordWithEmbedding({
        name: 'Test',
        content: 'Contenido secreto'
      });

      // El contenido debe estar cifrado
      const stored = await db.getRecord(record.id);
      expect(stored.content).not.toBe('Contenido secreto');
      
      // Pero descifrable
      const decrypted = await db.decryptRecordContent(stored);
      expect(decrypted).toBe('Contenido secreto');
    });
  });
});