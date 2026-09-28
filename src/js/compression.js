// src/js/compression.js

/**
 * Compresión nativa con CompressionStream API.
 * 
 * Proporciona:
 *   - Compresión gzip/deflate con APIs nativas del navegador
 *   - Fallback a no comprimir si no está disponible
 *   - Compresión condicional (solo si reduce el tamaño)
 *   - Compresión por chunks para archivos grandes
 * 
 * Aplicación en LocalAdmin:
 *   - Comprimir metadatos antes de enviar a GAS
 *   - Comprimir archivos de texto (JSON, CSV, TXT)
 *   - Reducir ancho de banda en sincronización
 * 
 * Referencia: EDC Página 124-127 + PAE Semana 2, Día 10
 */

export class Compression {
  /**
   * Verifica si CompressionStream está soportado.
   * @returns {boolean}
   */
  static isSupported() {
    return typeof CompressionStream !== 'undefined' &&
           typeof DecompressionStream !== 'undefined';
  }

  /**
   * Comprime datos usando CompressionStream.
   * 
   * @param {Blob|ArrayBuffer|Uint8Array|string} data - Datos a comprimir
   * @param {string} format - Formato de compresión ('gzip' | 'deflate')
   * @returns {Promise<Blob>} - Datos comprimidos
   */
  static async compress(data, format = 'gzip') {
    // Si no hay soporte, retornar los datos tal cual
    if (!this.isSupported()) {
      console.warn('CompressionStream no soportado');
      return data instanceof Blob ? data : new Blob([data]);
    }

    // Normalizar datos a Blob
    const blob = data instanceof Blob ? data : new Blob([data]);

    try {
      // Crear stream de compresión
      const stream = blob.stream().pipeThrough(new CompressionStream(format));
      return new Response(stream).blob();
    } catch (e) {
      console.warn(`Error comprimiendo con ${format}:`, e);
      return blob;
    }
  }

  /**
   * Descomprime datos usando DecompressionStream.
   * 
   * @param {Blob|ArrayBuffer|Uint8Array} data - Datos comprimidos
   * @param {string} format - Formato de compresión ('gzip' | 'deflate')
   * @returns {Promise<Blob>} - Datos descomprimidos
   */
  static async decompress(data, format = 'gzip') {
    if (!this.isSupported()) {
      return data instanceof Blob ? data : new Blob([data]);
    }

    const blob = data instanceof Blob ? data : new Blob([data]);

    try {
      const stream = blob.stream().pipeThrough(new DecompressionStream(format));
      return new Response(stream).blob();
    } catch (e) {
      console.warn(`Error descomprimiendo con ${format}:`, e);
      return blob;
    }
  }

  /**
   * Comprime un string y retorna ArrayBuffer.
   * @param {string} text 
   * @param {string} format 
   * @returns {Promise<ArrayBuffer>}
   */
  static async compressString(text, format = 'gzip') {
    const blob = new Blob([text], { type: 'text/plain' });
    const compressed = await this.compress(blob, format);
    return await compressed.arrayBuffer();
  }

  /**
   * Descomprime un ArrayBuffer a string.
   * @param {ArrayBuffer} arrayBuffer 
   * @param {string} format 
   * @returns {Promise<string>}
   */
  static async decompressString(arrayBuffer, format = 'gzip') {
    const blob = new Blob([arrayBuffer]);
    const decompressed = await this.decompress(blob, format);
    return await decompressed.text();
  }

  /**
   * Comprime un objeto JSON.
   * @param {Object} obj 
   * @param {string} format 
   * @returns {Promise<Uint8Array>}
   */
  static async compressJSON(obj, format = 'gzip') {
    const json = JSON.stringify(obj);
    const compressed = await this.compressString(json, format);
    return new Uint8Array(compressed);
  }

  /**
   * Descomprime un Uint8Array a objeto JSON.
   * @param {Uint8Array} uint8Array 
   * @param {string} format 
   * @returns {Promise<Object>}
   */
  static async decompressJSON(uint8Array, format = 'gzip') {
    const text = await this.decompressString(uint8Array.buffer, format);
    return JSON.parse(text);
  }

