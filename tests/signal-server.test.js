// tests/signal-server.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalServer } from '../src/js/p2p/signal-server.js';

describe('SignalServer', () => {
    let server;

    beforeEach(() => {
        server = new SignalServer();
    });

    // ============================================================
    // SEND
    // ============================================================
    describe('send', () => {
        it('debe enviar un mensaje y registrarlo', async () => {
            await server.send('peer_A', { type: 'test', value: 42 });

            const messages = server.getMessages();
            expect(messages.length).toBe(1);
            expect(messages[0].peerId).toBe('peer_A');
            expect(messages[0].message.type).toBe('test');
            expect(messages[0].timestamp).toBeDefined();
        });

        it('debe invocar callbacks suscritos', async () => {
            const callback = vi.fn();
            server.on('peer_A', callback);

            await server.send('peer_A', { type: 'test' });

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith({ type: 'test' });
        });

        it('debe invocar múltiples callbacks para el mismo peer', async () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();
            server.on('peer_A', callback1);
            server.on('peer_A', callback2);

            await server.send('peer_A', { type: 'test' });

            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);
        });

        it('no debe invocar callbacks de otros peers', async () => {
            const callbackA = vi.fn();
            const callbackB = vi.fn();
            server.on('peer_A', callbackA);
            server.on('peer_B', callbackB);

            await server.send('peer_A', { type: 'test' });

            expect(callbackA).toHaveBeenCalledTimes(1);
            expect(callbackB).not.toHaveBeenCalled();
        });

        it('debe manejar errores en callbacks sin detener otros', async () => {
            const callbackBad = vi.fn().mockRejectedValue(new Error('Error en callback'));
            const callbackGood = vi.fn();
            server.on('peer_A', callbackBad);
            server.on('peer_A', callbackGood);

            // No debe lanzar
            await expect(server.send('peer_A', { type: 'test' })).resolves.toBeUndefined();
            expect(callbackGood).toHaveBeenCalledTimes(1);
        });
    });

    // ============================================================
    // ON (suscripción)
    // ============================================================
    describe('on', () => {
        it('debe suscribir un callback y retornar función de unsubscribe', () => {
            const callback = vi.fn();
            const unsubscribe = server.on('peer_A', callback);

            expect(typeof unsubscribe).toBe('function');
        });

        it('debe desuscribir un callback', async () => {
            const callback = vi.fn();
            const unsubscribe = server.on('peer_A', callback);

            unsubscribe();

            await server.send('peer_A', { type: 'test' });

            expect(callback).not.toHaveBeenCalled();
        });

        it('debe crear un array de listeners para un peer nuevo', () => {
            server.on('peer_new', vi.fn());
            expect(server.listeners.has('peer_new')).toBe(true);
            expect(server.listeners.get('peer_new').length).toBe(1);
        });

        it('debe añadir múltiples listeners al mismo peer', () => {
            server.on('peer_A', vi.fn());
            server.on('peer_A', vi.fn());
            server.on('peer_A', vi.fn());

            expect(server.listeners.get('peer_A').length).toBe(3);
        });

        it('debe manejar unsubscribe de callback no registrado', () => {
            const callback = vi.fn();
            const unsubscribe = server.on('peer_A', callback);

            // Ya removido
            unsubscribe();
            // Segundo llamado no debe lanzar
            expect(() => unsubscribe()).not.toThrow();
        });
    });

    // ============================================================
    // CLEAR
    // ============================================================
    describe('clear', () => {
        it('debe limpiar todos los listeners y mensajes', async () => {
            server.on('peer_A', vi.fn());
            server.on('peer_B', vi.fn());
            await server.send('peer_A', { type: 'test' });

            server.clear();

            expect(server.listeners.size).toBe(0);
            expect(server.messageLog.length).toBe(0);
        });
    });

    // ============================================================
    // GET MESSAGES
    // ============================================================
    describe('getMessages', () => {
        it('debe retornar copia del log de mensajes', async () => {
            await server.send('peer_A', { type: 'msg1' });
            await server.send('peer_B', { type: 'msg2' });

            const messages = server.getMessages();
            expect(messages.length).toBe(2);

            // Modificar la copia no afecta al original
            messages.push({ fake: true });
            expect(server.getMessages().length).toBe(2);
        });

        it('debe retornar array vacío si no hay mensajes', () => {
            expect(server.getMessages()).toEqual([]);
        });
    });

    // ============================================================
    // ESCENARIO REAL: Dos peers intercambiando mensajes
    // ============================================================
    describe('Escenario: dos peers intercambiando mensajes', () => {
        it('debe permitir comunicación bidireccional entre peers', async () => {
            const messagesA = [];
            const messagesB = [];

            server.on('peer_A', (msg) => messagesA.push(msg));
            server.on('peer_B', (msg) => messagesB.push(msg));

            await server.send('peer_A', { from: 'peer_B', type: 'offer' });
            await server.send('peer_B', { from: 'peer_A', type: 'answer' });
            await server.send('peer_A', { from: 'peer_B', type: 'ice-candidate' });

            expect(messagesA.length).toBe(2);
            expect(messagesB.length).toBe(1);
            expect(messagesA[0].type).toBe('offer');
            expect(messagesB[0].type).toBe('answer');
            expect(messagesA[1].type).toBe('ice-candidate');
        });
    });
});