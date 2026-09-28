// tests/webrtc-manager.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebRTCManager } from '../src/js/p2p/webrtc-manager.js';
import { SignalServer } from '../src/js/p2p/signal-server.js';

describe('WebRTCManager', () => {
    let signalServer;
    let peerA;
    let peerB;

    beforeEach(() => {
        signalServer = new SignalServer();
    });

    // ============================================================
    // INIT
    // ============================================================
    describe('init', () => {
        it('debe inicializar el RTCPeerConnection', async () => {
            peerA = new WebRTCManager({
                peerId: 'peer_A',
                signalServer
            });

            await peerA.init();
            expect(peerA.pc).toBeDefined();
            expect(peerA.getState()).toBe('initialized');
        });

        it('debe lanzar error si RTCPeerConnection no está disponible', async () => {
            const original = globalThis.RTCPeerConnection;
            delete globalThis.RTCPeerConnection;

            const peer = new WebRTCManager({ peerId: 'peer_X', signalServer });
            await expect(peer.init()).rejects.toThrow('RTCPeerConnection no está disponible');

            globalThis.RTCPeerConnection = original;
        });
    });

    // ============================================================
    // OFFER/ANSWER
    // ============================================================
    describe('createOffer / handleOffer', () => {
        beforeEach(async () => {
            peerA = new WebRTCManager({ peerId: 'peer_A', signalServer });
            peerB = new WebRTCManager({ peerId: 'peer_B', signalServer });
            await peerA.init();
            await peerB.init();
        });

        it('debe crear una oferta SDP', async () => {
            const offer = await peerA.createOffer('peer_B');
            expect(offer).toBeDefined();
            expect(offer.type).toBe('offer');
            expect(offer.sdp).toContain('mock-sdp-offer');
        });

        it('debe procesar una oferta y generar una answer', async () => {
            const offer = await peerA.createOffer('peer_B');
            const answer = await peerB.handleOffer({
                type: 'offer',
                from: 'peer_A',
                sdp: offer
            });

            expect(answer).toBeDefined();
            expect(answer.type).toBe('answer');
            expect(answer.sdp).toContain('mock-sdp-answer');
        });

        it('debe procesar una answer', async () => {
            const offer = await peerA.createOffer('peer_B');
            const answer = await peerB.handleOffer({
                type: 'offer',
                from: 'peer_A',
                sdp: offer
            });

            await peerA.handleAnswer({
                type: 'answer',
                from: 'peer_B',
                sdp: answer
            });

            expect(peerA.pc.remoteDescription).toBeDefined();
        });
    });

    // ============================================================
    // ICE CANDIDATES
    // ============================================================
    describe('ICE candidates', () => {
        beforeEach(async () => {
            peerA = new WebRTCManager({ peerId: 'peer_A', signalServer });
            await peerA.init();
        });

        it('debe añadir un ICE candidate remoto', async () => {
            const candidate = {
                candidate: 'candidate:mock',
                sdpMid: '0',
                sdpMLineIndex: 0
            };

            await peerA.handleIceCandidate(candidate);
            expect(peerA.pc._iceCandidates.length).toBeGreaterThan(0);
        });

        it('debe manejar errores al añadir ICE candidate', async () => {
            const candidate = null;
            // No debe lanzar
            await expect(peerA.handleIceCandidate(candidate)).resolves.toBeUndefined();
        });
    });

    // ============================================================
    // ENVÍO DE DATOS
    // ============================================================
    describe('sendData', () => {
        beforeEach(async () => {
            peerA = new WebRTCManager({ peerId: 'peer_A', signalServer });
            await peerA.init();
            await peerA.createOffer('peer_B');
        });

        it('debe enviar datos por el data channel abierto', () => {
            const result = peerA.sendData({ message: 'hola' });
            expect(result).toBe(true);
            expect(peerA.dataChannel._messages.length).toBe(1);
        });

        it('debe retornar false si el data channel no está abierto', () => {
            peerA.dataChannel.close();
            const result = peerA.sendData('test');
            expect(result).toBe(false);
        });

        it('debe serializar objetos a JSON', () => {
            peerA.sendData({ key: 'value', num: 42 });
            const sent = peerA.dataChannel._messages[0];
            expect(sent).toContain('"key"');
            expect(sent).toContain('"value"');
        });
    });

    // ============================================================
    // ON DATA (recepción)
    // ============================================================
    describe('onData', () => {
        it('debe llamar a onData al recibir un mensaje', async () => {
            const onDataSpy = vi.fn();
            peerA = new WebRTCManager({
                peerId: 'peer_A',
                signalServer,
                onData: onDataSpy
            });
            await peerA.init();
            await peerA.createOffer('peer_B');

            // Simular recepción de mensaje
            peerA.dataChannel.dispatchEvent(new MessageEvent('message', {
                data: JSON.stringify({ type: 'test', value: 42 })
            }));

            expect(onDataSpy).toHaveBeenCalled();
            expect(onDataSpy.mock.calls[0][0]).toEqual({ type: 'test', value: 42 });
        });

        it('debe manejar mensajes no-JSON como string', async () => {
            const onDataSpy = vi.fn();
            peerA = new WebRTCManager({
                peerId: 'peer_A',
                signalServer,
                onData: onDataSpy
            });
            await peerA.init();
            await peerA.createOffer('peer_B');

            peerA.dataChannel.dispatchEvent(new MessageEvent('message', {
                data: 'texto plano'
            }));

            expect(onDataSpy).toHaveBeenCalledWith('texto plano', 'peer_B');
        });
    });

    // ============================================================
    // ON STATE CHANGE
    // ============================================================
    describe('onStateChange', () => {
        it('debe notificar cambios de estado', async () => {
            const stateSpy = vi.fn();
            peerA = new WebRTCManager({
                peerId: 'peer_A',
                signalServer,
                onStateChange: stateSpy
            });
            await peerA.init();

            expect(stateSpy).toHaveBeenCalledWith('initialized', null);
        });
    });

    // ============================================================
    // CLOSE
    // ============================================================
    describe('close', () => {
        beforeEach(async () => {
            peerA = new WebRTCManager({ peerId: 'peer_A', signalServer });
            await peerA.init();
        });

        it('debe cerrar la conexión', () => {
            peerA.close();
            expect(peerA.getState()).toBe('closed');
        });

        it('debe cerrar el data channel si existe', async () => {
            await peerA.createOffer('peer_B');
            peerA.close();
            expect(peerA.dataChannel.readyState).toBe('closed');
        });
    });
});