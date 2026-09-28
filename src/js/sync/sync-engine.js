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
	/**
	 * Descarga los cambios remotos desde GAS y los aplica a la DB local.
	 * Resuelve conflictos automáticamente usando ConflictResolver.
	 * 
	 * @returns {Promise<Object>} - Reporte de descarga.
	 */
	async downloadRemoteChanges() {
		const report = {
			downloaded: 0,
			conflicts: 0,
			applied: 0,
			errors: [],
			newLastChangeId: null
		};

		// 1. Obtener el último changeId sincronizado
		let lastChangeId = 0;
		try {
			lastChangeId = await this.db.getLastChangeId();
		} catch (e) {
			report.errors.push({ phase: 'getLastChangeId', error: e.message });
			return report;
		}

		// 2. Obtener cambios remotos desde GAS
		let response;
		try {
			response = await this.gasClient.getChangesSince(lastChangeId);
		} catch (e) {
			report.errors.push({ phase: 'getChangesSince', error: e.message });
			return report;
		}

		const remoteChanges = response?.changes || [];
		if (remoteChanges.length === 0) {
			return report;
		}

		report.downloaded = remoteChanges.length;
		let maxChangeId = lastChangeId;

		// 3. Procesar cada cambio remoto
		for (const remoteChange of remoteChanges) {
			try {
				// Actualizar maxChangeId
				if (remoteChange.change_id > maxChangeId) {
					maxChangeId = remoteChange.change_id;
				}

				const remoteRecord = remoteChange.data;
				if (!remoteRecord || !remoteRecord.id) {
					report.errors.push({
						changeId: remoteChange.change_id,
						error: 'Registro remoto sin id'
					});
					continue;
				}

				// Buscar el registro local
				const localRecord = await this.db.getRecord(remoteRecord.id);

				// Caso 1: No existe local → crear
				if (!localRecord) {
					await this._applyRemoteRecord(remoteRecord);
					report.applied++;
					continue;
				}

				// Caso 2: Existe local → resolver conflicto
				const resolution = this.conflictResolver.resolve(localRecord, remoteRecord);

				if (resolution.resolution === 'equal') {
					// No hacer nada
					continue;
				}

				if (resolution.resolution === 'remote-wins' ||
					resolution.resolution === 'remote-new' ||
					resolution.resolution === 'remote-lww' ||
					resolution.resolution === 'field-merge') {
					await this._applyRemoteRecord(resolution.winner);
					report.applied++;
					if (resolution.conflicts && resolution.conflicts.length > 0) {
						report.conflicts++;
					}
				} else {
					// local-wins o local-lww: no aplicar
					report.applied++;
				}
			} catch (e) {
				report.errors.push({
					changeId: remoteChange.change_id,
					error: e.message
				});
			}
		}

		// 4. Persistir el nuevo lastChangeId
		if (maxChangeId > lastChangeId) {
			await this.db.setLastChangeId(maxChangeId);
			report.newLastChangeId = maxChangeId;
		}

		return report;
	}

	/**
	 * Aplica un registro remoto a la DB local (put directo sin cifrado adicional).
	 * @private
	 */
	async _applyRemoteRecord(record) {
		// El registro remoto ya viene cifrado desde el otro dispositivo,
		// así que lo guardamos tal cual.
		record.updated_at = new Date().toISOString();
		record.is_dirty = 0; // Viene del remoto, no necesita re-sincronizar
		return this.db._tx('records', 'readwrite', store => store.put(record));
	}

	/**
	 * Sincronización bidireccional completa: sube cambios locales y descarga remotos.
	 * 
	 * @returns {Promise<Object>} - Reporte unificado.
	 */
	async sync() {
		const startTime = Date.now();
		const uploadReport = await this.uploadLocalChanges();
		const downloadReport = await this.downloadRemoteChanges();

		const report = {
			timestamp: new Date().toISOString(),
			duration: Date.now() - startTime,
			upload: uploadReport,
			download: downloadReport,
			success: uploadReport.errors.length === 0 && downloadReport.errors.length === 0
		};

		this.lastSyncReport = report;
		return report;
}
}