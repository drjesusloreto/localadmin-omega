// tests/integration.test.js

/**
 * Tests de integración entre módulos del Nivel 1.
 * Verifica que CryptoUtils, VectorClock, MerkleTree y BlockchainAudit
 * funcionan juntos en escenarios reales.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  CryptoUtils, 
  VectorClock, 
  MerkleTree, 
  BlockchainAudit 
} from '../src/js/core/index.js';

describe('Integración del Núcleo (Nivel 1)', () => {
  
  // ============ ESCENARIO 1: FLUJO COMPLETO DE AUDITORÍA ============
  describe('Escenario: Flujo completo de auditoría cifrada', () => {
    let audit;
    let key;
    
    beforeEach(async () => {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
      
      audit = new BlockchainAudit();
      await audit.init();
      
      const salt = CryptoUtils.generateSalt();
      key = await CryptoUtils.deriveKey('master-password-123', salt);
    });
    
    it('debe cifrar, auditar y verificar un cambio completo', async () => {
      // 1. Usuario hace un cambio
      const record = {
        id: 1001,
        name: 'Factura #001',
        content: 'Cliente: Acme Corp',
        amount: 5000
      };
      
      // 2. Cifrar el contenido sensible
      const encryptedContent = await CryptoUtils.encryptString(
        record.content,
        key
      );
      
      // 3. Registrar el evento de auditoría
      await audit.log({
        action: 'CREATE',
        recordId: record.id,
        encryptedContent
      });
      
      // 4. Sellar el bloque
      const block = await audit.sealBlock();
      
      // 5. Verificar la cadena
      const report = await audit.verify();
      
      expect(report.valid).toBe(true);
      expect(block.events.length).toBe(1);
      
      // 6. Descifrar el contenido
      const decrypted = await CryptoUtils.decryptString(
        block.events[0].encryptedContent,
        key
      );
      
      expect(decrypted).toBe('Cliente: Acme Corp');
    });
  });
  
  // ============ ESCENARIO 2: SINCRONIZACIÓN MULTI-DISPOSITIVO ============
  describe('Escenario: Sincronización multi-dispositivo', () => {
    it('debe detectar y resolver un conflicto entre 2 dispositivos', async () => {
      // 1. Estado inicial compartido
      const baseClock = new VectorClock('dev_A', { dev_A: 1, dev_B: 1 });
      
      // 2. Dispositivo A edita localmente
      const clockA = baseClock.clone();
      clockA.increment(); // {dev_A: 2, dev_B: 1}
      
      // 3. Dispositivo B edita localmente sin sincronizar
      const clockB = new VectorClock('dev_B', { dev_A: 1, dev_B: 1 });
      clockB.increment(); // {dev_A: 1, dev_B: 2}
      
      // 4. Al comparar → CONFLICTO
      expect(clockA.isConcurrent(clockB)).toBe(true);
      
      // 5. Resolver con merge
      const resolved = clockA.merge(clockB);
      
      expect(resolved.clock).toEqual({ dev_A: 2, dev_B: 2 });
      expect(resolved.dominates(clockA)).toBe(true);
      expect(resolved.dominates(clockB)).toBe(true);
    });
  });
  
  // ============ ESCENARIO 3: INTEGRIDAD COMPLETA ============
  describe('Escenario: Verificación de integridad completa', () => {
    it('debe verificar un bloque con Merkle Tree + Blockchain Audit', async () => {
      // 1. Crear 10 eventos
      const events = [];
      for (let i = 0; i < 10; i++) {
        events.push({
          action: 'CREATE',
          recordId: i,
          hash: await CryptoUtils.hash(`record-${i}`)
        });
      }
      
      // 2. Crear Merkle Tree de los eventos
      const tree = await MerkleTree.fromData(events);
      const merkleRoot = tree.getRoot();
      
      // 3. Verificar que un evento específico está en el árbol
      const proof = tree.getProof(5);
      const isValid = MerkleTree.verifyProof(
        await CryptoUtils.hash(JSON.stringify(events[5])),
        proof,
        merkleRoot
      );
      
      expect(isValid).toBe(true);
      
      // 4. Verificar que un evento falso NO está en el árbol
      const fakeHash = await CryptoUtils.hash('fake-event');
      const isFakeValid = MerkleTree.verifyProof(fakeHash, proof, merkleRoot);
      
      expect(isFakeValid).toBe(false);
    });
  });
  
  // ============ ESCENARIO 4: DETECCIÓN DE MANIPULACIÓN ============
  describe('Escenario: Detección de manipulación end-to-end', () => {
    it('debe detectar manipulación de datos cifrados y auditados', async () => {
      // 1. Setup
      if (typeof localStorage !== 'undefined') localStorage.clear();
      
      const audit = new BlockchainAudit();
      await audit.init();
      
      const salt = CryptoUtils.generateSalt();
      const key = await CryptoUtils.deriveKey('password', salt);
      
      // 2. Registrar 3 eventos
      for (let i = 0; i < 3; i++) {
        const encrypted = await CryptoUtils.encryptString(`secret-${i}`, key);
        await audit.log({ action: 'CREATE', recordId: i, encrypted });
      }
      await audit.sealBlock();
      
      // 3. Verificar cadena íntegra
      const validReport = await audit.verify();
      expect(validReport.valid).toBe(true);
      
      // 4. Manipular un evento
      audit.chain[0].events[1].encrypted = 'tampered-data';
      
      // 5. Verificar cadena manipulada
      const tamperedReport = await audit.verify();
      expect(tamperedReport.valid).toBe(false);
      expect(tamperedReport.errors.length).toBeGreaterThan(0);
    });
  });
  
  // ============ ESCENARIO 5: FLUJO REALISTA DE LA APP ============
  describe('Escenario: Flujo realista de la aplicación', () => {
    it('debe manejar el ciclo completo: crear, cifrar, auditar, sincronizar, verificar', async () => {
      // ===== SETUP =====
      if (typeof localStorage !== 'undefined') localStorage.clear();
      
      const deviceId = 'device-user-001';
      const password = 'secure-password-2024';
      
      // 1. Derivar clave maestra
      const salt = CryptoUtils.generateSalt();
      const masterKey = await CryptoUtils.deriveKey(password, salt);
      
      // 2. Inicializar auditoría
      const audit = new BlockchainAudit();
      await audit.init();
      
      // 3. Inicializar vector clock
      const clock = new VectorClock(deviceId, {});
      
      // ===== CREAR REGISTRO =====
      const newRecord = {
        id: Date.now(),
        name: 'Documento Confidencial',
        content: 'Información sensible del cliente',
        tags: ['legal', 'urgente']
      };
      
      // 4. Cifrar contenido
      const encryptedContent = await CryptoUtils.encryptString(
        newRecord.content,
        masterKey
      );
      
      // 5. Incrementar vector clock
      clock.increment();
      
      // 6. Registrar en auditoría
      await audit.log({
        action: 'CREATE',
        deviceId,
        recordId: newRecord.id,
        clock: clock.toJSON(),
        encryptedContent,
        recordHash: await CryptoUtils.hash(JSON.stringify(newRecord))
      });
      
      // ===== VERIFICAR =====
      const auditReport = await audit.verify();
      expect(auditReport.valid).toBe(true);
      
      // 7. Descifrar y verificar
      const decrypted = await CryptoUtils.decryptString(
        encryptedContent,
        masterKey
      );
      expect(decrypted).toBe('Información sensible del cliente');
      
      // 8. Verificar el vector clock
      expect(clock.clock[deviceId]).toBe(1);
      
      // ===== SELLAR Y AUDITAR =====
      const finalBlock = await audit.sealBlock();
      expect(finalBlock.events.length).toBe(1);
      expect(finalBlock.previousHash).toBe('0'.repeat(64));
      
      // ===== ESTADO FINAL =====
      const stats = audit.getStats();
      expect(stats.totalBlocks).toBe(1);
      expect(stats.totalEvents).toBe(1);
    });
  });
  
  // ============ ESCENARIO 6: ROBUSTEZ ============
  describe('Escenario: Robustez ante fallos', () => {
    it('debe manejar correctamente fallos de descifrado sin corromper la auditoría', async () => {
      if (typeof localStorage !== 'undefined') localStorage.clear();
      
      const audit = new BlockchainAudit();
      await audit.init();
      
      const correctKey = await CryptoUtils.deriveKey(
        'correct-password',
        CryptoUtils.generateSalt()
      );
      const wrongKey = await CryptoUtils.deriveKey(
        'wrong-password',
        CryptoUtils.generateSalt()
      );
      
      const encrypted = await CryptoUtils.encryptString('secreto', correctKey);
      
      // Registrar el evento
      await audit.log({ action: 'CREATE', encrypted });
      
      // Intento de descifrado con clave incorrecta
      await expect(
        CryptoUtils.decryptString(encrypted, wrongKey)
      ).rejects.toThrow();
      
      // La auditoría sigue funcionando
      const report = await audit.verify();
      expect(report.valid).toBe(true);
    });
  });
});