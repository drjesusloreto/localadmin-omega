// src/js/p2p/webrtc-manager.js

/**
 * Gestor de conexiones WebRTC entre pares.
 * 
 * Características:
 * - Conexión peer-to-peer directa (sin servidor central).
 * - Intercambio de SDP (offer/answer) vía SignalServer.
 * - Transferencia de datos por RTCDataChannel.
 * - Manejo de estados (connecting, connected, disconnected, failed).
 * 
 * Referencia: EDC Página 120-125 + PAE Semana 4, Día 18
 */
export class WebRTCManager {
    /**
     * @param {Object} options
     * @param {string} options.peerId - ID único de este peer.
     * @param {Object} options.signalServer - Instancia de SignalServer.
     * @param {Array} options.iceServers - Servidores STUN/TURN (default: Google STUN).
     * @param {Function} options.onData - Callback al recibir datos.
     * @param {Function} options.onStateChange - Callback al cambiar el estado.
     */
    constructor(options = {}) {
        this.peerId = options.peerId || `peer_${Date.now()}`;
        this.signalServer = options.signalServer;
        this.iceServers = options.iceServers ?? [
            { urls: 'stun:stun.l.google.com:19302' }
        ];
        this.onData = options.onData || (() => {});
        this.onStateChange = options.onStateChange || (() => {});

        this.pc = null;
        this.dataChannel = null;
        this.remotePeerId = null;
        this.state = 'new';
        this._unsubscribe = null;
    }

    /**
     * Inicializa la conexión RTCPeerConnection.
     * @returns {Promise<WebRTCManager>}
     */
    async init() {
        if (typeof RTCPeerConnection === 'undefined') {
            throw new Error('RTCPeerConnection no está disponible');
        }

        this.pc = new RTCPeerConnection({ iceServers: this.iceServers });

        // Manejar ICE candidates locales
        this.pc.addEventListener('icecandidate', (event) => {
            if (event.candidate && this.remotePeerId && this.signalServer) {
                this.signalServer.send(this.remotePeerId, {
                    type: 'ice-candidate',
                    from: this.peerId,
                    candidate: event.candidate
                }).catch(e => console.warn('Error enviando ICE:', e));
            }
        });

        // Manejar cambios de estado
        this.pc.addEventListener('connectionstatechange', () => {
            this._setState(this.pc.connectionState);
        });

        this._setState('initialized');
        return this;
    }

    /**
     * Crea una oferta y la envía al peer remoto.
     * @param {string} remotePeerId
     * @returns {Promise<Object>} - Oferta SDP generada.
     */
    async createOffer(remotePeerId) {
        if (!this.pc) throw new Error('WebRTCManager no inicializado. Llamar a init() primero.');

        this.remotePeerId = remotePeerId;

        // Crear data channel (el iniciador lo crea)
        this.dataChannel = this.pc.createDataChannel('data');
        this._setupDataChannel();

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        // Enviar la oferta al peer remoto
        if (this.signalServer) {
            await this.signalServer.send(remotePeerId, {
                type: 'offer',
                from: this.peerId,
                sdp: this.pc.localDescription
            });
        }

        return this.pc.localDescription;
    }

    /**
     * Procesa una oferta recibida y responde con una answer.
     * @param {Object} offer
     * @returns {Promise<Object>} - Answer SDP generada.
     */
    async handleOffer(offer) {
        if (!this.pc) throw new Error('WebRTCManager no inicializado.');

        this.remotePeerId = offer.from;

        // Configurar el handler para recibir el data channel del peer
        this.pc.addEventListener('datachannel', (event) => {
            this.dataChannel = event.channel;
            this._setupDataChannel();
        });

        await this.pc.setRemoteDescription(offer.sdp);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        if (this.signalServer) {
            await this.signalServer.send(offer.from, {
                type: 'answer',
                from: this.peerId,
                sdp: this.pc.localDescription
            });
        }

        return this.pc.localDescription;
    }

    /**
     * Procesa una answer recibida.
     * @param {Object} answer
     * @returns {Promise<void>}
     */
    async handleAnswer(answer) {
        if (!this.pc) throw new Error('WebRTCManager no inicializado.');
        await this.pc.setRemoteDescription(answer.sdp);
    }

    /**
     * Añade un ICE candidate remoto.
     * @param {Object} candidate
     * @returns {Promise<void>}
     */
    async handleIceCandidate(candidate) {
        if (!this.pc) throw new Error('WebRTCManager no inicializado.');
        try {
            await this.pc.addIceCandidate(candidate);
        } catch (e) {
            console.warn('Error añadiendo ICE candidate:', e);
        }
    }

    /**
     * Envía datos por el data channel.
     * @param {any} data
     * @returns {boolean}
     */
    sendData(data) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.warn('Data channel no está abierto');
            return false;
        }
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        this.dataChannel.send(payload);
        return true;
    }

    /**
     * Cierra la conexión.
     */
    close() {
        if (this._unsubscribe) this._unsubscribe();
        if (this.dataChannel) this.dataChannel.close();
        if (this.pc) this.pc.close();
        this._setState('closed');
    }

    /**
     * Configura el data channel.
     * @private
     */
    _setupDataChannel() {
        if (!this.dataChannel) return;

        this.dataChannel.addEventListener('open', () => {
            this._setState('connected');
        });

        this.dataChannel.addEventListener('close', () => {
            this._setState('disconnected');
        });

        this.dataChannel.addEventListener('message', (event) => {
            let data = event.data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                // No es JSON, dejar como string
            }
            this.onData(data, this.remotePeerId);
        });
    }

    /**
     * Actualiza el estado y notifica.
     * @private
     */
    _setState(newState) {
        if (this.state === newState) return;
        this.state = newState;
        this.onStateChange(newState, this.remotePeerId);
    }

    /**
     * Retorna el estado actual.
     * @returns {string}
     */
    getState() {
        return this.state;
    }
}