// src/js/db/db.js

/**
 * Módulo de IndexedDB con soporte para:
 * - CRUD completo
 * - Almacenamiento de Blobs (archivos)
 * - Índices para búsqueda
 * - Change log (para sincronización)
 * - Cifrado automático de contenido
 * 
 * Referencia: EDC Página 39-52 + PAE Semana 2, Día 6-7
 */

import { CryptoUtils } from '../core/crypto-utils.js';
import { VectorClock, getDeviceId } from '../core/vector-clock.js';

// ============================================================================
// CONSTANTES
// ============================================================================

const DB_NAME = 'LocalAdminDB';
const DB_VERSION = 1;

// Nombres de los object stores
const STORES = {
  RECORDS: 'records',
  FILES: 'files',
  CHANGE_LOG: 'change_log',
  SEARCH_INDEX: 'search_index',
  META: 'meta'
};

// ============================================================================
// CLASE DATABASE
// ============================================================================

export class Database {
  constructor() {
    this.db = null;
    this.deviceId = null;      // Se inicializa en init()
    this.encryptionKey = null; // Se establece con setEncryptionKey()
    this.encryptFiles = true;
  }

  // ==========================================================================
  // INICIALIZACIÓN
  // ==========================================================================

  /**
   * Inicializa la conexión con IndexedDB y crea los object stores.
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        
        // Manejar cambios de versión en otras pestañas
        this.db.onversionchange = () => {
          this.db.close();
          console.warn('IndexedDB cerrada por cambio de versión en otra pestaña');
        };
        
        // Inicializar deviceId
        this.deviceId = getDeviceId();
        
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Object Store: records (registros principales)
        if (!db.objectStoreNames.contains(STORES.RECORDS)) {
          const store = db.createObjectStore(STORES.RECORDS, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('updated_at', 'updated_at', { unique: false });
          store.createIndex('is_dirty', 'is_dirty', { unique: false });
          store.createIndex('category', 'category', { unique: false });
        }

        // Object Store: files (Blobs de archivos)
        if (!db.objectStoreNames.contains(STORES.FILES)) {
          const fileStore = db.createObjectStore(STORES.FILES, { keyPath: 'id' });
          fileStore.createIndex('record_id', 'record_id', { unique: false });
          fileStore.createIndex('hash', 'hash', { unique: false });
          fileStore.createIndex('mime', 'mime', { unique: false });
        }

        // Object Store: change_log (para sincronización incremental)
        if (!db.objectStoreNames.contains(STORES.CHANGE_LOG)) {
          const logStore = db.createObjectStore(STORES.CHANGE_LOG, {
            keyPath: 'change_id',
            autoIncrement: true
          });
          logStore.createIndex('record_id', 'record_id', { unique: false });
          logStore.createIndex('timestamp', 'timestamp', { unique: false });
          logStore.createIndex('synced', 'synced', { unique: false });
        }

        // Object Store: search_index (tokens para búsqueda fuzzy)
        if (!db.objectStoreNames.contains(STORES.SEARCH_INDEX)) {
          const searchStore = db.createObjectStore(STORES.SEARCH_INDEX, {
            keyPath: 'token'
          });
          searchStore.createIndex('record_ids', 'record_ids', {
            unique: false,
            multiEntry: true
          });
        }

        // Object Store: meta (metadata del dispositivo)
        if (!db.objectStoreNames.contains(STORES.META)) {
          db.createObjectStore(STORES.META, { keyPath: 'key' });
        }
      };
    });
  }

  // ==========================================================================
  // CIFRADO
  // ==========================================================================

  /**
   * Establece la clave de cifrado derivada de la contraseña maestra.
   * @param {string} password 
   * @returns {Promise<boolean>}
   */
  async setEncryptionKey(password) {
    let salt = await this.getMeta('encryption_salt');
    
    if (!salt) {
      salt = CryptoUtils.generateSalt();
      await this.setMeta('encryption_salt', Array.from(salt));
    } else {
      salt = new Uint8Array(salt);
    }
    
    this.encryptionKey = await CryptoUtils.deriveKey(password, salt);
    return true;
  }

  // ==========================================================================
  // META (Metadata del dispositivo)
  // ==========================================================================

  /**
   * Obtiene un valor de metadata.
   * @param {string} key 
   * @returns {Promise<any>}
   */
  async getMeta(key) {
    const result = await this._tx(STORES.META, 'readonly', store => store.get(key));
    return result?.value;
  }

