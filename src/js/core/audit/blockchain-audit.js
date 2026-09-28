// src/js/core/audit/blockchain-audit.js

/**
 * Auditoría con cadena de bloques (hash chain).
 * 
 * Cada bloque se enlaza con el hash del anterior para garantizar
 * la inmutabilidad de la cadena. Si alguien modifica un bloque,
 * los hashes posteriores dejan de coincidir.
 * 
 * Aplicación en LocalAdmin:
 *   - Auditar todas las operaciones CRUD
 *   - Detectar manipulación de datos
 *   - Proporcionar evidencia forense
 * 
 * Referencia: EDC Página 384-388 + PAE Semana 1, Día 5
 */

import { CryptoUtils } from '../crypto-utils.js';
import { MerkleTree } from './merkle-tree.js';

const CHAIN_KEY = 'audit_chain';
const BLOCK_SIZE = 50; // Eventos por bloque

export class BlockchainAudit {
  constructor() {
    this.chain = [];
    this.pendingEvents = [];
  }

  /**
   * Inicializa la cadena desde localStorage (si existe).
   * @returns {Promise<BlockchainAudit>}
   */
  async init() {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(CHAIN_KEY);
      if (stored) {
        try {
          this.chain = JSON.parse(stored);
        } catch (e) {
          console.warn('Error cargando cadena, iniciando vacía:', e);
          this.chain = [];
        }
      }
    }
    return this;
  }

  /**
   * Registra un evento en la cadena.
   * Si se alcanza el tamaño del bloque, lo sella.
   * 
   * @param {Object} event - Evento a registrar
   * @returns {Promise<Object>} - Evento registrado
   */
  async log(event) {
    const registeredEvent = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      id: event.id || this._generateId()
    };

    this.pendingEvents.push(registeredEvent);

    // Si alcanzamos el tamaño de bloque, sellar
    if (this.pendingEvents.length >= BLOCK_SIZE) {
      await this.sealBlock();
    }

    return registeredEvent;
  }

  /**
   * Sella un bloque en la cadena.
   * Combina los eventos pendientes en un bloque inmutable.
   * 
   * @returns {Promise<Object|null>} - Bloque sellado o null si no hay eventos
   */
  async sealBlock() {
    if (this.pendingEvents.length === 0) return null;

    const previousBlock = this.chain[this.chain.length - 1];
    const previousHash = previousBlock
      ? previousBlock.hash
      : '0'.repeat(64); // Génesis: 64 ceros

    // Crear el Merkle Tree de los eventos pendientes
    const tree = await MerkleTree.fromData(this.pendingEvents);
    const merkleRoot = tree.getRoot();

    // Datos del bloque (sin el hash)
    const blockData = {
      index: this.chain.length,
      timestamp: new Date().toISOString(),
      previousHash,
      merkleRoot,
      eventsCount: this.pendingEvents.length,
      events: this.pendingEvents.slice()
    };

    // Calcular hash del bloque
    const blockHash = await CryptoUtils.hash(JSON.stringify(blockData));

    const block = {
      ...blockData,
      hash: blockHash
    };

    this.chain.push(block);
    this.pendingEvents = [];
    this._persist();

    return block;
  }

  /**
   * Verifica la integridad completa de la cadena.
   * 
   * @returns {Promise<{valid: boolean, blocks: number, errors: Array}>}
   */
  async verify() {
    const report = {
      valid: true,
      blocks: this.chain.length,
      errors: []
    };

    for (let i = 0; i < this.chain.length; i++) {
      const block = this.chain[i];

      // 1. Verificar el hash del bloque
      const blockData = { ...block };
      delete blockData.hash;
      const expectedHash = await CryptoUtils.hash(JSON.stringify(blockData));

      if (expectedHash !== block.hash) {
        report.valid = false;
        report.errors.push({
          index: i,
          error: 'Hash del bloque no coincide'
        });
      }

      // 2. Verificar el enlace con el bloque anterior
      if (i > 0) {
        const prevBlock = this.chain[i - 1];
        if (block.previousHash !== prevBlock.hash) {
          report.valid = false;
          report.errors.push({
            index: i,
            error: 'Enlace con bloque anterior roto'
          });
        }
      } else {
        // Bloque génesis
        if (block.previousHash !== '0'.repeat(64)) {
          report.valid = false;
          report.errors.push({
            index: i,
            error: 'Génesis inválido'
          });
        }
      }

      // 3. Verificar el Merkle Root
      const tree = await MerkleTree.fromData(block.events);
      if (tree.getRoot() !== block.merkleRoot) {
        report.valid = false;
        report.errors.push({
          index: i,
          error: 'Merkle Root no coincide'
        });
      }
    }

    return report;
  }

  /**
   * Exporta la cadena como JSON string.
   * @returns {string}
   */
  export() {
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      blocks: this.chain,
      pending: this.pendingEvents,
      length: this.chain.length
    }, null, 2);
  }

  /**
   * Importa una cadena desde JSON.
   * Verifica su integridad antes de aceptarla.
   * 
   * @param {string} json 
   * @returns {Promise<Object>} - Reporte de verificación
   */
  async import(json) {
    const data = JSON.parse(json);
    const backup = this.chain.slice();

    this.chain = data.blocks || [];
    this.pendingEvents = data.pending || [];

    const verification = await this.verify();

    if (!verification.valid) {
      this.chain = backup;
      throw new Error(
        'Cadena importada no válida: ' +
        verification.errors.map(e => e.error).join(', ')
      );
    }

    this._persist();
    return verification;
  }

  /**
   * Devuelve estadísticas de la cadena.
   * @returns {Object}
   */
  getStats() {
    return {
      totalBlocks: this.chain.length,
      totalEvents: this.chain.reduce((s, b) => s + b.eventsCount, 0) +
        this.pendingEvents.length,
      pendingEvents: this.pendingEvents.length,
      lastBlock: this.chain[this.chain.length - 1] || null,
      firstBlock: this.chain[0] || null
    };
  }

  /**
   * Busca eventos por predicado.
   * @param {Function} predicate - Función de filtro
   * @returns {Array<Object>}
   */
  findEvents(predicate) {
    const events = [];

    for (const block of this.chain) {
      for (const event of block.events) {
        if (predicate(event)) {
          events.push({
            ...event,
            blockIndex: block.index,
            blockHash: block.hash
          });
        }
      }
    }

    for (const event of this.pendingEvents) {
      if (predicate(event)) {
        events.push({ ...event, pending: true });
      }
    }

    return events;
  }

  /**
   * Persiste la cadena en localStorage.
   * @private
   */
  _persist() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(CHAIN_KEY, JSON.stringify(this.chain));
      } catch (e) {
        console.warn('No se pudo persistir la cadena:', e);
      }
    }
  }

  /**
   * Limpia la cadena.
   */
  clear() {
    this.chain = [];
    this.pendingEvents = [];
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CHAIN_KEY);
    }
  }

  /**
   * Genera un ID único para un evento.
   * @private
   */
  _generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}