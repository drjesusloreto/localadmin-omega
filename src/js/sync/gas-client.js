// src/js/sync/gas-client.js

/**
 * Error de configuración (permanente, no reintentar).
 */
export class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigError';
        this.isPermanent = true;
    }
}

/**
 * Error de red (transitorio, reintentar).
 */
export class NetworkError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NetworkError';
        this.isPermanent = false;
    }
}

/**
 * Cliente para comunicarse con Google Apps Script (GAS).
 * 
 * Características:
 * - Reintentos con backoff exponencial
 * - Timeout configurable
 * - Fallback a modo offline si GAS no está disponible
 * - Errores tipados (ConfigError, NetworkError)
 * 
 * Referencia: EDC Página 60-65 + PAE Semana 4, Día 15
 */
export class GasClient {
    /**
     * @param {Object} options
     * @param {string} options.webAppUrl - URL del Web App de GAS (deployment)
     * @param {number} options.maxRetries - Número máximo de reintentos (default: 5)
     * @param {number} options.retryDelay - Delay base en ms (default: 1000)
     * @param {number} options.timeout - Timeout por request en ms (default: 30000)
     * @param {string} options.authToken - Token de autenticación opcional
     * @param {boolean} options.useNative - Usar google.script.run (true en GAS)
     */
    constructor(options = {}) {
		this.webAppUrl = options.webAppUrl ?? '';
		this.maxRetries = options.maxRetries ?? 5;
		this.retryDelay = options.retryDelay ?? 1000;
		this.timeout = options.timeout ?? 30000;
		this.authToken = options.authToken ?? '';
		this.useNative = options.useNative ?? false;
		this.stats = {
			totalCalls: 0,
			successfulCalls: 0,
			failedCalls: 0,
			retries: 0,
			avgLatency: 0
		};
	}

    /**
     * Verifica si google.script.run está disponible (entorno GAS).
     * @returns {boolean}
     */
    isNative() {
        return !!(
            this.useNative &&
            typeof google !== 'undefined' &&
            google.script &&
            google.script.run
        );
    }

    /**
     * Realiza una llamada a GAS con reintentos automáticos.
     */
    async call(method, params = {}) {
        this.stats.totalCalls++;
        const startTime = Date.now();
        try {
            const result = await this._withRetry(() => {
                if (this.isNative()) {
                    return this._callNative(method, params);
                }
                return this._callRemote(method, params);
            });
            this.stats.successfulCalls++;
            const latency = Date.now() - startTime;
            this.stats.avgLatency = (this.stats.avgLatency * (this.stats.successfulCalls - 1) + latency) / this.stats.successfulCalls;
            return result;
        } catch (error) {
            this.stats.failedCalls++;
            throw error;
        }
    }

    /**
     * Llama a un método en GAS usando google.script.run (nativo).
     */
    _callNative(method, params) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => reject(new NetworkError('Timeout en llamada GAS nativa')), this.timeout);
            google.script.run
                .withSuccessHandler((result) => {
                    clearTimeout(timeoutId);
                    if (result && result.success === false) {
                        reject(new ConfigError(result.error || 'Error en GAS'));
                    } else {
                        resolve(result);
                    }
                })
                .withFailureHandler((err) => {
                    clearTimeout(timeoutId);
                    reject(new NetworkError(err.message || 'Error en GAS'));
                })[method](params);
        });
    }

    /**
     * Llama a un método en GAS vía fetch (remoto).
     */
    async _callRemote(method, params) {
        if (!this.webAppUrl) {
            throw new ConfigError('webAppUrl no configurada');
        }
        const headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(this.webAppUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    action: method,
                    data: params,
                    device_id: localStorage.getItem('device_id') || 'unknown'
                }),
                redirect: 'follow',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                if (response.status >= 400 && response.status < 500) {
                    throw new ConfigError(`HTTP ${response.status}: ${response.statusText}`);
                }
                throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`);
            }
            const result = await response.json();
            if (result.success === false) {
                throw new ConfigError(result.error || 'Error de GAS');
            }
            return result;
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                throw new NetworkError('Timeout en llamada GAS remota');
            }
            if (e instanceof ConfigError || e instanceof NetworkError) {
                throw e;
            }
            throw new NetworkError(e.message || 'Error desconocido');
        }
    }

    /**
     * Ejecuta una función con reintentos y backoff exponencial.
     * NO reintenta errores de configuración (isPermanent).
     */
    async _withRetry(fn, attempt = 0) {
        try {
            return await fn();
        } catch (error) {
            if (error.isPermanent === true) {
                throw error;
            }
            if (attempt >= this.maxRetries) {
                throw error;
            }
            this.stats.retries++;
            const delay = this.retryDelay * Math.pow(2, attempt) + Math.random() * 500;
            console.warn(
                `Reintentando llamada GAS (intento ${attempt + 1}/${this.maxRetries}) en ${Math.round(delay)}ms:`,
                error.message
            );
            await new Promise(r => setTimeout(r, delay));
            return this._withRetry(fn, attempt + 1);
        }
    }

    async healthCheck() { return this.call('healthCheckApi'); }
    async getChangesSince(changeId) { return this.call('getChangesSinceApi', { changeId }); }
    async syncMetadata(metadata) { return this.call('syncMetadataApi', metadata); }
    async deleteRecord(id) { return this.call('deleteRecordApi', { id }); }
    async uploadChunk(chunkData) { return this.call('uploadChunkApi', chunkData); }

    /**
     * Obtiene estadísticas del cliente.
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalCalls > 0
                ? (this.stats.successfulCalls / this.stats.totalCalls) * 100
                : 0
        };
    }
}