// src/js/p2p/signal-server.js

/**
 * Servidor de señalización mínimo para WebRTC.
 * 
 * En producción, este sería un servidor real (WebSocket o GAS).
 * Aquí es un mock en memoria que permite la comunicación entre
 * dos instancias de WebRTCManager en tests o en la misma máquina.
 * 
 * Referencia: EDC Página 120-125 + PAE Semana 4, Día 18
 */
export class SignalServer {
    constructor() {
        /** @type {Map<string, Array<Function>>} */
        this.listeners = new Map();
        /** @type {Array<Object>} */
        this.messageLog = [];
    }

    /**
     * Envía un mensaje a un peer.
     * @param {string} peerId
     * @param {Object} message
     * @returns {Promise<void>}
     */
    async send(peerId, message) {
        this.messageLog.push({
            peerId,
            message,
            timestamp: new Date().toISOString()
        });

        const callbacks = this.listeners.get(peerId) || [];
        for (const cb of callbacks) {
            try {
                await cb(message);
            } catch (e) {
                console.warn('Error en listener:', e);
            }
        }
    }

    /**
     * Suscribe un listener a mensajes de un peer.
     * @param {string} peerId
     * @param {Function} callback
     * @returns {Function} - Función para desuscribirse
     */
    on(peerId, callback) {
        if (!this.listeners.has(peerId)) {
            this.listeners.set(peerId, []);
        }
        this.listeners.get(peerId).push(callback);

        // Retornar función de unsubscribe
        return () => {
            const callbacks = this.listeners.get(peerId);
            const idx = callbacks.indexOf(callback);
            if (idx >= 0) callbacks.splice(idx, 1);
        };
    }

    /**
     * Limpia el servidor (útil en tests).
     */
    clear() {
        this.listeners.clear();
        this.messageLog = [];
    }

    /**
     * Retorna los mensajes enviados (útil en tests).
     * @returns {Array<Object>}
     */
    getMessages() {
        return [...this.messageLog];
    }
}