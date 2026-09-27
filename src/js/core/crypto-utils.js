// src/js/core/crypto-utils.js

/**
 * Utilidades criptográficas para cifrado AES-256-GCM y derivación de claves.
 * Basado en Web Crypto API (crypto.subtle).
 * 
 * Referencia: EDC Página 31-34 + PAE Semana 1, Día 3
 */

// Constantes de seguridad
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;      // 128 bits
const IV_LENGTH = 12;        // 96 bits (recomendado para GCM)

export class CryptoUtils {
  
  /**
   * Deriva una clave criptográfica usando PBKDF2.
   * @param {string} password - Contraseña maestra
   * @param {Uint8Array} salt - Salt aleatorio (16 bytes)
   * @returns {Promise<CryptoKey>} - Clave derivada para AES-GCM
   */
  static async deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,                  // No exportable
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Genera un salt aleatorio de 16 bytes.
   * @returns {Uint8Array} - Salt criptográficamente seguro
   */
  static generateSalt() {
    return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  }

  /**
   * Genera un IV (Initialization Vector) aleatorio de 12 bytes.
   * @returns {Uint8Array} - IV criptográficamente seguro
   */
  static generateIV() {
    return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  }

  /**
   * Cifra un string usando AES-256-GCM.
   * Formato de salida: [IV (12 bytes) | Ciphertext + AuthTag]
   * @param {string} data - Texto plano
   * @param {CryptoKey} key - Clave AES-GCM
   * @returns {Promise<string>} - Texto cifrado en Base64
   */
  static async encryptString(data, key) {
    const iv = this.generateIV();
    const encoder = new TextEncoder();
    const encoded = encoder.encode(data);
    
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );
    
    // Concatenar IV + Ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    
    // Convertir a Base64
    return this.arrayBufferToBase64(combined);
  }

  /**
   * Descifra un string cifrado con AES-256-GCM.
   * @param {string} base64Data - Texto cifrado en Base64
   * @param {CryptoKey} key - Clave AES-GCM
   * @returns {Promise<string>} - Texto plano original
   */
  static async decryptString(base64Data, key) {
    const combined = new Uint8Array(this.base64ToArrayBuffer(base64Data));
    
    // Extraer IV y ciphertext
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);
    
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    return new TextDecoder().decode(plaintext);
  }

  /**
   * Calcula el hash SHA-256 de un string o Uint8Array.
   * @param {string|Uint8Array} data
   * @returns {Promise<string>} - Hash en formato hexadecimal
   */
  static async hash(data) {
    const encoded = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    return this.arrayBufferToHex(hashBuffer);
  }

  /**
   * Convierte un ArrayBuffer a string hexadecimal.
   */
  static arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convierte un ArrayBuffer/Uint8Array a string Base64.
   */
  static arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;  // 32KB chunks para evitar stack overflow
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + chunkSize)
      );
    }
    return btoa(binary);
  }

  /**
   * Convierte un string Base64 a ArrayBuffer.
   */
  static base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}