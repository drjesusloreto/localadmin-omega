// tests/compression.test.js

import { describe, it, expect } from 'vitest';
import { Compression, ChunkedCompressor } from '../src/js/compression.js';

describe('Compression', () => {
  // ============ SOPORTE ============
  describe('isSupported', () => {
    it('debe verificar soporte de CompressionStream', () => {
      const supported = Compression.isSupported();
      expect(typeof supported).toBe('boolean');
    });
  });

  // ============ COMPRESIÓN DE STRINGS ============
  describe('compressString / decompressString', () => {
    it('debe comprimir y descomprimir un texto', async () => {
      const text = 'Lorem ipsum '.repeat(100);
      const compressed = await Compression.compressString(text);
      
      expect(compressed.byteLength).toBeLessThan(text.length);
      
      const decompressed = await Compression.decompressString(compressed);
      expect(decompressed).toBe(text);
    });

    it('debe reducir el tamaño de textos repetitivos', async () => {
      const text = 'A'.repeat(1000);
      const compressed = await Compression.compressString(text);
      
      const ratio = compressed.byteLength / text.length;
      expect(ratio).toBeLessThan(0.5);  // Al menos 50% de ahorro
    });

    it('debe manejar strings vacíos', async () => {
      const compressed = await Compression.compressString('');
      const decompressed = await Compression.decompressString(compressed);
      expect(decompressed).toBe('');
    });

    it('debe manejar strings con Unicode', async () => {
      const text = '你好世界 🚀 ñoño café 🤖';
      const compressed = await Compression.compressString(text);
      const decompressed = await Compression.decompressString(compressed);
      expect(decompressed).toBe(text);
    });

    it('debe manejar strings largos', async () => {
      const text = 'Lorem ipsum dolor sit amet '.repeat(500);
      const compressed = await Compression.compressString(text);
      const decompressed = await Compression.decompressString(compressed);
      expect(decompressed).toBe(text);
    });
  });

  // ============ COMPRESIÓN DE JSON ============
  describe('compressJSON / decompressJSON', () => {
    it('debe comprimir y descomprimir un objeto JSON', async () => {
      const obj = {
        records: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          content: 'Lorem ipsum dolor sit amet'
        }))
      };

      const compressed = await Compression.compressJSON(obj);
      expect(compressed).toBeInstanceOf(Uint8Array);
      
      const decompressed = await Compression.decompressJSON(compressed);
      expect(decompressed).toEqual(obj);
    });

    it('debe comprimir JSON de forma eficiente', async () => {
      const obj = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          category: 'general',
          tags: ['tag1', 'tag2']
        }))
      };

      const json = JSON.stringify(obj);
      const compressed = await Compression.compressJSON(obj);
      
      const ratio = compressed.byteLength / json.length;
      expect(ratio).toBeLessThan(0.3);  // Al menos 70% de ahorro
    });
  });

  // ============ COMPRESIÓN CONDICIONAL ============
  describe('compressIfNeeded', () => {
    it('no debe comprimir blobs muy pequeños', async () => {
      const smallBlob = new Blob(['x']);
      const result = await Compression.compressIfNeeded(smallBlob, 1024);
      
      expect(result.compressed).toBe(false);
      expect(result.blob).toBe(smallBlob);
    });

    it('debe comprimir blobs grandes', async () => {
      const largeText = 'repetido '.repeat(1000);
      const largeBlob = new Blob([largeText]);
      const result = await Compression.compressIfNeeded(largeBlob, 1024);
      
      if (Compression.isSupported()) {
        expect(result.compressed).toBe(true);
        expect(result.blob.size).toBeLessThan(largeBlob.size);
        expect(result.ratio).toBeLessThan(1);
      }
    });

    it('debe retornar metadata completa al comprimir', async () => {
      const text = 'A'.repeat(10000);
      const blob = new Blob([text]);
      const result = await Compression.compressIfNeeded(blob, 100);
      
      if (result.compressed) {
        expect(result.originalSize).toBe(blob.size);
        expect(result.compressedSize).toBeLessThan(result.originalSize);
        expect(result.format).toBe('gzip');
      }
    });
  });

  // ============ ESTIMACIÓN DE RATIO ============
  describe('estimateRatio', () => {
    it('debe estimar el ratio de compresión', async () => {
      const text = 'repetido '.repeat(1000);
      const blob = new Blob([text]);
      const ratio = await Compression.estimateRatio(blob);
      
      if (Compression.isSupported()) {
        expect(ratio).toBeGreaterThan(0);
        expect(ratio).toBeLessThan(1);
      } else {
        expect(ratio).toBe(1);
      }
    });
  });

  // ============ COMPRESIÓN BASE64 ============
  describe('compressToBase64 / decompressFromBase64', () => {
    it('debe comprimir y descomprimir desde Base64', async () => {
      const text = 'Lorem ipsum '.repeat(100);
      const base64 = await Compression.compressToBase64(text);
      
      expect(typeof base64).toBe('string');
      expect(base64.length).toBeGreaterThan(0);
      
      const decompressed = await Compression.decompressFromBase64(base64);
      expect(decompressed).toBe(text);
    });
  });

  // ============ FORMATOS ============
  describe('formatos de compresión', () => {
    it('debe soportar gzip', async () => {
      const text = 'Lorem ipsum '.repeat(100);
      const compressed = await Compression.compressString(text, 'gzip');
      const decompressed = await Compression.decompressString(compressed, 'gzip');
      expect(decompressed).toBe(text);
    });

    it('debe soportar deflate', async () => {
      const text = 'Lorem ipsum '.repeat(100);
      const compressed = await Compression.compressString(text, 'deflate');
      const decompressed = await Compression.decompressString(compressed, 'deflate');
      expect(decompressed).toBe(text);
    });
  });

  // ============ CASOS REALES ============
  describe('Casos reales de sincronización', () => {
    it('debe comprimir payload típico de sincronización', async () => {
      const payload = {
        records: Array.from({ length: 50 }, (_, i) => ({
          id: Date.now() + i,
          name: `Registro ${i}`,
          content: 'Contenido de prueba para sincronización',
          tags: ['sincronización', 'test'],
          category: 'general',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })),
        device_id: 'device-001',
        timestamp: new Date().toISOString()
      };

      const json = JSON.stringify(payload);
      const compressed = await Compression.compressJSON(payload);
      
      if (Compression.isSupported()) {
        const ratio = compressed.byteLength / json.length;
        expect(ratio).toBeLessThan(0.2);  // Al menos 80% de ahorro
      }
    });
  });
});

