// src/js/sync/conflict-resolver.js
import { VectorClock } from '../core/vector-clock.js';

/**
 * Resolución de conflictos a nivel de campo usando vector clocks.
 * 
 * Estrategias:
 * - Vector clocks: detecta before/after/concurrent/equal.
 * - Field merge: si son concurrent, merge campo a campo por timestamp.
 * - Last-write-wins: fallback cuando no hay vector clocks.
 * 
 * Referencia: EDC Página 60-65 + PAE Semana 4, Día 15
 */
export class ConflictResolver {
    /**
     * @param {string} strategy - 'vector-clock' | 'last-write-wins' (default: 'vector-clock')
     */
    constructor(strategy = 'vector-clock') {
		this.strategy = strategy ?? 'vector-clock';
	}

    /**
     * Resuelve el conflicto entre un registro local y uno remoto.
     * 
     * @param {Object} localRecord
     * @param {Object} remoteRecord
     * @param {Object} fieldTimestamps
     * @returns {{ winner: Object, resolution: string, conflicts?: Array }}
     */
    resolve(localRecord, remoteRecord, fieldTimestamps = {}) {
        // Caso 1: No hay local → usar remoto
        if (!localRecord) {
            return { winner: remoteRecord, resolution: 'remote-new' };
        }

        // Caso 2: No hay remoto → usar local
        if (!remoteRecord) {
            return { winner: localRecord, resolution: 'local-new' };
        }

        // Caso 3: Comparar vector clocks si existen
        const localClock = localRecord._vc 
            ? new VectorClock(localRecord._vc.deviceId || '', localRecord._vc.clock || {})
            : null;
        const remoteClock = remoteRecord._vc 
            ? new VectorClock(remoteRecord._vc.deviceId || '', remoteRecord._vc.clock || {})
            : null;

        if (!localClock || !remoteClock) {
            return this._fallbackResolve(localRecord, remoteRecord);
        }

        const comparison = localClock.compare(remoteClock);

        if (comparison === 'before') {
            return { winner: remoteRecord, resolution: 'remote-wins' };
        }
        if (comparison === 'after') {
            return { winner: localRecord, resolution: 'local-wins' };
        }
        if (comparison === 'equal') {
            return { winner: localRecord, resolution: 'equal' };
        }

        // Concurrent: merge a nivel de campo
        return this.mergeFields(localRecord, remoteRecord, fieldTimestamps);
    }

    /**
     * Fallback: last-write-wins basado en updated_at.
     * @private
     */
    _fallbackResolve(local, remote) {
        const localTime = new Date(local.updated_at || 0).getTime();
        const remoteTime = new Date(remote.updated_at || 0).getTime();

        if (localTime >= remoteTime) {
            return { winner: local, resolution: 'local-lww' };
        }
        return { winner: remote, resolution: 'remote-lww' };
    }

    /**
     * Merge de campos: por cada campo en conflicto, elige el más reciente.
     * 
     * @param {Object} local
     * @param {Object} remote
     * @param {Object} fieldTimestamps
     * @returns {{ winner: Object, resolution: string, conflicts: Array }}
     */
    mergeFields(local, remote, fieldTimestamps) {
        const merged = { ...local };
        const conflicts = [];
        const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);

        for (const key of allKeys) {
            // Ignorar campos internos
            if (key.startsWith('_')) continue;
            if (key === 'id') continue;
            if (key === 'updated_at') continue;

            const localVal = local[key];
            const remoteVal = remote[key];

            // Si son iguales, no hay conflicto
            if (JSON.stringify(localVal) === JSON.stringify(remoteVal)) continue;

            const localTs = fieldTimestamps[key]?.local || local.updated_at || 0;
            const remoteTs = fieldTimestamps[key]?.remote || remote.updated_at || 0;

            if (new Date(localTs) >= new Date(remoteTs)) {
                merged[key] = localVal;
            } else {
                merged[key] = remoteVal;
            }

            conflicts.push({
                field: key,
                localValue: localVal,
                remoteValue: remoteVal,
                resolvedWith: new Date(localTs) >= new Date(remoteTs) ? 'local' : 'remote'
            });
        }

        merged.updated_at = new Date().toISOString();
        merged.has_conflict = 0; // Ya resuelto

        return {
            winner: merged,
            resolution: conflicts.length > 0 ? 'field-merge' : 'equal',
            conflicts
        };
    }

    /**
     * Fusiona listas de archivos (no sobrescribe, une por hash).
     * 
     * @param {Array} localFiles
     * @param {Array} remoteFiles
     * @returns {Array}
     */
    static mergeFiles(localFiles = [], remoteFiles = []) {
        const map = new Map();

        for (const f of [...localFiles, ...remoteFiles]) {
            if (!f.hash) continue;
            
            if (!map.has(f.hash)) {
                map.set(f.hash, f);
            } else {
                const existing = map.get(f.hash);
                if (new Date(f.updated_at || 0) > new Date(existing.updated_at || 0)) {
                    map.set(f.hash, f);
                }
            }
        }

        return Array.from(map.values());
    }

    /**
     * Merge de tags (unión de ambas listas, sin duplicados).
     * 
     * @param {Array<string>} localTags
     * @param {Array<string>} remoteTags
     * @returns {Array<string>}
     */
    static mergeTags(localTags = [], remoteTags = []) {
        return Array.from(new Set([...localTags, ...remoteTags]));
    }
}