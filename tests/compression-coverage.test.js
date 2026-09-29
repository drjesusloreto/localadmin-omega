// tests/compression-coverage.test.js
import { describe, it, expect, vi } from 'vitest';
import { Compression, ChunkedCompressor } from '../src/js/compression.js';

describe('Compression - Cobertura adicional', () => {
    // ============================================================
    // Fallback paths cuando CompressionStream no está disponible
    // ============================================================
    it('debe retornar datos tal cual si CompressionStream no está disponible', async () => {
        const originalCompressionStream = globalThis.CompressionStream;
        delete globalThis.CompressionStream;

        // Forzar isSupported a false temporalmente
        const originalIsSupported = Compression.isSupported;
        Compression.isSupported = () => false;

        const data = new Blob(['test']);
        const result = await Compression.compress(data, 'gzip');
        expect(result).toBeInstanceOf(Blob);

        Compression.isSupported = originalIsSupported;
        globalThis.CompressionStream = originalCompressionStream;
    });

    it('debe manejar compress con formato inválido', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const data = new Blob(['test']);
        const result = await Compression.compress(data, 'formato-invalido');
        expect(result).toBeDefined();
        warnSpy.mockRestore();
    });

    it.skip('debe manejar decompress con datos corruptos (limitación de happy-dom)', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const corruptedData = new Blob(['not-valid-gzip-data']);
        const result = await Compression.decompress(corruptedData, 'gzip');
        expect(result).toBeDefined();
        warnSpy.mockRestore();
    });

    // ============================================================
    // compressIfNeeded edge cases
    // ============================================================
    it('no debe comprimir si compressionKey no reduce tamaño', async () => {
        const tinyBlob = new Blob(['x'], { type: 'text/plain' });
        const result = await Compression.compressIfNeeded(tinyBlob, 100);
        expect(result.compressed).toBe(false);
        expect(result.format).toBeNull();
    });

    it('debe retornar metadata completa al no comprimir', async () => {
        const smallBlob = new Blob(['test']);
        const result = await Compression.compressIfNeeded(smallBlob, 1000);
        expect(result.blob).toBe(smallBlob);
        expect(result.compressed).toBe(false);
    });

    // ============================================================
    // estimateRatio edge cases
    // ============================================================
    it('debe retornar 1 si CompressionStream no está soportado', async () => {
        const originalIsSupported = Compression.isSupported;
        Compression.isSupported = () => false;

        const blob = new Blob(['test']);
        const ratio = await Compression.estimateRatio(blob);
        expect(ratio).toBe(1);

        Compression.isSupported = originalIsSupported;
    });

    it('debe manejar estimateRatio con error', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const invalidBlob = new Blob(['test']);

        // Forzar un error temporal
        const originalCompress = Compression.compress;
        Compression.compress = vi.fn().mockRejectedValue(new Error('Test error'));

        const ratio = await Compression.estimateRatio(invalidBlob);
        expect(ratio).toBe(1);

        Compression.compress = originalCompress;
        warnSpy.mockRestore();
    });

    // ============================================================
    // ChunkedCompressor edge cases
    // ============================================================
    it('debe manejar ChunkedCompressor con blob vacío', async () => {
        const compressor = new ChunkedCompressor(1024);
        const emptyBlob = new Blob([]);

        const chunks = [];
        for await (const chunk of compressor.streamCompress(emptyBlob)) {
            chunks.push(chunk);
        }

        expect(chunks.length).toBe(0);
    });

    it('debe manejar reassemble con chunks desordenados', async () => {
        const compressor = new ChunkedCompressor(1024);
        const text = 'A'.repeat(3000);
        const blob = new Blob([text]);

        const chunks = [];
        for await (const chunk of compressor.streamCompress(blob)) {
            chunks.push(chunk);
        }

        // Desordenar los chunks
        const shuffled = [chunks[2], chunks[0], chunks[1]];
        const reassembled = await compressor.reassemble(shuffled);
        const resultText = await reassembled.text();

        expect(resultText).toBe(text);
    });

    // ============================================================
    // Base64 edge cases
    // ============================================================
    it('debe manejar compressToBase64 con string vacío', async () => {
        const base64 = await Compression.compressToBase64('');
        expect(typeof base64).toBe('string');
    });

    it.skip('debe manejar decompressFromBase64 con base64 vacío (limitación de happy-dom)', async () => {
        const result = await Compression.decompressFromBase64('');
        expect(result).toBe('');
    });

    // ============================================================
    // compressString / decompressString edge cases
    // ============================================================
    it('debe manejar compressString con string muy largo', async () => {
        const longText = 'A'.repeat(100000);
        const compressed = await Compression.compressString(longText);
        const decompressed = await Compression.decompressString(compressed);
        expect(decompressed).toBe(longText);
    });
});
