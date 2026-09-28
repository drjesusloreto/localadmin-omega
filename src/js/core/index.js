// src/js/core/index.js

/**
 * Punto de entrada del núcleo de LocalAdmin Omega.
 * 
 * Exporta todas las utilidades del Nivel 1:
 * - CryptoUtils: Cifrado AES-256-GCM, PBKDF2, hash SHA-256
 * - VectorClock: Detección de conflictos multi-dispositivo
 * - MerkleTree: Verificación de integridad
 * - BlockchainAudit: Cadena de auditoría inmutable
 */

export { CryptoUtils } from './crypto-utils.js';
export { VectorClock, getDeviceId } from './vector-clock.js';
export { MerkleTree } from './audit/merkle-tree.js';
export { BlockchainAudit } from './audit/blockchain-audit.js';