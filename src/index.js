// src/js/index.js

/**
 * Punto de entrada principal del core de LocalAdmin Omega.
 * 
 * Exporta todos los módulos del proyecto con lazy loading
 * para los módulos pesados (vectordb, ml, p2p).
 */

// ============================================================
// NIVEL 1: Núcleo Criptográfico (carga inmediata)
// ============================================================
export { CryptoUtils } from './core/crypto-utils.js';
export { VectorClock, getDeviceId } from './core/vector-clock.js';
export { MerkleTree } from './core/audit/merkle-tree.js';
export { BlockchainAudit } from './core/audit/blockchain-audit.js';

// ============================================================
// NIVEL 2: Motor de Datos (carga inmediata para CRUD básico)
// ============================================================
export { Database, db } from './db/db.js';
export { Compression, ChunkedCompressor } from './compression.js';

// ============================================================
// LAZY LOADING: Módulos pesados bajo demanda
// ============================================================

/**
 * Carga SemanticDatabase (con embeddings) bajo demanda.
 * @returns {Promise<typeof import('./db/semantic-db.js')>}
 */
export const loadSemanticDB = () => import('./db/semantic-db.js');

/**
 * Carga HNSWIndex (búsqueda vectorial) bajo demanda.
 * @returns {Promise<typeof import('./vectordb/hnsw-wasm.js')>}
 */
export const loadHNSW = () => import('./vectordb/hnsw-wasm.js');

/**
 * Carga módulos de inteligencia bajo demanda.
 * @returns {Promise<Object>}
 */
export const loadIntelligence = () => import('./intelligence/index.js');

/**
 * Carga módulos ML bajo demanda.
 * @returns {Promise<typeof import('./ml/model-manager.js')>}
 */
export const loadML = () => import('./ml/model-manager.js');

/**
 * Carga módulos de sincronización bajo demanda.
 * @returns {Promise<Object>}
 */
export const loadSync = () => import('./sync/index.js');

/**
 * Carga módulos P2P bajo demanda.
 * @returns {Promise<Object>}
 */
export const loadP2P = () => import('./p2p/index.js');

/**
 * Carga módulos de gobernanza (RBAC, policies, workflows) bajo demanda.
 * @returns {Promise<Object>}
 */
export const loadPlatform = async () => {
    const [rbac, policy, workflows] = await Promise.all([
        import('./tenant/rbac.js'),
        import('./tenant/policy-engine.js'),
        import('./workflows/workflow-engine.js')
    ]);
    return { ...rbac, ...policy, ...workflows };
};