  /**
   * Establece un valor de metadata.
   * @param {string} key 
   * @param {any} value 
   * @returns {Promise<any>}
   */
  async setMeta(key, value) {
    return this._tx(STORES.META, 'readwrite', store => 
      store.put({ key, value })
    );
  }
  /**
   * Genera un timestamp único y monótonamente creciente.
   * Garantiza que dos llamadas seguidas nunca retornen el mismo valor.
   * @private
   * @returns {Promise<string>} - ISO timestamp
   */
  async _getUniqueTimestamp() {
   const lastTimestamp = await this.getMeta('last_timestamp') || 0;
   const currentTime = Date.now();
   const uniqueTime = Math.max(currentTime, lastTimestamp + 1);
   await this.setMeta('last_timestamp', uniqueTime);
   return new Date(uniqueTime).toISOString();
  }
  // ==========================================================================
  // CRUD: CREATE
  // ==========================================================================

  /**
   * Crea un nuevo registro.
   * @param {Object} data - Datos del registro
   * @param {File[]} files - Archivos adjuntos (opcional)
   * @returns {Promise<Object>} - Registro creado
   */
  async createRecord(data, files = []) {
	  const id = data.id || Date.now() + Math.floor(Math.random() * 1000);
	  const now = await this._getUniqueTimestamp();
    
    // Inicializar VectorClock para este dispositivo
    const vc = new VectorClock(this.deviceId);
    vc.increment();

    // Cifrar el contenido si hay clave
    let encryptedContent = data.content || '';
    if (this.encryptionKey && data.content) {
      encryptedContent = await CryptoUtils.encryptString(data.content, this.encryptionKey);
    }

    const record = {
      id,
      name: data.name || 'Sin nombre',
      content: encryptedContent,      // Cifrado
      tags: data.tags || [],
      category: data.category || 'general',
      metadata: data.metadata || {},
      files: [],
      created_at: now,
      updated_at: now,
      is_dirty: 1,                     // Pendiente de sincronizar
      is_deleted: 0,
      has_conflict: 0,
      _vc: vc.toJSON(),
      _origin_device: this.deviceId
    };

    // Guardar archivos adjuntos
    if (files.length > 0) {
      record.files = await this._saveFiles(id, files);
    }

    // Guardar en IndexedDB
    await this._tx(STORES.RECORDS, 'readwrite', store => store.put(record));
    
    // Registrar en el change log
    await this._logChange(id, 'CREATE', record);
    
    // Indexar para búsqueda
    await this._indexRecord(record, data.content);

    return record;
  }

  // ==========================================================================
  // CRUD: READ
  // ==========================================================================

  /**
   * Obtiene un registro por ID.
   * @param {number} id 
   * @returns {Promise<Object|undefined>}
   */
  async getRecord(id) {
    return this._tx(STORES.RECORDS, 'readonly', store => store.get(id));
  }

  /**
   * Obtiene todos los registros con opciones de filtrado y ordenamiento.
   * @param {Object} options 
   * @returns {Promise<Object[]>}
   */
   
  async getAllRecords({ 
    limit = null, 
    offset = 0, 
    sort = 'updated_at_desc', 
    filter = 'all' 
  } = {}) {
    const all = await this._tx(STORES.RECORDS, 'readonly', store => 
      store.getAll()
    );

    // Filtrar
    let filtered = all.filter(r => !r.is_deleted || filter === 'deleted');
    if (filter === 'dirty') filtered = filtered.filter(r => r.is_dirty === 1);
    if (filter === 'synced') filtered = filtered.filter(r => r.is_dirty === 0 && !r.has_conflict);
    if (filter === 'conflict') filtered = filtered.filter(r => r.has_conflict === 1);

     // Ordenar
	const lastUnderscoreIndex = sort.lastIndexOf('_');
	const field = sort.substring(0, lastUnderscoreIndex);
	const dir = sort.substring(lastUnderscoreIndex + 1);
	const isAsc = dir === 'asc';

	filtered.sort((a, b) => {
	  let va = a[field];
	  let vb = b[field];

	  // Convertir a timestamps si es fecha
	  if (field === 'updated_at' || field === 'created_at') {
		va = new Date(va).getTime();
		vb = new Date(vb).getTime();
	  }

	  // Convertir a string si es nombre
	  if (field === 'name') {
		va = (va || '').toLowerCase();
		vb = (vb || '').toLowerCase();
	  }

	  // Comparación explícita
	  let result;
	  if (va < vb) result = -1;
	  else if (va > vb) result = 1;
	  else result = 0;

	  // Invertir si es descendente
	  return isAsc ? result : -result;
	});
    // Paginar
    if (limit) return filtered.slice(offset, offset + limit);
    return filtered;
  }

