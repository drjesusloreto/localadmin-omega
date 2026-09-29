// tests/setup.js
// tests/setup.js

// 1. Polyfill de fake-indexeddb (DEBE IR PRIMERO)
import 'fake-indexeddb/auto';

// 2. Polyfill de crypto para Node.js (para pruebas)
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

// 3. Polyfill de Blob si no existe
if (typeof Blob === 'undefined') {
    const { Blob } = await import('node:buffer');
    globalThis.Blob = Blob;
}

// 4. Mock de navigator.storage (si no existe en el entorno)
if (!globalThis.navigator) {
    globalThis.navigator = {};
}
if (!globalThis.navigator.storage) {
    globalThis.navigator.storage = {
        estimate: async () => ({
            usage: 1024 * 1024, // 1 MB
            quota: 100 * 1024 * 1024 // 100 MB
        })
    };
}

// 5. Limpiar localStorage entre tests
import { beforeEach } from 'vitest';
beforeEach(() => {
    if (globalThis.localStorage) {
        globalThis.localStorage.clear();
    }
});
// ============================================================
// Mock de WebRTC para tests (happy-dom no lo implementa)
// ============================================================
if (typeof globalThis.RTCPeerConnection === 'undefined') {
    class MockRTCDataChannel extends EventTarget {
        constructor(label) {
            super();
            this.label = label;
            this.readyState = 'connecting';
            this._messages = [];
        }
        send(data) {
            this._messages.push(data);
            // Simular recepción en el otro lado
            const event = new MessageEvent('message', { data });
            this.dispatchEvent(event);
        }
        close() {
            this.readyState = 'closed';
            this.dispatchEvent(new Event('close'));
        }
        open() {
            this.readyState = 'open';
            this.dispatchEvent(new Event('open'));
        }
    }

    class MockRTCPeerConnection extends EventTarget {
        constructor(config = {}) {
            super();
            this.config = config;
            this.localDescription = null;
            this.remoteDescription = null;
            this.iceConnectionState = 'new';
            this.connectionState = 'new';
            this._dataChannels = [];
            this._iceCandidates = [];
        }

        createDataChannel(label, options = {}) {
            const channel = new MockRTCDataChannel(label);
            channel.open();
            this._dataChannels.push(channel);
            return channel;
        }

        async createOffer() {
            return {
                type: 'offer',
                sdp: 'mock-sdp-offer-' + Math.random().toString(36).slice(2)
            };
        }

        async createAnswer() {
            return {
                type: 'answer',
                sdp: 'mock-sdp-answer-' + Math.random().toString(36).slice(2)
            };
        }

        async setLocalDescription(desc) {
            this.localDescription = desc;
            // Simular generación de ICE candidates
            setTimeout(() => {
                const candidate = {
                    candidate: 'candidate:mock-' + Math.random().toString(36).slice(2),
                    sdpMid: '0',
                    sdpMLineIndex: 0
                };
                this._iceCandidates.push(candidate);
                this.dispatchEvent(new Event('icecandidate'));
            }, 0);
        }

        async setRemoteDescription(desc) {
            this.remoteDescription = desc;
            this.iceConnectionState = 'connected';
            this.connectionState = 'connected';
        }

        async addIceCandidate(candidate) {
            this._iceCandidates.push(candidate);
        }

        close() {
            this.connectionState = 'closed';
            this.iceConnectionState = 'closed';
            this.dispatchEvent(new Event('connectionstatechange'));
        }
    }

    globalThis.RTCPeerConnection = MockRTCPeerConnection;
    globalThis.RTCSessionDescription = class {
        constructor(init) {
            Object.assign(this, init);
        }
    };
    globalThis.RTCIceCandidate = class {
        constructor(init) {
            Object.assign(this, init);
        }
    };
    // ============================================================
    // Hacer localStorage configurable para tests
    // happy-dom lo define como getter de solo lectura
    // ============================================================
    if (typeof globalThis.localStorage !== 'undefined') {
        try {
            const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
            if (descriptor && !descriptor.set) {
                // Si es solo getter, lo convertimos en configurable
                let _localStorage = globalThis.localStorage;
                Object.defineProperty(globalThis, 'localStorage', {
                    get() {
                        return _localStorage;
                    },
                    set(value) {
                        _localStorage = value;
                    },
                    configurable: true
                });
            }
        } catch (_e) {
            // Ignorar si no se puede modificar
        }
    }
    console.log('✅ Mock de WebRTC configurado');
}

console.log('Test setup completado (con fake-indexeddb)');
console.log('✅ Test setup completado (con fake-indexeddb)');
