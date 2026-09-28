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
	/**
	 * Sincroniza cambios directamente con un peer vía WebRTC.
	 * 
	 * @param {string} peerId - ID del peer remoto.
	 * @param {Object} webrtcManager - Instancia de WebRTCManager conectada.
	 * @param {Object} options
	 * @param {number} options.timeout - Timeout en ms para esperar respuesta (default: 5000).
	 * @returns {Promise<Object>} - Reporte de sincronización P2P.
	 */
	async syncViaP2P(peerId, webrtcManager, options = {}) {
		const timeout = options.timeout ?? 5000;
		const report = {
			method: 'p2p',
			peerId,
			uploaded: 0,
			downloaded: 0,
			applied: 0,
			conflicts: 0,
			errors: [],
			success: false
		};

		// 1. Verificar que el WebRTCManager esté conectado
		if (!webrtcManager || webrtcManager.getState() !== 'connected') {
			report.errors.push({ phase: 'precheck', error: 'WebRTCManager no conectado' });
			return report;
		}

		// 2. Configurar handler para mensajes entrantes del peer
		const incomingChanges = [];
		let resolveIncoming = null;
		const incomingPromise = new Promise((resolve) => {
			resolveIncoming = resolve;
		});

		const originalOnData = webrtcManager.onData;
		webrtcManager.onData = (data, fromPeer) => {
			if (fromPeer !== peerId) return;

			if (data && data.type === 'changes') {
				incomingChanges.push(...(data.changes || []));
			}
			if (data && data.type === 'sync-complete') {
				resolveIncoming();
			}

			// Llamar al handler original si existe
			if (typeof originalOnData === 'function') {
				originalOnData(data, fromPeer);
			}
		};

		// 3. Obtener cambios locales y enviarlos
		let localChanges = [];
		try {
			localChanges = await this.db.getUnsyncedChanges();
		} catch (e) {
			report.errors.push({ phase: 'getChanges', error: e.message });
			return report;
		}

		const sent = webrtcManager.sendData({
			type: 'changes',
			from: 'self',
			changes: localChanges
		});

		if (!sent) {
			report.errors.push({ phase: 'send', error: 'No se pudo enviar cambios' });
			return report;
		}

		// 4. Esperar respuesta del peer (con timeout)
		try {
			await Promise.race([
				incomingPromise,
				new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout P2P')), timeout))
			]);
		} catch (e) {
			report.errors.push({ phase: 'wait-response', error: e.message });
			// Continuar con lo que se recibió hasta ahora
		}

		// 5. Marcar cambios locales como sincronizados
		for (const change of localChanges) {
			try {
				await this.db.markChangeSynced(change.change_id);
				report.uploaded++;
			} catch (e) {
				report.errors.push({ changeId: change.change_id, error: e.message });
			}
		}

		// 6. Aplicar cambios remotos
		report.downloaded = incomingChanges.length;
		for (const remoteChange of incomingChanges) {
			try {
				const remoteRecord = remoteChange.data;
				if (!remoteRecord || !remoteRecord.id) continue;

				const localRecord = await this.db.getRecord(remoteRecord.id);

				if (!localRecord) {
					// Crear nuevo
					await this._applyRemoteRecord(remoteRecord);
					report.applied++;
					continue;
				}

				// Resolver conflicto
				const resolution = this.conflictResolver.resolve(localRecord, remoteRecord);
				if (resolution.resolution === 'equal') continue;

				if (resolution.resolution !== 'local-wins' && resolution.resolution !== 'local-lww') {
					await this._applyRemoteRecord(resolution.winner);
					report.applied++;
					if (resolution.conflicts && resolution.conflicts.length > 0) {
						report.conflicts++;
					}
				}
			} catch (e) {
				report.errors.push({ changeId: remoteChange.change_id, error: e.message });
			}
		}

		// Restaurar onData original
		webrtcManager.onData = originalOnData;

		report.success = report.errors.length === 0;
		this.lastSyncReport = report;
		return report;
	}

	/**
	 * Sincroniza con fallback automático: intenta P2P primero, luego GAS.
	 * 
	 * @param {Object} options
	 * @param {string} options.peerId - Peer para P2P.
	 * @param {Object} options.webrtcManager - WebRTCManager para P2P.
	 * @returns {Promise<Object>} - Reporte de sincronización.
	 */
	async syncWithFallback(options = {}) {
		// 1. Intentar P2P
		if (options.peerId && options.webrtcManager) {
			try {
				const p2pReport = await this.syncViaP2P(options.peerId, options.webrtcManager);
				if (p2pReport.success) {
					return p2pReport;
				}
				console.warn('P2P falló, usando GAS como fallback:', p2pReport.errors);
			} catch (e) {
				console.warn('P2P lanzó error, usando GAS como fallback:', e);
			}
		}

		// 2. Fallback a GAS
		const gasReport = await this.sync();
		gasReport.method = 'gas-fallback';
		return gasReport;
	}
}