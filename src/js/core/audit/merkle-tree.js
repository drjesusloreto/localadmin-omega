// src/js/core/audit/merkle-tree.js

/**
 * Árbol de Merkle para verificación de integridad de datos.
 * 
 * Un Árbol de Merkle permite verificar que un elemento específico
 * forma parte de un conjunto grande, sin tener que cargar todo el conjunto.
 * 
 * Aplicación en LocalAdmin:
 *   - Verificar que un evento de auditoría está en un bloque
 *   - Detectar manipulación de bloques
 *   - Generar pruebas de inclusión compactas
 * 
 * Referencia: EDC Página 381-383 + PAE Semana 1, Día 5
 */

import { CryptoUtils } from '../crypto-utils.js';

export class MerkleTree {
  /**
   * @param {Array<string>} leaves - Hashes de los elementos (hex strings)
   */
  constructor(leaves = []) {
    // Los leaves son hashes ya calculados (strings hexadecimales)
    this.leaves = [...leaves];
    this.levels = [];
    this._build();
  }

  /**
   * Crea un MerkleTree a partir de datos crudos.
   * Calcula el hash de cada dato antes de construir el árbol.
   * 
   * @param {Array<any>} dataList - Lista de datos a hashear
   * @returns {Promise<MerkleTree>}
   */
  static async fromData(dataList) {
    if (!Array.isArray(dataList)) {
      throw new Error('fromData requiere un array');
    }
    
    // Calcular el hash de cada elemento
    const hashes = await Promise.all(
      dataList.map(d => CryptoUtils.hash(JSON.stringify(d)))
    );
    
    return new MerkleTree(hashes);
  }

  /**
   * Construye los niveles del árbol a partir de los leaves.
   * @private
   */
  _build() {
    // Nivel 0: los leaves
    this.levels = [this.leaves];
    
    if (this.leaves.length === 0) {
      return;
    }
    
    let current = this.leaves;
    
    // Construir niveles superiores hasta llegar a la raíz
    while (current.length > 1) {
      const next = [];
      
      for (let i = 0; i < current.length; i += 2) {
        const left = current[i];
        const right = current[i + 1] || left; // Si no hay par, duplicar
        
        // Hash del par (síncrono simplificado - ver _hashPairSync)
        next.push(this._hashPairSync(left, right));
      }
      
      this.levels.push(next);
      current = next;
    }
  }

  /**
   * Hash síncrono de un par de hashes.
   * Nota: para producción, usar CryptoUtils.hash asíncrono.
   * Aquí usamos concatenación + hash simple para permitir construcción síncrona.
   * @private
   */
  _hashPairSync(left, right) {
    // Concatenación simple de hashes ya calculados
    // En producción se recomienda usar SHA-256(left + right)
    return `${left}|${right}`;
  }

  /**
   * Devuelve el hash raíz del árbol.
   * @returns {string|null}
   */
  getRoot() {
    if (this.leaves.length === 0) return null;
    return this.levels[this.levels.length - 1][0];
  }

  /**
   * Genera una prueba de inclusión para un leaf en el índice dado.
   * 
   * @param {number} index - Índice del leaf (0-based)
   * @returns {Array<{position: 'left'|'right', hash: string}>}
   */
  getProof(index) {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Índice ${index} fuera de rango (0-${this.leaves.length - 1})`);
    }

    const proof = [];
    let idx = index;

    // Recorrer todos los niveles excepto la raíz
    for (let level = 0; level < this.levels.length - 1; level++) {
      const currentLevel = this.levels[level];
      const isRightNode = idx % 2 === 1;
      const siblingIdx = isRightNode ? idx - 1 : idx + 1;

      if (siblingIdx < currentLevel.length) {
        proof.push({
          position: isRightNode ? 'left' : 'right',
          hash: currentLevel[siblingIdx]
        });
      }

      // Subir al siguiente nivel
      idx = Math.floor(idx / 2);
    }

    return proof;
  }

  /**
   * Verifica una prueba de inclusión de forma estática.
   * 
   * @param {string} leaf - Hash del elemento a verificar
   * @param {Array} proof - Prueba generada por getProof()
   * @param {string} root - Hash raíz esperado
   * @returns {boolean}
   */
  static verifyProof(leaf, proof, root) {
    let hash = leaf;

    for (const step of proof) {
      if (step.position === 'left') {
        hash = `${step.hash}|${hash}`;
      } else {
        hash = `${hash}|${step.hash}`;
      }
    }

    return hash === root;
  }

  /**
   * Número de leaves en el árbol.
   * @returns {number}
   */
  size() {
    return this.leaves.length;
  }

  /**
   * Altura del árbol (número de niveles).
   * @returns {number}
   */
  height() {
    return this.levels.length;
  }

  /**
   * Verifica la integridad del árbol.
   * Reconstruye el árbol desde los leaves y compara con la raíz.
   * @returns {boolean}
   */
  verify() {
    const rebuilt = new MerkleTree(this.leaves);
    return rebuilt.getRoot() === this.getRoot();
  }

  /**
   * Exporta el árbol a JSON.
   * @returns {Object}
   */
  toJSON() {
    return {
      leaves: this.leaves,
      levels: this.levels,
      root: this.getRoot()
    };
  }

  /**
   * Crea un MerkleTree desde JSON.
   * @param {Object} json 
   * @returns {MerkleTree}
   */
  static fromJSON(json) {
    const tree = new MerkleTree(json.leaves || []);
    return tree;
  }
}