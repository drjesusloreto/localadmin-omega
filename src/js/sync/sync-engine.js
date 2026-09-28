// src/js/sync/sync-engine.js

/**
 * Motor de sincronización bidireccional con GAS.
 * 
 * Características:
 * - Subida incremental de cambios locales (change_log).
 * - Descarga de cambios remotos.
 * - Resolución de conflictos con ConflictResolver.
 * - Persistencia del último changeId sincronizado.
 * 
 * Referencia: EDC Página 60-65 + PAE Semana 4, Día 15
 */
export class SyncEngine {
    /**
     * @param {Object} db - Instancia de Database (o SemanticDatabase).
     * @param {Object} gasClient - Instancia de GasClient.
     * @param {Object} conflictResolver - Instancia de ConflictResolver.
     */
    constructor(db, gasClient, conflictResolver) {
        this.db = db;
        this.gasClient = gasClient;
        this.conflictResolver = conflictResolver;
        this.lastSyncReport = null;
    }

    /**
     * Sube los cambios locales no sincronizados a GAS.
     * 
     * @returns {Promise<Object>} - Reporte de subida.
     */
    async uploadLocalChanges() {
        const report = {
            uploaded: 0,
            failed: 0,
            errors: [],
            uploadedIds: []
        };

        let changes;
        try {
            changes = await this.db.getUnsyncedChanges();
        } catch (e) {
            report.errors.push({ phase: 'getChanges', error: e.message });
            return report;
        }

        if (!changes || changes.length === 0) {
            return report;
        }

        for (const change of changes) {
            try {
                const response = await this.gasClient.syncMetadata({
                    change_id: change.change_id,
                    record_id: change.record_id,
                    operation: change.operation,
                    data: change.data,
                    timestamp: change.timestamp
                });

                if (response && response.success !== false) {
                    await this.db.markChangeSynced(change.change_id);
                    report.uploaded++;
                    report.uploadedIds.push(change.change_id);
                } else {
                    report.failed++;
                    report.errors.push({
                        changeId: change.change_id,
                        error: response?.error || 'Respuesta sin success'
                    });
                }
            } catch (e) {
                report.failed++;
                report.errors.push({
                    changeId: change.change_id,
                    error: e.message
                });
            }
        }

        this.lastSyncReport = report;
        return report;
    }

    /**
     * Obtiene el reporte de la última sincronización.
     * @returns {Object|null}
     */
    getLastSyncReport() {
        return this.lastSyncReport;
    }
}