// ============ CHUNKED COMPRESSOR ============
describe('ChunkedCompressor', () => {
  it('debe comprimir un blob en chunks', async () => {
    const chunkSize = 1024;
    const compressor = new ChunkedCompressor(chunkSize);
    
    const text = 'A'.repeat(3000);
    const blob = new Blob([text]);
    
    const chunks = [];
    for await (const chunk of compressor.streamCompress(blob)) {
      chunks.push(chunk);
    }
    
    expect(chunks.length).toBe(3);  // 3000 / 1024 = 3 chunks
    expect(chunks[0].index).toBe(0);
    expect(chunks[1].index).toBe(1);
    expect(chunks[2].index).toBe(2);
  });

  it('debe reensamblar chunks comprimidos', async () => {
    const chunkSize = 1024;
    const compressor = new ChunkedCompressor(chunkSize);
    
    const text = 'Lorem ipsum '.repeat(300);
    const blob = new Blob([text]);
    
    const chunks = [];
    for await (const chunk of compressor.streamCompress(blob)) {
      chunks.push(chunk);
    }
    
    const reassembled = await compressor.reassemble(chunks);
    const resultText = await reassembled.text();
    
    expect(resultText).toBe(text);
  });

  it('debe comprimir blobs grandes de forma eficiente', async () => {
    const compressor = new ChunkedCompressor(1024);
    const text = 'A'.repeat(10000);
    const blob = new Blob([text]);
    
    let totalOriginal = 0;
    let totalCompressed = 0;
    
    for await (const chunk of compressor.streamCompress(blob)) {
      totalOriginal += chunk.originalSize;
      totalCompressed += chunk.compressedSize;
    }
    
    if (Compression.isSupported()) {
      const ratio = totalCompressed / totalOriginal;
      expect(ratio).toBeLessThan(0.5);
    }
  });
});