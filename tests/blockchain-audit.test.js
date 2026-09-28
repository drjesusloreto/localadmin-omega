// tests/blockchain-audit.test.js

import { describe, it, expect, beforeEach } from 'vitest';
import { BlockchainAudit } from '../src/js/core/audit/blockchain-audit.js';

describe('BlockchainAudit', () => {
  let audit;

  beforeEach(async () => {
    // Limpiar localStorage entre tests
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    audit = new BlockchainAudit();
    await audit.init();
  });

  // ============ INIT ============
  describe('init', () => {
    it('debe inicializar una cadena vacía', () => {
      expect(audit.chain).toEqual([]);
      expect(audit.pendingEvents).toEqual([]);
    });
  });

  // ============ LOG ============
  describe('log', () => {
    it('debe registrar un evento pendiente', async () => {
      await audit.log({ action: 'CREATE', recordId: 1 });
      expect(audit.pendingEvents.length).toBe(1);
      expect(audit.pendingEvents[0].action).toBe('CREATE');
    });

    it('debe añadir timestamp automáticamente', async () => {
      const event = await audit.log({ action: 'TEST' });
      expect(event.timestamp).toBeDefined();
    });

    it('debe añadir ID automáticamente', async () => {
      const event = await audit.log({ action: 'TEST' });
      expect(event.id).toBeDefined();
    });

    it('debe sellar bloque al alcanzar BLOCK_SIZE (50)', async () => {
      for (let i = 0; i < 50; i++) {
        await audit.log({ action: 'TEST', index: i });
      }
      
      expect(audit.chain.length).toBe(1);
      expect(audit.pendingEvents.length).toBe(0);
    });
  });

  // ============ SEAL BLOCK ============
  describe('sealBlock', () => {
    it('debe retornar null si no hay eventos', async () => {
      const block = await audit.sealBlock();
      expect(block).toBeNull();
    });

    it('debe sellar un bloque con eventos pendientes', async () => {
      await audit.log({ action: 'TEST' });
      const block = await audit.sealBlock();
      
      expect(block).not.toBeNull();
      expect(block.index).toBe(0);
      expect(block.events.length).toBe(1);
      expect(block.hash).toBeDefined();
      expect(block.previousHash).toBe('0'.repeat(64));
    });

    it('debe encadenar bloques con previousHash', async () => {
      await audit.log({ action: 'TEST_1' });
      const block1 = await audit.sealBlock();
      
      await audit.log({ action: 'TEST_2' });
      const block2 = await audit.sealBlock();
      
      expect(block2.previousHash).toBe(block1.hash);
      expect(block2.index).toBe(1);
    });
  });

  // ============ VERIFY ============
  describe('verify', () => {
    it('debe verificar una cadena íntegra', async () => {
      for (let i = 0; i < 100; i++) {
        await audit.log({ action: 'TEST', index: i });
      }
      
      const report = await audit.verify();
      expect(report.valid).toBe(true);
      expect(report.blocks).toBe(2); // 100 eventos / 50 = 2 bloques
      expect(report.errors).toEqual([]);
    });

    it('debe detectar manipulación del hash', async () => {
      await audit.log({ action: 'TEST' });
      await audit.sealBlock();
      
      // Manipular el hash del bloque
      audit.chain[0].hash = 'tampered_hash';
      
      const report = await audit.verify();
      expect(report.valid).toBe(false);
      expect(report.errors.length).toBeGreaterThan(0);
    });

    it('debe detectar enlace roto entre bloques', async () => {
      for (let i = 0; i < 100; i++) {
        await audit.log({ action: 'TEST', index: i });
      }
      
      // Manipular el enlace
      audit.chain[1].previousHash = 'wrong_hash';
      
      const report = await audit.verify();
      expect(report.valid).toBe(false);
    });

    it('debe detectar manipulación de eventos', async () => {
      await audit.log({ action: 'ORIGINAL' });
      await audit.sealBlock();
      
      // Manipular un evento dentro del bloque
      audit.chain[0].events[0].action = 'TAMPERED';
      
      const report = await audit.verify();
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.error.includes('Merkle'))).toBe(true);
    });
  });

  // ============ EXPORT/IMPORT ============
  describe('export / import', () => {
    it('debe exportar la cadena', async () => {
      for (let i = 0; i < 50; i++) {
        await audit.log({ action: 'TEST', index: i });
      }
      
      const json = audit.export();
      expect(json).toContain('blocks');
      expect(json).toContain('version');
    });

    it('debe importar una cadena válida', async () => {
      for (let i = 0; i < 50; i++) {
        await audit.log({ action: 'TEST', index: i });
      }
      
      const json = audit.export();
      
      const newAudit = new BlockchainAudit();
      await newAudit.init();
      const report = await newAudit.import(json);
      
      expect(report.valid).toBe(true);
      expect(newAudit.chain.length).toBe(1);
    });

    it('debe rechazar una cadena manipulada', async () => {
      for (let i = 0; i < 50; i++) {
        await audit.log({ action: 'TEST', index: i });
      }
      
      // Manipular antes de exportar
      audit.chain[0].hash = 'tampered';
      const json = audit.export();
      
      const newAudit = new BlockchainAudit();
      await newAudit.init();
      
      await expect(newAudit.import(json)).rejects.toThrow();
    });
  });

  // ============ STATS ============
  describe('getStats', () => {
    it('debe devolver estadísticas correctas', async () => {
      for (let i = 0; i < 100; i++) {
        await audit.log({ action: 'TEST', index: i });
      }
      
      const stats = audit.getStats();
      expect(stats.totalBlocks).toBe(2);
      expect(stats.totalEvents).toBe(100);
      expect(stats.pendingEvents).toBe(0);
    });
  });

  // ============ FIND EVENTS ============
  describe('findEvents', () => {
    it('debe encontrar eventos por predicado', async () => {
      for (let i = 0; i < 50; i++) {
        await audit.log({ 
          action: i % 2 === 0 ? 'CREATE' : 'UPDATE',
          index: i
        });
      }
      
      const creates = audit.findEvents(e => e.action === 'CREATE');
      expect(creates.length).toBe(25);
    });

    it('debe encontrar eventos pendientes también', async () => {
      await audit.log({ action: 'PENDING_TEST' });
      
      const found = audit.findEvents(e => e.action === 'PENDING_TEST');
      expect(found.length).toBe(1);
      expect(found[0].pending).toBe(true);
    });
  });

  // ============ CLEAR ============
  describe('clear', () => {
    it('debe limpiar la cadena', async () => {
      for (let i = 0; i < 50; i++) {
        await audit.log({ action: 'TEST', index: i });
      }
      
      audit.clear();
      expect(audit.chain.length).toBe(0);
      expect(audit.pendingEvents.length).toBe(0);
    });
  });
});