  /**
   * Comprime un Blob SOLO si reduce el tamaño.
   * Útil para evitar comprimir archivos ya comprimidos (imágenes, videos).
   * 
   * @param {Blob} blob 
   * @param {number} thresholdBytes - Tamaño mínimo para comprimir
   * @param {string} format 
   * @returns {Promise<{blob: Blob, compressed: boolean, format: string|null}>}
   */
  static async compressIfNeeded(blob, thresholdBytes = 1024, format = 'gzip') {
    // Si es muy pequeño, no comprimir
    if (blob.size < thresholdBytes) {
      return { blob, compressed: false, format: null };
    }

    const compressed = await this.compress(blob, format);

    // Solo usar compresión si reduce el tamaño
    if (compressed.size < blob.size) {
      return { 
        blob: compressed, 
        compressed: true, 
        format,
        originalSize: blob.size,
        compressedSize: compressed.size,
        ratio: compressed.size / blob.size
      };
    }

    return { blob, compressed: false, format: null };
  }

  /**
   * Estima la tasa de compresión de un Blob.
   * 
   * @param {Blob} blob 
   * @param {string} format 
   * @returns {Promise<number>} - Ratio (0-1, donde 0.3 = 70% de ahorro)
   */
  static async estimateRatio(blob, format = 'gzip') {
    if (!this.isSupported()) return 1;

    try {
      const compressed = await this.compress(blob, format);
      return compressed.size / blob.size;
    } catch (e) {
      return 1;
    }
  }

  /**
   * Comprime datos a Base64 (útil para enviar a GAS).
   * @param {string} text 
   * @param {string} format 
   * @returns {Promise<string>}
   */
  static async compressToBase64(text, format = 'gzip') {
    const compressed = await this.compressString(text, format);
    return this._arrayBufferToBase64(compressed);
  }

  /**
   * Descomprime desde Base64.
   * @param {string} base64 
   * @param {string} format 
   * @returns {Promise<string>}
   */
  static async decompressFromBase64(base64, format = 'gzip') {
    const arrayBuffer = this._base64ToArrayBuffer(base64);
    return await this.decompressString(arrayBuffer, format);
  }

  /**
   * Convierte ArrayBuffer a Base64.
   * @private
   */
  static _arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + chunkSize)
      );
    }
    return btoa(binary);
  }

  /**
   * Convierte Base64 a ArrayBuffer.
   * @private
   */
  static _base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// ============================================================================
// CHUNKED COMPRESSOR (para archivos grandes)
// ============================================================================

/**
 * Comprime archivos grandes en chunks para evitar cargar todo en memoria.
 */
export class ChunkedCompressor {
  /**
   * @param {number} chunkSize - Tamaño de cada chunk (default: 5MB)
   */
  constructor(chunkSize = 5 * 1024 * 1024) {
    this.chunkSize = chunkSize;
  }

  /**
   * Comprime un archivo en chunks (generador async).
   * 
   * @param {File|Blob} file 
   * @param {string} format 
   * @yields {Object} - { index, total, data, originalSize, compressedSize }
   */
  async *streamCompress(file, format = 'gzip') {
    const totalChunks = Math.ceil(file.size / this.chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, file.size);
      const chunk = file.slice(start, end);

      const compressed = await Compression.compress(chunk, format);

      yield {
        index: i,
        total: totalChunks,
        data: compressed,
        originalSize: chunk.size,
        compressedSize: compressed.size
      };
    }
  }

  /**
   * Reensambla chunks comprimidos en un solo Blob.
   * 
   * @param {Array<{index: number, data: Blob}>} chunks 
   * @param {string} format 
   * @returns {Promise<Blob>}
   */
  async reassemble(chunks, format = 'gzip') {
    const sorted = [...chunks].sort((a, b) => a.index - b.index);
    const parts = [];

    for (const chunk of sorted) {
      const decompressed = await Compression.decompress(chunk.data, format);
      parts.push(decompressed);
    }

    return new Blob(parts);
  }
}