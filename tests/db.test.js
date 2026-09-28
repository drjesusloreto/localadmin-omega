// tests/db.test.js

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../src/js/db/db.js';
import { CryptoUtils } from '../src/js/core/crypto-utils.js';

describe('Database', () => {
  let db;
  const TEST_PASSWORD = 'test-password-2024';

  beforeEach(async () => {
	  // Cerrar conexión previa si existe
	  if (db?.db) {
		db.close();
	  }

	  // Crear nueva instancia
	  db = new Database();
	  await db.init();
	  
	  // ORDEN CRÍTICO:
	  // 1. Limpiar primero (elimina contaminación de tests anteriores)
	  await db.clearAll();
	  
	  // 2. Configurar después (genera el salt que el test espera)
	  await db.setEncryptionKey(TEST_PASSWORD);
  });

afterEach(() => {
  if (db?.db) db.close();
});

  afterEach(() => {
    if (db?.db) db.close();
  });

  // ============ INIT ============
  describe('init', () => {
    it('debe inicializar la base de datos', () => {
      expect(db.db).toBeDefined();
      expect(db.deviceId).toBeDefined();
    });

    it('debe crear todos los object stores', () => {
      const stores = Array.from(db.db.objectStoreNames);
      expect(stores).toContain('records');
      expect(stores).toContain('files');
      expect(stores).toContain('change_log');
      expect(stores).toContain('search_index');
      expect(stores).toContain('meta');
    });
  });

  // ============ CREATE ============
  describe('createRecord', () => {
    it('debe crear un registro básico', async () => {
      const record = await db.createRecord({
        name: 'Test Record',
        content: 'Contenido de prueba'
      });

      expect(record.id).toBeDefined();
      expect(record.name).toBe('Test Record');
      expect(record.is_dirty).toBe(1);
      expect(record._vc).toBeDefined();
    });

    it('debe cifrar el contenido al crear', async () => {
      const record = await db.createRecord({
        name: 'Test',
        content: 'Contenido secreto'
      });

      // El contenido cifrado NO debe ser igual al original
      expect(record.content).not.toBe('Contenido secreto');
      expect(record.content.length).toBeGreaterThan(0);
    });

    it('debe permitir descifrar el contenido', async () => {
      const originalContent = 'Contenido secreto 🔐';
      
      const record = await db.createRecord({
        name: 'Test',
        content: originalContent
      });

      const decrypted = await db.decryptRecordContent(record);
      expect(decrypted).toBe(originalContent);
    });

    it('debe asignar valores por defecto', async () => {
      const record = await db.createRecord({});
      
      expect(record.name).toBe('Sin nombre');
      expect(record.category).toBe('general');
      expect(record.tags).toEqual([]);
      expect(record.is_deleted).toBe(0);
      expect(record.has_conflict).toBe(0);
    });

    it('debe registrar el evento en el change log', async () => {
      await db.createRecord({ name: 'Test' });

      const changes = await db.getUnsyncedChanges();
      expect(changes.length).toBe(1);
      expect(changes[0].operation).toBe('CREATE');
    });
  });

  // ============ READ ============
  describe('getRecord', () => {
    it('debe obtener un registro por ID', async () => {
      const created = await db.createRecord({ name: 'Test' });
      const retrieved = await db.getRecord(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.name).toBe('Test');
    });

    it('debe retornar undefined para ID inexistente', async () => {
      const retrieved = await db.getRecord(999999);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAllRecords', () => {
    it('debe obtener todos los registros', async () => {
      await db.createRecord({ name: 'A' });
      await db.createRecord({ name: 'B' });
      await db.createRecord({ name: 'C' });

      const all = await db.getAllRecords();
      expect(all.length).toBe(3);
    });

    it('debe ordenar por nombre ascendente', async () => {
      await db.createRecord({ name: 'Zebra' });
      await db.createRecord({ name: 'Apple' });
      await db.createRecord({ name: 'Mango' });

      const sorted = await db.getAllRecords({ sort: 'name_asc' });
      expect(sorted[0].name).toBe('Apple');
      expect(sorted[2].name).toBe('Zebra');
    });

    it('debe ordenar por fecha descendente (default)', async () => {
	  // Crear dos registros con timestamps EXPLÍCITOS y DIFERENTES
	  const oldId = 1001;
	  const newId = 1002;
	  
	  // Insertar directamente con timestamps controlados
	  await db._tx('records', 'readwrite', store => store.put({
		id: oldId,
		name: 'Old Record',
		content: '',
		tags: [],
		category: 'general',
		metadata: {},
		files: [],
		created_at: '2020-01-01T00:00:00.000Z',
		updated_at: '2020-01-01T00:00:00.000Z',
		is_dirty: 1,
		is_deleted: 0,
		has_conflict: 0,
		_vc: { deviceId: 'test', clock: { test: 1 } },
		_origin_device: 'test'
	  }));
	  
	  await db._tx('records', 'readwrite', store => store.put({
		id: newId,
		name: 'New Record',
		content: '',
		tags: [],
		category: 'general',
		metadata: {},
		files: [],
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z',
		is_dirty: 1,
		is_deleted: 0,
		has_conflict: 0,
		_vc: { deviceId: 'test', clock: { test: 1 } },
		_origin_device: 'test'
	  }));

	  // Verificar que hay 2 registros
	  const all = await db.getAllRecords();
	  expect(all.length).toBe(2);

	  // Ordenar descendente por updated_at
	  const sortedDesc = await db.getAllRecords({ sort: 'updated_at_desc' });
	  expect(sortedDesc.length).toBe(2);
	  expect(sortedDesc[0].id).toBe(newId);  // 2026 primero (más reciente)
	  expect(sortedDesc[1].id).toBe(oldId);  // 2020 segundo

	  // Ordenar ascendente por updated_at
	  const sortedAsc = await db.getAllRecords({ sort: 'updated_at_asc' });
	  expect(sortedAsc.length).toBe(2);
	  expect(sortedAsc[0].id).toBe(oldId);   // 2020 primero
	  expect(sortedAsc[1].id).toBe(newId);   // 2026 segundo
	});

    it('debe filtrar por dirty', async () => {
      const r1 = await db.createRecord({ name: 'Dirty' });
      const r2 = await db.createRecord({ name: 'Synced' });
      
      // Marcar r2 como sincronizado
      r2.is_dirty = 0;
      await db._tx('records', 'readwrite', store => store.put(r2));

      const dirty = await db.getAllRecords({ filter: 'dirty' });
      expect(dirty.length).toBe(1);
      expect(dirty[0].id).toBe(r1.id);
    });

    it('debe paginar con limit y offset', async () => {
      for (let i = 0; i < 10; i++) {
        await db.createRecord({ name: `Record ${i}` });
      }

      const page1 = await db.getAllRecords({ limit: 3, offset: 0 });
      const page2 = await db.getAllRecords({ limit: 3, offset: 3 });

      expect(page1.length).toBe(3);
      expect(page2.length).toBe(3);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
	it('debe extraer correctamente field y dir de strings con múltiples underscores', async () => {
  // Insertar registros con timestamps conocidos
  await db._tx('records', 'readwrite', store => store.put({
    id: 2001,
    name: 'Old',
    content: '',
    tags: [], category: 'general', metadata: {}, files: [],
    created_at: '2020-01-01T00:00:00.000Z',
    updated_at: '2020-01-01T00:00:00.000Z',
    is_dirty: 1, is_deleted: 0, has_conflict: 0,
    _vc: { deviceId: 'test', clock: {} }, _origin_device: 'test'
  }));
  
  await db._tx('records', 'readwrite', store => store.put({
    id: 2002,
    name: 'New',
    content: '',
    tags: [], category: 'general', metadata: {}, files: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    is_dirty: 1, is_deleted: 0, has_conflict: 0,
    _vc: { deviceId: 'test', clock: {} }, _origin_device: 'test'
  }));

  // Descendente: nuevo (2026) primero
  const desc = await db.getAllRecords({ sort: 'updated_at_desc' });
  expect(desc[0].id).toBe(2002);
  expect(desc[1].id).toBe(2001);

  // Ascendente: antiguo (2020) primero
  const asc = await db.getAllRecords({ sort: 'updated_at_asc' });
  expect(asc[0].id).toBe(2001);
  expect(asc[1].id).toBe(2002);
});
  });

  // ============ UPDATE ============
  describe('updateRecord', () => {
    it('debe actualizar un registro', async () => {
      const created = await db.createRecord({ name: 'Original' });
      const updated = await db.updateRecord(created.id, { name: 'Modificado' });

      expect(updated.name).toBe('Modificado');
      expect(updated.is_dirty).toBe(1);
      expect(updated.id).toBe(created.id);
    });

    it('debe lanzar error si el registro no existe', async () => {
      await expect(
        db.updateRecord(999999, { name: 'Test' })
      ).rejects.toThrow();
    });

    it('debe actualizar el VectorClock al actualizar', async () => {
      const created = await db.createRecord({ name: 'Test' });
      const originalClock = { ...created._vc.clock };
      
      await db.updateRecord(created.id, { name: 'Updated' });
      
      const updated = await db.getRecord(created.id);
      expect(updated._vc.clock[db.deviceId]).toBeGreaterThan(
        originalClock[db.deviceId] || 0
      );
    });

    it('debe registrar el cambio en el change log', async () => {
      const created = await db.createRecord({ name: 'Test' });
      await db.updateRecord(created.id, { name: 'Updated' });

      const changes = await db.getUnsyncedChanges();
      expect(changes.some(c => c.operation === 'UPDATE')).toBe(true);
    });
  });

  // ============ DELETE ============
  describe('deleteRecord', () => {
    it('debe hacer soft delete por defecto', async () => {
      const created = await db.createRecord({ name: 'Test' });
      await db.deleteRecord(created.id);

      const record = await db.getRecord(created.id);
      expect(record.is_deleted).toBe(1);
      expect(record.is_dirty).toBe(1);
    });

    it('debe hacer hard delete cuando se especifica', async () => {
      const created = await db.createRecord({ name: 'Test' });
      await db.deleteRecord(created.id, false);

      const record = await db.getRecord(created.id);
      expect(record).toBeUndefined();
    });

    it('debe registrar el cambio en el change log', async () => {
      const created = await db.createRecord({ name: 'Test' });
      await db.deleteRecord(created.id);

      const changes = await db.getUnsyncedChanges();
      expect(changes.some(c => c.operation === 'DELETE')).toBe(true);
    });
  });

  // ============ CHANGE LOG ============
  describe('change log', () => {
    it('debe acumular cambios no sincronizados', async () => {
      await db.createRecord({ name: 'A' });
      await db.createRecord({ name: 'B' });
      await db.createRecord({ name: 'C' });

      const changes = await db.getUnsyncedChanges();
      expect(changes.length).toBe(3);
    });

    it('todos los cambios deben tener synced: 0', async () => {
      await db.createRecord({ name: 'Test' });
      
      const changes = await db.getUnsyncedChanges();
      changes.forEach(c => {
        expect(c.synced).toBe(0);
      });
    });
  });

  // ============ STATS ============
  describe('getStats', () => {
    it('debe devolver estadísticas correctas', async () => {
      await db.createRecord({ name: 'A' });
      await db.createRecord({ name: 'B' });

      const stats = await db.getStats();
      expect(stats.total).toBe(2);
      expect(stats.dirty).toBe(2);
      expect(stats.conflicts).toBe(0);
      expect(stats.deleted).toBe(0);
    });
  });

  // ============ META ============
  describe('meta', () => {
    it('debe guardar y leer metadata', async () => {
      await db.setMeta('test_key', 'test_value');
      const value = await db.getMeta('test_key');
      
      expect(value).toBe('test_value');
    });

    it('debe persistir el salt de cifrado', async () => {
      const salt = await db.getMeta('encryption_salt');
      expect(salt).toBeDefined();
      expect(Array.isArray(salt)).toBe(true);
      expect(salt.length).toBe(16);
    });
  });
  
  // ============ ARCHIVOS ADJUNTOS ============
  describe('Archivos adjuntos', () => {
    it('debe guardar archivos adjuntos al crear un registro', async () => {
      // Crear un archivo simulado
      const file = new File(['contenido del archivo'], 'test.txt', {
        type: 'text/plain'
      });

      const record = await db.createRecord(
        { name: 'Con archivo' },
        [file]
      );

      expect(record.files).toBeDefined();
      expect(record.files.length).toBe(1);
      expect(record.files[0].name).toBe('test.txt');
      expect(record.files[0].hash).toBeDefined();
    });
	it('debe cifrar el blob del archivo (verificación de propiedades)', async () => {
	  // Verificamos las propiedades OBSERVABLES del blob cifrado
	  // que son confiables en fake-indexeddb y en navegadores reales.
	  const file = new File(['secreto'], 'secret.txt', { type: 'text/plain' });
	  
	  const record = await db.createRecord({ name: 'Test' }, [file]);
	  const fileId = record.files[0].id;

	  const storedFile = await db._tx('files', 'readonly', store => store.get(fileId));

	  // ✅ Verificaciones que SÍ funcionan en fake-indexeddb
	  expect(storedFile.encrypted).toBe(true);
	  expect(storedFile.blob).toBeDefined();
	  expect(storedFile.blob.type).toBe('application/octet-stream');
	  expect(storedFile.mime).toBe('text/plain'); // MIME original preservado
	  expect(storedFile.size).toBeGreaterThan(0);
	});
    it.skip('debe cifrar el blob del archivo si encryptionKey está establecida', async () => {
      const file = new File(['secreto'], 'secret.txt', { type: 'text/plain' });
      
      const record = await db.createRecord({ name: 'Test' }, [file]);
      const fileId = record.files[0].id;

      const storedFile = await db._tx('files', 'readonly', store => 
        store.get(fileId)
      );

      expect(storedFile.encrypted).toBe(true);
      expect(storedFile.blob).toBeInstanceOf(Blob);
    });

    it('debe poder recuperar los archivos de un registro', async () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const record = await db.createRecord({ name: 'Test' }, [file]);

      const files = await db.getFilesByRecord(record.id);
      expect(files.length).toBe(1);
      expect(files[0].name).toBe('test.txt');
    });

    it('debe guardar archivos adicionales al actualizar', async () => {
      const created = await db.createRecord({ name: 'Test' });
      
      const file = new File(['nuevo'], 'nuevo.txt', { type: 'text/plain' });
      const updated = await db.updateRecord(created.id, {}, [file]);

      expect(updated.files.length).toBe(1);
    });
  });

  // ============ TIMESTAMP ÚNICO ============
  describe('_getUniqueTimestamp', () => {
    it('debe generar timestamps monótonamente crecientes', async () => {
      const ts1 = await db._getUniqueTimestamp();
      const ts2 = await db._getUniqueTimestamp();
      const ts3 = await db._getUniqueTimestamp();

      expect(new Date(ts2).getTime()).toBeGreaterThan(new Date(ts1).getTime());
      expect(new Date(ts3).getTime()).toBeGreaterThan(new Date(ts2).getTime());
    });

    it('debe persistir el último timestamp en meta', async () => {
      await db._getUniqueTimestamp();
      const stored = await db.getMeta('last_timestamp');
      expect(stored).toBeDefined();
      expect(typeof stored).toBe('number');
    });

    it('debe generar timestamps únicos en creación rápida de registros', async () => {
      const records = [];
      for (let i = 0; i < 5; i++) {
        records.push(await db.createRecord({ name: `Record ${i}` }));
      }

      const timestamps = records.map(r => new Date(r.updated_at).getTime());
      const uniqueTimestamps = new Set(timestamps);
      
      // Todos los timestamps deben ser únicos
      expect(uniqueTimestamps.size).toBe(5);
    });
  });

  // ============ BÚSQUEDA POR TOKENS ============
  describe('Búsqueda por tokens', () => {
    it('debe indexar tokens al crear un registro', async () => {
      await db.createRecord({
        name: 'Documento importante',
        content: 'Este es el contenido del documento'
      });

      // Verificar que los tokens están indexados
      const tokenEntry = await db._tx('search_index', 'readonly', store => 
        store.get('documento')
      );

      expect(tokenEntry).toBeDefined();
      expect(tokenEntry.record_ids.length).toBe(1);
    });

    it('debe acumular múltiples registros bajo el mismo token', async () => {
      await db.createRecord({ name: 'Documento A' });
      await db.createRecord({ name: 'Documento B' });
      await db.createRecord({ name: 'Documento C' });

      const tokenEntry = await db._tx('search_index', 'readonly', store => 
        store.get('documento')
      );

      expect(tokenEntry.record_ids.length).toBe(3);
    });

    it('no debe duplicar el ID del mismo registro', async () => {
      const record = await db.createRecord({ name: 'Documento único' });
      
      // Actualizar el registro
      await db.updateRecord(record.id, { name: 'Documento único actualizado' });

      const tokenEntry = await db._tx('search_index', 'readonly', store => 
        store.get('documento')
      );

      // El ID del registro debe aparecer solo una vez
      const count = tokenEntry.record_ids.filter(id => id === record.id).length;
      expect(count).toBe(1);
    });

    it('no debe indexar tokens de 1 carácter', async () => {
      await db.createRecord({ name: 'a b c' });

      const singleCharTokens = await Promise.all([
        db._tx('search_index', 'readonly', store => store.get('a')),
        db._tx('search_index', 'readonly', store => store.get('b')),
        db._tx('search_index', 'readonly', store => store.get('c'))
      ]);

      singleCharTokens.forEach(t => expect(t).toBeUndefined());
    });
  });

  // ============ DECRYPT RECORD CONTENT (casos edge) ============
  describe('decryptRecordContent - casos edge', () => {
    it('debe retornar el contenido vacío tal cual', async () => {
      const record = await db.createRecord({ name: 'Sin contenido' });
      const decrypted = await db.decryptRecordContent(record);
      
      expect(decrypted).toBe('');
    });

    it('debe retornar contenido sin cifrar si no hay encryptionKey', async () => {
      const dbWithoutKey = new Database();
      await dbWithoutKey.init();
      
      const record = {
        name: 'Test',
        content: 'Contenido sin cifrar'
      };
      
      const decrypted = await dbWithoutKey.decryptRecordContent(record);
      expect(decrypted).toBe('Contenido sin cifrar');
      
      dbWithoutKey.close();
    });

    it('debe manejar error de descifrado con contenido corrupto', async () => {
	  // Silenciar logs de error durante este test
	  const originalError = console.error;
	  console.error = () => {};

	  const record = {
		name: 'Test',
		content: 'no-es-base64-valido-###'
	  };

	  const decrypted = await db.decryptRecordContent(record);
	  
	  // Restaurar
	  console.error = originalError;
	  
	  expect(decrypted).toBe('[Error al descifrar]');
	});
  });

  // ============ CLEAR ALL ============
  describe('clearAll', () => {
    it('debe limpiar todos los object stores', async () => {
      // Crear datos en varios stores
      await db.createRecord({ name: 'Test 1' });
      await db.createRecord({ name: 'Test 2' });
      await db.setMeta('test_key', 'value');

      await db.clearAll();

      const records = await db.getAllRecords();
      const meta = await db.getMeta('test_key');

      expect(records.length).toBe(0);
      expect(meta).toBeUndefined();
    });
  });
});