  /**
   * Descifra el contenido de un registro.
   * @param {Object} record 
   * @returns {Promise<string>}
   */
  async decryptRecordContent(record) {
    if (!this.encryptionKey || !record.content) return record.content;
    
    try {
      return await CryptoUtils.decryptString(record.content, this.encryptionKey);
    } catch (e) {
      console.error('Error descifrando registro:', e);
      return '[Error al descifrar]';
    }
  }

  // ==========================================================================
  // CRUD: UPDATE
  // ==========================================================================

  /**
   * Actualiza un registro existente.
   * @param {number} id 
   * @param {Object} data 
   * @param {File[]} newFiles 
   * @returns {Promise<Object>}
   */
  async updateRecord(id, data, newFiles = []) {
	  const existing = await this.getRecord(id);
  if (!existing) throw new Error(`Registro ${id} no encontrado`);

  const now = await this._getUniqueTimestamp();

    // Actualizar VectorClock
    const vc = VectorClock.fromJSON(
      existing._vc || { deviceId: this.deviceId, clock: {} },
      this.deviceId
    );
    vc.increment();

    // Cifrar nuevo contenido si hay
    let encryptedContent = existing.content;
    if (data.content !== undefined && this.encryptionKey) {
      encryptedContent = await CryptoUtils.encryptString(data.content, this.encryptionKey);
    } else if (data.content !== undefined) {
      encryptedContent = data.content;
    }

    const updated = {
      ...existing,
      ...data,
      id,
      content: encryptedContent,
      updated_at: now,
      is_dirty: 1,
      _vc: vc.toJSON(),
      _origin_device: this.deviceId
    };

    // Guardar nuevos archivos
    if (newFiles.length > 0) {
      const savedFiles = await this._saveFiles(id, newFiles);
      updated.files = [...(existing.files || []), ...savedFiles];
    }

    await this._tx(STORES.RECORDS, 'readwrite', store => store.put(updated));
    await this._logChange(id, 'UPDATE', updated);
    await this._indexRecord(updated, data.content);

    return updated;
  }

  // ==========================================================================
  // CRUD: DELETE
  // ==========================================================================

  /**
   * Elimina un registro (soft delete por defecto).
   * @param {number} id 
   * @param {boolean} soft 
   * @returns {Promise<boolean>}
   */
  async deleteRecord(id, soft = true) {
    const existing = await this.getRecord(id);
    if (!existing) return false;

    if (soft) {
      const vc = VectorClock.fromJSON(
        existing._vc || { deviceId: this.deviceId, clock: {} },
        this.deviceId
      );
      vc.increment();

      const updated = {
        ...existing,
        is_deleted: 1,
        is_dirty: 1,
        updated_at: new Date().toISOString(),
        _vc: vc.toJSON()
      };

      await this._tx(STORES.RECORDS, 'readwrite', store => store.put(updated));
      await this._logChange(id, 'DELETE', updated);
    } else {
      // Hard delete: eliminar archivos asociados primero
      const files = await this.getFilesByRecord(id);
      for (const f of files) {
        await this._tx(STORES.FILES, 'readwrite', store => store.delete(f.id));
      }
      
      await this._tx(STORES.RECORDS, 'readwrite', store => store.delete(id));
      await this._logChange(id, 'HARD_DELETE', { id });
    }

    return true;
  }

  // ==========================================================================
  // ARCHIVOS
  // ==========================================================================

  /**
   * Guarda archivos asociados a un registro.
   * @private
   */
  async _saveFiles(recordId, files) {
    const saved = [];

    for (const file of files) {
      const hash = await CryptoUtils.hashBlob 
        ? await CryptoUtils.hashBlob(file)
        : await CryptoUtils.hash(await file.arrayBuffer());

      const fileId = `file_${hash.slice(0, 16)}_${Date.now()}`;

      // Cifrar el blob si está habilitado
      let storedBlob = file;
      let encrypted = false;
      
      if (this.encryptFiles && this.encryptionKey) {
        const arrayBuffer = await file.arrayBuffer();
        const encryptedBuffer = await CryptoUtils.encrypt(
          new Uint8Array(arrayBuffer),
          this.encryptionKey
        );
        storedBlob = new Blob([encryptedBuffer], { type: 'application/octet-stream' });
        encrypted = true;
      }

      const fileRecord = {
        id: fileId,
        record_id: recordId,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        hash,
        blob: storedBlob,
        encrypted,
        created_at: new Date().toISOString()
      };

      await this._tx(STORES.FILES, 'readwrite', store => store.put(fileRecord));

      saved.push({
        id: fileId,
        name: file.name,
        size: file.size,
        mime: fileRecord.mime,
        hash
      });
    }

    return saved;
  }

