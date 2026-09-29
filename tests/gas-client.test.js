// tests/gas-client.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GasClient, ConfigError, NetworkError } from '../src/js/sync/gas-client.js';

describe('GasClient', () => {
    let client;

    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('device_id', 'test_device');
        client = new GasClient({
            webAppUrl: 'https://script.google.com/test',
            maxRetries: 2,
            retryDelay: 10,
            timeout: 1000
        });
    });

    it('debe inicializarse con la configuración correcta', () => {
        expect(client.webAppUrl).toBe('https://script.google.com/test');
        expect(client.maxRetries).toBe(2);
        expect(client.retryDelay).toBe(10);
    });

    it('debe fallar si no hay webAppUrl en llamada remota', async () => {
        const clientWithoutUrl = new GasClient({ useNative: false, maxRetries: 1, retryDelay: 10 });
        await expect(clientWithoutUrl.call('testMethod')).rejects.toThrow(
            'webAppUrl no configurada'
        );
    });

    it('debe lanzar ConfigError para errores de configuración', async () => {
        const client = new GasClient({ useNative: false, maxRetries: 1, retryDelay: 10 });
        await expect(client.call('test')).rejects.toBeInstanceOf(ConfigError);
    });

    it('debe reintentar en caso de fallo transitorio', async () => {
        let attempts = 0;
        global.fetch = vi.fn(async () => {
            attempts++;
            if (attempts < 3) {
                throw new NetworkError('Network error');
            }
            return {
                ok: true,
                json: async () => ({ success: true, data: 'ok' })
            };
        });

        const result = await client.call('testMethod');
        expect(result).toEqual({ success: true, data: 'ok' });
        expect(attempts).toBe(3);
    });

    it('debe lanzar NetworkError después de agotar reintentos', async () => {
        global.fetch = vi.fn(async () => {
            throw new NetworkError('Network error persistente');
        });

        await expect(client.call('testMethod')).rejects.toThrow('Network error persistente');
    });

    it('debe manejar HTTP error 500 (transitorio) y reintentar', async () => {
        global.fetch = vi.fn(async () => ({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
        }));

        await expect(client.call('testMethod')).rejects.toThrow('HTTP 500');
        expect(global.fetch).toHaveBeenCalledTimes(3); // 1 + 2 reintentos
    });

    it('debe manejar HTTP error 404 (permanente) sin reintentar', async () => {
        global.fetch = vi.fn(async () => ({
            ok: false,
            status: 404,
            statusText: 'Not Found'
        }));

        await expect(client.call('testMethod')).rejects.toThrow('HTTP 404');
        expect(global.fetch).toHaveBeenCalledTimes(1); // Solo 1 intento
    });

    it('debe manejar respuesta con success: false', async () => {
        global.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({ success: false, error: 'Error de GAS' })
        }));

        await expect(client.call('testMethod')).rejects.toThrow('Error de GAS');
    });

    it('debe acumular estadísticas', async () => {
        global.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({ success: true })
        }));

        await client.call('test1');
        await client.call('test2');

        const stats = client.getStats();
        expect(stats.totalCalls).toBe(2);
        expect(stats.successfulCalls).toBe(2);
        expect(stats.successRate).toBe(100);
    });

    it('debe usar _callNative si google.script.run está disponible', async () => {
        global.google = {
            script: {
                run: {
                    withSuccessHandler: vi.fn().mockReturnThis(),
                    withFailureHandler: vi.fn().mockReturnThis(),
                    testMethod: vi.fn()
                }
            }
        };
        const nativeClient = new GasClient({ useNative: true, timeout: 100 });
        expect(nativeClient.isNative()).toBe(true);
        expect(typeof nativeClient.isNative()).toBe('boolean');
        delete global.google;
    });

    it('debe no reintentar errores de configuración', async () => {
        const client = new GasClient({ useNative: false, maxRetries: 5, retryDelay: 100 });
        const start = Date.now();
        await expect(client.call('test')).rejects.toThrow('webAppUrl no configurada');
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(500);
    });
    describe('GasClient - Cobertura adicional', () => {
        let client;

        beforeEach(() => {
            localStorage.clear();
            localStorage.setItem('device_id', 'test_device');
        });

        it('debe usar _callNative con éxito cuando google.script.run responde', async () => {
            global.google = {
                script: {
                    run: {
                        withSuccessHandler: vi.fn().mockImplementation(function (cb) {
                            this._success = cb;
                            return this;
                        }),
                        withFailureHandler: vi.fn().mockImplementation(function (cb) {
                            this._failure = cb;
                            return this;
                        }),
                        testMethod: vi.fn().mockImplementation(function () {
                            // Simular respuesta exitosa asíncrona
                            setTimeout(
                                () => this._success({ success: true, data: 'native_ok' }),
                                0
                            );
                        })
                    }
                }
            };

            const nativeClient = new GasClient({ useNative: true, timeout: 500 });
            const result = await nativeClient.call('testMethod');

            expect(result).toEqual({ success: true, data: 'native_ok' });
            delete global.google;
        });

        it('debe manejar _callNative con success: false', async () => {
            global.google = {
                script: {
                    run: {
                        withSuccessHandler: vi.fn().mockImplementation(function (cb) {
                            this._success = cb;
                            return this;
                        }),
                        withFailureHandler: vi.fn().mockImplementation(function (cb) {
                            this._failure = cb;
                            return this;
                        }),
                        testMethod: vi.fn().mockImplementation(function () {
                            setTimeout(
                                () => this._success({ success: false, error: 'Error nativo' }),
                                0
                            );
                        })
                    }
                }
            };

            const nativeClient = new GasClient({ useNative: true, maxRetries: 0, timeout: 500 });

            await expect(nativeClient.call('testMethod')).rejects.toThrow('Error nativo');
            delete global.google;
        });

        it('debe manejar _callNative con failureHandler', async () => {
            global.google = {
                script: {
                    run: {
                        withSuccessHandler: vi.fn().mockReturnThis(),
                        withFailureHandler: vi.fn().mockImplementation(function (cb) {
                            this._failure = cb;
                            return this;
                        }),
                        testMethod: vi.fn().mockImplementation(function () {
                            setTimeout(() => this._failure({ message: 'Fallo nativo' }), 0);
                        })
                    }
                }
            };

            const nativeClient = new GasClient({ useNative: true, maxRetries: 0, timeout: 500 });

            await expect(nativeClient.call('testMethod')).rejects.toThrow('Fallo nativo');
            delete global.google;
        }, 10000);

        it('debe manejar error desconocido en _callRemote', async () => {
            global.fetch = vi.fn(async () => {
                // Lanzar un error que no sea Error ni AbortError
                throw new Error('Error raro');
            });

            const client = new GasClient({
                webAppUrl: 'https://test.com',
                maxRetries: 0,
                retryDelay: 10
            });

            await expect(client.call('test')).rejects.toThrow('Error raro');
        });

        it('debe manejar fetch que devuelve JSON inválido', async () => {
            global.fetch = vi.fn(async () => ({
                ok: true,
                json: async () => {
                    throw new Error('JSON inválido');
                }
            }));

            const client = new GasClient({
                webAppUrl: 'https://test.com',
                maxRetries: 0,
                retryDelay: 10
            });

            await expect(client.call('test')).rejects.toThrow('JSON inválido');
        });

        it('debe acumular avgLatency correctamente en múltiples llamadas', async () => {
            global.fetch = vi.fn(async () => ({
                ok: true,
                json: async () => ({ success: true })
            }));

            const client = new GasClient({
                webAppUrl: 'https://test.com',
                maxRetries: 0,
                retryDelay: 10
            });

            await client.call('test1');
            await client.call('test2');
            await client.call('test3');

            const stats = client.getStats();
            expect(stats.totalCalls).toBe(3);
            expect(stats.avgLatency).toBeGreaterThanOrEqual(0);
        });
    });
});
