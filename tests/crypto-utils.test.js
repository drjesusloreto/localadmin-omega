// tests/crypto-utils.test.js

import { describe, it, expect, beforeAll } from 'vitest';
import { CryptoUtils } from '../src/js/core/crypto-utils.js';

describe('CryptoUtils', () => {
  let testKey;
  const testPassword = 'test-password-123-¡muy-segura!';
  const testSalt = CryptoUtils.generateSalt();

  beforeAll(async () => {
    testKey = await CryptoUtils.deriveKey(testPassword, testSalt);
  });

  // ============ GENERATE SALT ============
  describe('generateSalt', () => {
    it('debe generar un salt de 16 bytes', () => {
      const salt = CryptoUtils.generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(16);
    });

    it('debe generar salts únicos cada vez', () => {
      const salt1 = CryptoUtils.generateSalt();
      const salt2 = CryptoUtils.generateSalt();
      expect(salt1).not.toEqual(salt2);
    });
  });

  // ============ GENERATE IV ============
  describe('generateIV', () => {
    it('debe generar un IV de 12 bytes', () => {
      const iv = CryptoUtils.generateIV();
      expect(iv).toBeInstanceOf(Uint8Array);
      expect(iv.length).toBe(12);
    });

    it('debe generar IVs únicos', () => {
      const iv1 = CryptoUtils.generateIV();
      const iv2 = CryptoUtils.generateIV();
      expect(iv1).not.toEqual(iv2);
    });
  });

  // ============ DERIVE KEY ============
  describe('deriveKey', () => {
    it('debe derivar una clave AES-GCM', async () => {
      const key = await CryptoUtils.deriveKey(testPassword, testSalt);
      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
      expect(key.algorithm.name).toBe('AES-GCM');
      expect(key.algorithm.length).toBe(256);
    });

    it('debe producir la misma clave con el mismo password y salt', async () => {
      const key1 = await CryptoUtils.deriveKey(testPassword, testSalt);
      const key2 = await CryptoUtils.deriveKey(testPassword, testSalt);
      
      // Cifrar con key1, descifrar con key2 (deben coincidir)
      const ciphertext = await CryptoUtils.encryptString('test', key1);
      const plaintext = await CryptoUtils.decryptString(ciphertext, key2);
      expect(plaintext).toBe('test');
    });
  });

  // ============ ENCRYPT/DECRYPT STRING ============
  describe('encryptString / decryptString', () => {
    it('debe cifrar y descifrar un texto simple', async () => {
      const original = 'Hola mundo secreto 🔐';
      const encrypted = await CryptoUtils.encryptString(original, testKey);
      expect(encrypted).not.toBe(original);
      expect(typeof encrypted).toBe('string');
      
      const decrypted = await CryptoUtils.decryptString(encrypted, testKey);
      expect(decrypted).toBe(original);
    });

    it('debe producir cifrados diferentes cada vez (IV único)', async () => {
      const original = 'Texto repetido';
      const enc1 = await CryptoUtils.encryptString(original, testKey);
      const enc2 = await CryptoUtils.encryptString(original, testKey);
      expect(enc1).not.toBe(enc2); // IVs diferentes
    });

    it('debe fallar al descifrar con clave incorrecta', async () => {
      const encrypted = await CryptoUtils.encryptString('secreto', testKey);
      
      const wrongSalt = CryptoUtils.generateSalt();
      const wrongKey = await CryptoUtils.deriveKey('wrong-password', wrongSalt);
      
      await expect(
        CryptoUtils.decryptString(encrypted, wrongKey)
      ).rejects.toThrow();
    });

    it('debe manejar strings vacíos', async () => {
      const encrypted = await CryptoUtils.encryptString('', testKey);
      const decrypted = await CryptoUtils.decryptString(encrypted, testKey);
      expect(decrypted).toBe('');
    });

    it('debe manejar strings largos', async () => {
      const original = 'Lorem ipsum '.repeat(1000);
      const encrypted = await CryptoUtils.encryptString(original, testKey);
      const decrypted = await CryptoUtils.decryptString(encrypted, testKey);
      expect(decrypted).toBe(original);
    });

    it('debe manejar caracteres Unicode y emojis', async () => {
      const original = '你好世界 🚀 ñoño 🤖 café';
      const encrypted = await CryptoUtils.encryptString(original, testKey);
      const decrypted = await CryptoUtils.decryptString(encrypted, testKey);
      expect(decrypted).toBe(original);
    });
  });

  // ============ HASH ============
  describe('hash', () => {
    it('debe producir un hash SHA-256 consistente', async () => {
      const hash1 = await CryptoUtils.hash('test');
      const hash2 = await CryptoUtils.hash('test');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('debe producir hashes diferentes para inputs diferentes', async () => {
      const hash1 = await CryptoUtils.hash('test1');
      const hash2 = await CryptoUtils.hash('test2');
      expect(hash1).not.toBe(hash2);
    });
	
	it('debe calcular hash de un Uint8Array', async () => {
	  const data = new Uint8Array([1, 2, 3, 4, 5]);
	  const hash = await CryptoUtils.hash(data);
	  expect(hash).toHaveLength(64);
	  
	  // Debe ser igual al hash de la representación binaria
	  const hashAgain = await CryptoUtils.hash(new Uint8Array([1, 2, 3, 4, 5]));
	  expect(hash).toBe(hashAgain);
	});
  });

  // ============ BASE64 UTILS ============
  describe('Base64 utils', () => {
    it('debe convertir a base64 y viceversa', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 255, 254, 253]);
      const base64 = CryptoUtils.arrayBufferToBase64(original);
      const restored = new Uint8Array(CryptoUtils.base64ToArrayBuffer(base64));
      expect(restored).toEqual(original);
    });
  });
    // ============ CIFRADO DE BYTES ============
  describe('encrypt / decrypt (bytes)', () => {
    it('debe cifrar y descifrar un Uint8Array', async () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 255, 128, 0]);
      const encrypted = await CryptoUtils.encrypt(original, testKey);
      
      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted).not.toEqual(original);
      
      const decrypted = await CryptoUtils.decrypt(encrypted, testKey);
      expect(decrypted).toEqual(original);
    });

    it('debe fallar al descifrar con clave incorrecta', async () => {
      const data = new Uint8Array([1, 2, 3]);
      const encrypted = await CryptoUtils.encrypt(data, testKey);
      
      const wrongSalt = CryptoUtils.generateSalt();
      const wrongKey = await CryptoUtils.deriveKey('wrong', wrongSalt);
      
      await expect(
        CryptoUtils.decrypt(encrypted, wrongKey)
      ).rejects.toThrow();
    });

    it('debe manejar datos binarios vacíos', async () => {
      const empty = new Uint8Array(0);
      const encrypted = await CryptoUtils.encrypt(empty, testKey);
      const decrypted = await CryptoUtils.decrypt(encrypted, testKey);
      
      expect(decrypted.length).toBe(0);
    });
  });

  // ============ HASH DE BLOBS ============
  describe('hashBlob', () => {
    it('debe calcular el hash de un Blob', async () => {
      const blob = new Blob(['contenido de prueba'], { type: 'text/plain' });
      const hash = await CryptoUtils.hashBlob(blob);
      
      expect(hash).toHaveLength(64);
      expect(typeof hash).toBe('string');
    });

    it('debe producir el mismo hash para el mismo contenido', async () => {
      const blob1 = new Blob(['test']);
      const blob2 = new Blob(['test']);
      
      const hash1 = await CryptoUtils.hashBlob(blob1);
      const hash2 = await CryptoUtils.hashBlob(blob2);
      
      expect(hash1).toBe(hash2);
    });

    it('debe producir hashes diferentes para contenidos diferentes', async () => {
      const blob1 = new Blob(['a']);
      const blob2 = new Blob(['b']);
      
      const hash1 = await CryptoUtils.hashBlob(blob1);
      const hash2 = await CryptoUtils.hashBlob(blob2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  // ============ CIFRADO DE BLOBS ============
  describe('encryptBlob / decryptBlob', () => {
    it('debe cifrar y descifrar un Blob', async () => {
      const original = new Blob(['contenido secreto'], { type: 'text/plain' });
      const encrypted = await CryptoUtils.encryptBlob(original, testKey);
      
      expect(encrypted).toBeInstanceOf(Blob);
      expect(encrypted.size).toBeGreaterThan(0);
      
      const decrypted = await CryptoUtils.decryptBlob(encrypted, testKey, 'text/plain');
      const text = await decrypted.text();
      
      expect(text).toBe('contenido secreto');
    });

    it('debe preservar el contenido binario exacto', async () => {
      const bytes = new Uint8Array([0, 1, 2, 3, 254, 255]);
      const original = new Blob([bytes]);
      const encrypted = await CryptoUtils.encryptBlob(original, testKey);
      const decrypted = await CryptoUtils.decryptBlob(encrypted, testKey);
      
      const decryptedBuffer = await decrypted.arrayBuffer();
      expect(new Uint8Array(decryptedBuffer)).toEqual(bytes);
    });

    it('debe manejar Blobs grandes (1MB)', async () => {
      const largeData = new Uint8Array(1024 * 1024).map(() => 
        Math.floor(Math.random() * 256)
      );
      const original = new Blob([largeData]);
      
      const encrypted = await CryptoUtils.encryptBlob(original, testKey);
      const decrypted = await CryptoUtils.decryptBlob(encrypted, testKey);
      
      const decryptedBuffer = await decrypted.arrayBuffer();
      expect(new Uint8Array(decryptedBuffer)).toEqual(largeData);
    });

    it('debe fallar al descifrar con clave incorrecta', async () => {
      const original = new Blob(['test']);
      const encrypted = await CryptoUtils.encryptBlob(original, testKey);
      
      const wrongSalt = CryptoUtils.generateSalt();
      const wrongKey = await CryptoUtils.deriveKey('wrong', wrongSalt);
      
      await expect(
        CryptoUtils.decryptBlob(encrypted, wrongKey)
      ).rejects.toThrow();
    });
  });
});