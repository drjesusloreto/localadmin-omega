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
});