  /**
   * Obtiene los metadatos de archivos de un registro.
   * @param {number} recordId 
   * @returns {Promise<Object[]>}
   */
  async getFilesByRecord(recordId) {
    return this._tx(STORES.FILES, 'readonly', store => 
      store.index('record_id').getAll(recordId)
    );
  }

  // ==========================================================================
  // CHANGE LOG (para sincronización)
  // ==========================================================================

  /**
   * Registra un cambio en el change log.
   * @private
   */
  async _logChange(recordId, operation, data) {
    return this._tx(STORES.CHANGE_LOG, 'readwrite', store => store.add({
      record_id: recordId,
      operation,
      data: JSON.parse(JSON.stringify(data)),
      timestamp: new Date().toISOString(),
      synced: 0
    }));
  }

  /**
   * Obtiene los cambios pendientes de sincronizar.
   * @returns {Promise<Object[]>}
   */
  async getUnsyncedChanges() {
    return this._tx(STORES.CHANGE_LOG, 'readonly', store => 
      store.index('synced').getAll(0)
    );
  }

  // ==========================================================================
  // BÚSQUEDA (índice de tokens)
  // ==========================================================================

  /**
   * Indexa un registro para búsqueda fuzzy.
   * @private
   */
  async _indexRecord(record, originalContent = null) {
    const content = originalContent || record.content || '';
    const text = `${record.name} ${content} ${(record.tags || []).join(' ')}`;
    const tokens = this._tokenize(text);

    for (const token of tokens) {
      const existing = await this._tx(STORES.SEARCH_INDEX, 'readonly', store => 
        store.get(token)
      );

      if (existing) {
        if (!existing.record_ids.includes(record.id)) {
          existing.record_ids.push(record.id);
          await this._tx(STORES.SEARCH_INDEX, 'readwrite', store => 
            store.put(existing)
          );
        }
      } else {
        await this._tx(STORES.SEARCH_INDEX, 'readwrite', store => store.put({
          token,
          record_ids: [record.id]
        }));
      }
    }
  }

  /**
   * Tokeniza un texto para búsqueda.
   * @private
   */
  _tokenize(text) {
    return String(text)
      .toLowerCase()
      .replace(/[^\wáéíóúñü\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  // ==========================================================================
  // UTILIDADES
  // ==========================================================================

  /**
   * Ejecuta una transacción genérica sobre IndexedDB.
   * @private
   */
  _tx(storeName, mode, operation) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = operation(store);

      if (request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } else {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      }
    });
  }

  /**
   * Obtiene estadísticas de la base de datos.
   * @returns {Promise<Object>}
   */
  async getStats() {
    const records = await this.getAllRecords();
    const dirty = records.filter(r => r.is_dirty === 1).length;
    const conflicts = records.filter(r => r.has_conflict === 1).length;
    const deleted = records.filter(r => r.is_deleted === 1).length;

    let storage = 0;
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      storage = est.usage || 0;
    }

    return {
      total: records.length,
      dirty,
      conflicts,
      deleted,
      storage
    };
  }

  /**
   * Limpia toda la base de datos.
   * @returns {Promise<boolean>}
   */
  async clearAll() {
    const stores = Object.values(STORES);
    for (const name of stores) {
      await this._tx(name, 'readwrite', store => store.clear());
    }
    return true;
  }

  /**
   * Cierra la conexión con IndexedDB.
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
  async markChangeSynced(changeId) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction('change_log', 'readwrite');
			const store = tx.objectStore('change_log');
			const request = store.get(changeId);
			
			request.onsuccess = () => {
				const change = request.result;
				if (change) {
					change.synced = 1;
					const updateRequest = store.put(change);
					updateRequest.onsuccess = () => resolve(true);
					updateRequest.onerror = () => reject(updateRequest.error);
				} else {
					resolve(false);
				}
			};
			request.onerror = () => reject(request.error);
		});
	}
	/**
	 * Obtiene el ID del último cambio sincronizado.
	 * @returns {Promise<number>}
	 */
	async getLastChangeId() {
		const value = await this.getMeta('last_change_id');
		return value ?? 0;
	}

	/**
	 * Establece el ID del último cambio sincronizado.
	 * @param {number} changeId
	 * @returns {Promise<any>}
	 */
	async setLastChangeId(changeId) {
		return this.setMeta('last_change_id', changeId);
	}
}

// ============================================================================
// SINGLETON
// ============================================================================

export const db = new Database();
