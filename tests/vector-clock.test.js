// tests/vector-clock.test.js

import { describe, it, expect, beforeEach } from 'vitest';
import { VectorClock, getDeviceId } from '../src/js/core/vector-clock.js';

describe('VectorClock', () => {
  let clockA, clockB;

  beforeEach(() => {
    clockA = new VectorClock('dev_A', {});
    clockB = new VectorClock('dev_B', {});
  });

  // ============ CONSTRUCTOR ============
  describe('Constructor', () => {
    it('debe crear un reloj vacío', () => {
      expect(clockA.deviceId).toBe('dev_A');
      expect(clockA.clock).toEqual({});
    });

    it('debe crear un reloj con estado inicial', () => {
      const clock = new VectorClock('dev_X', { dev_A: 1, dev_B: 2 });
      expect(clock.clock).toEqual({ dev_A: 1, dev_B: 2 });
    });

    it('debe lanzar error si no se provee deviceId', () => {
      expect(() => new VectorClock()).toThrow();
      expect(() => new VectorClock(null)).toThrow();
      expect(() => new VectorClock('')).toThrow();
    });

    it('debe copiar el clock inicial (no compartir referencia)', () => {
      const original = { dev_A: 1 };
      const clock = new VectorClock('dev_X', original);
      clock.clock.dev_A = 99;
      expect(original.dev_A).toBe(1); // No debe modificarse
    });
  });

  // ============ INCREMENT ============
  describe('increment', () => {
    it('debe incrementar su propio contador', () => {
      clockA.increment();
      expect(clockA.clock.dev_A).toBe(1);
      
      clockA.increment();
      expect(clockA.clock.dev_A).toBe(2);
    });

    it('no debe afectar contadores de otros dispositivos', () => {
      clockA.clock = { dev_B: 5 };
      clockA.increment();
      expect(clockA.clock.dev_A).toBe(1);
      expect(clockA.clock.dev_B).toBe(5); // Sin cambios
    });

    it('debe devolver this para encadenamiento', () => {
      const result = clockA.increment().increment();
      expect(result).toBe(clockA);
      expect(clockA.clock.dev_A).toBe(2);
    });
  });

  // ============ COMPARE ============
  describe('compare', () => {
    it('debe detectar "equal" para relojes idénticos', () => {
      clockA.clock = { dev_A: 1, dev_B: 2 };
      clockB.clock = { dev_A: 1, dev_B: 2 };
      expect(clockA.compare(clockB)).toBe('equal');
    });

    it('debe detectar "before"', () => {
      clockA.clock = { dev_A: 1 };
      clockB.clock = { dev_A: 2 };
      expect(clockA.compare(clockB)).toBe('before');
    });

    it('debe detectar "after"', () => {
      clockA.clock = { dev_A: 3 };
      clockB.clock = { dev_A: 1 };
      expect(clockA.compare(clockB)).toBe('after');
    });

    it('debe detectar "concurrent" con múltiples dispositivos', () => {
      clockA.clock = { dev_A: 2, dev_B: 1 };
      clockB.clock = { dev_A: 1, dev_B: 3 };
      // A: A=2 > B: A=1 pero A: B=1 < B: B=3 → CONFLICTO
      expect(clockA.compare(clockB)).toBe('concurrent');
    });

    it('debe manejar dispositivos ausentes (tratados como 0)', () => {
      clockA.clock = { dev_A: 1 };
      clockB.clock = { dev_A: 1, dev_B: 1 };
      // A: B=0, B: B=1 → before
      expect(clockA.compare(clockB)).toBe('before');
    });

    it('debe aceptar un objeto plano (sin clase)', () => {
      clockA.clock = { dev_A: 1 };
      expect(clockA.compare({ dev_A: 2 })).toBe('before');
      expect(clockA.compare({ dev_A: 1 })).toBe('equal');
    });
  });

  // ============ MERGE ============
  describe('merge', () => {
    it('debe fusionar tomando el máximo de cada contador', () => {
      clockA.clock = { dev_A: 2, dev_B: 1 };
      clockB.clock = { dev_A: 1, dev_B: 3, dev_C: 5 };
      
      const merged = clockA.merge(clockB);
      
      expect(merged.clock).toEqual({ dev_A: 2, dev_B: 3, dev_C: 5 });
    });

    it('debe preservar el deviceId original', () => {
      const merged = clockA.merge(clockB);
      expect(merged.deviceId).toBe('dev_A');
    });

    it('no debe modificar los relojes originales', () => {
      clockA.clock = { dev_A: 1 };
      clockB.clock = { dev_B: 1 };
      
      clockA.merge(clockB);
      
      expect(clockA.clock).toEqual({ dev_A: 1 });
      expect(clockB.clock).toEqual({ dev_B: 1 });
    });

    it('debe devolver un nuevo VectorClock', () => {
      const merged = clockA.merge(clockB);
      expect(merged).toBeInstanceOf(VectorClock);
      expect(merged).not.toBe(clockA);
      expect(merged).not.toBe(clockB);
    });

    it('debe resultar en un reloj que domina a ambos originales', () => {
      clockA.clock = { dev_A: 2 };
      clockB.clock = { dev_B: 3 };
      
      const merged = clockA.merge(clockB);
      
      // Merged debe ser "after" de ambos
      expect(merged.compare(clockA)).toBe('after');
      expect(merged.compare(clockB)).toBe('after');
    });
  });

  // ============ SERIALIZACIÓN ============
  describe('toJSON / fromJSON', () => {
    it('debe serializar correctamente', () => {
      clockA.clock = { dev_A: 1, dev_B: 2 };
      const json = clockA.toJSON();
      
      expect(json).toEqual({
        deviceId: 'dev_A',
        clock: { dev_A: 1, dev_B: 2 }
      });
    });

    it('debe deserializar correctamente', () => {
      const json = { deviceId: 'dev_A', clock: { dev_A: 1, dev_B: 2 } };
      const clock = VectorClock.fromJSON(json);
      
      expect(clock).toBeInstanceOf(VectorClock);
      expect(clock.deviceId).toBe('dev_A');
      expect(clock.clock).toEqual({ dev_A: 1, dev_B: 2 });
    });

    it('debe hacer round-trip sin pérdida', () => {
      clockA.clock = { dev_A: 5, dev_B: 3, dev_C: 1 };
      const restored = VectorClock.fromJSON(clockA.toJSON());
      
      expect(restored.clock).toEqual(clockA.clock);
      expect(restored.deviceId).toBe(clockA.deviceId);
    });

    it('debe aceptar un fallbackDeviceId en fromJSON', () => {
      const clock = VectorClock.fromJSON(
        { clock: { dev_A: 1 } },
        'fallback_device'
      );
      expect(clock.deviceId).toBe('fallback_device');
    });

    it('debe lanzar error si no hay deviceId ni fallback', () => {
      expect(() => VectorClock.fromJSON({ clock: {} })).toThrow();
    });
  });

  // ============ HELPERS ============
  describe('clone', () => {
    it('debe crear una copia independiente', () => {
      clockA.clock = { dev_A: 1 };
      const cloned = clockA.clone();
      
      cloned.clock.dev_A = 99;
      expect(clockA.clock.dev_A).toBe(1); // Original intacto
    });
  });

  describe('dominates', () => {
    it('debe devolver true si es "after"', () => {
      clockA.clock = { dev_A: 2 };
      clockB.clock = { dev_A: 1 };
      expect(clockA.dominates(clockB)).toBe(true);
    });

    it('debe devolver true si es "equal"', () => {
      clockA.clock = { dev_A: 1 };
      clockB.clock = { dev_A: 1 };
      expect(clockA.dominates(clockB)).toBe(true);
    });

    it('debe devolver false si es "before"', () => {
      clockA.clock = { dev_A: 1 };
      clockB.clock = { dev_A: 2 };
      expect(clockA.dominates(clockB)).toBe(false);
    });

    it('debe devolver false si es "concurrent"', () => {
      clockA.clock = { dev_A: 2, dev_B: 1 };
      clockB.clock = { dev_A: 1, dev_B: 2 };
      expect(clockA.dominates(clockB)).toBe(false);
    });
  });

  describe('isConcurrent', () => {
    it('debe detectar conflictos reales', () => {
      clockA.clock = { dev_A: 2, dev_B: 1 };
      clockB.clock = { dev_A: 1, dev_B: 2 };
      expect(clockA.isConcurrent(clockB)).toBe(true);
    });

    it('debe devolver false si no hay conflicto', () => {
      clockA.clock = { dev_A: 2 };
      clockB.clock = { dev_A: 1 };
      expect(clockA.isConcurrent(clockB)).toBe(false);
    });
  });

  // ============ CASOS REALES DE SINCRONIZACIÓN ============
  describe('Escenarios reales de sincronización', () => {
    it('debe detectar edición concurrente del mismo registro', () => {
      // Escenario: A y B editan el mismo registro sin sincronizar
      const baseClock = new VectorClock('dev_A', { dev_A: 1, dev_B: 1 });
      
      // A edita
      const clockA = baseClock.clone();
      clockA.increment(); // → {dev_A: 2, dev_B: 1}
      
      // B edita (independientemente)
      const clockB = baseClock.clone();
      clockB.deviceId = 'dev_B';
      clockB.increment(); // → {dev_A: 1, dev_B: 2}
      
      // Al comparar → CONFLICTO
      expect(clockA.isConcurrent(clockB)).toBe(true);
    });

    it('debe resolver secuencia: A edita, B sincroniza, B edita', () => {
      // A edita
      const clockA = new VectorClock('dev_A', {});
      clockA.increment(); // {dev_A: 1}
      
      // B sincroniza y edita
      let clockB = new VectorClock('dev_B', {});
      clockB = clockB.merge(clockA); // {dev_A: 1}
      clockB.increment();            // {dev_A: 1, dev_B: 1}
      
      // A está "before" de B
      expect(clockA.compare(clockB)).toBe('before');
      expect(clockB.dominates(clockA)).toBe(true);
    });

    it('debe resolver merge de dos ramas concurrentes', () => {
      // Rama 1
      const clock1 = new VectorClock('dev_A', { dev_A: 1, dev_B: 1 });
      clock1.increment();
      
      // Rama 2
      const clock2 = new VectorClock('dev_B', { dev_A: 1, dev_B: 1 });
      clock2.increment();
      
      // Merge resuelve el conflicto
      const merged = clock1.merge(clock2);
      expect(merged.clock).toEqual({ dev_A: 2, dev_B: 2 });
      expect(merged.dominates(clock1)).toBe(true);
      expect(merged.dominates(clock2)).toBe(true);
    });
  });

  // ============ DEVICE ID ============
  describe('getDeviceId', () => {
    it('debe devolver un ID con prefijo "dev_"', () => {
      const id = getDeviceId();
      expect(id).toMatch(/^dev_/);
    });

    it('debe devolver el mismo ID en llamadas sucesivas', () => {
      const id1 = getDeviceId();
      const id2 = getDeviceId();
      expect(id1).toBe(id2);
    });
  });
    // ============ FALLBACKS Y CASOS ESPECIALES ============
  describe('Fallbacks y código defensivo', () => {
    it('getDeviceId debe funcionar sin localStorage (fallback)', () => {
      const originalLocalStorage = globalThis.localStorage;
      
      // Simular entorno sin localStorage (como Node puro)
      delete globalThis.localStorage;
      
      // Llamar a getDeviceId debería activar el fallback
      const id = getDeviceId();
      expect(id).toMatch(/^dev_/);
      
      // Restaurar
      globalThis.localStorage = originalLocalStorage;
    });

    it('fromJSON debe lanzar error si el objeto es null/undefined', () => {
      expect(() => VectorClock.fromJSON(null)).toThrow();
      expect(() => VectorClock.fromJSON(undefined)).toThrow();
    });

    it('fromJSON debe lanzar error si no hay deviceId ni fallback', () => {
      // Este test cubre la línea 155 (throw en fromJSON)
      expect(() => VectorClock.fromJSON({ clock: {} })).toThrow(
        /fromJSON requiere deviceId/
      );
    });

    it('compare debe tratar contadores ausentes como 0', () => {
      // Cubre ramas del operador || en compare
      const clock = new VectorClock('dev_A', { dev_A: 1 });
      // Comparar con un objeto vacío → dev_A=1 vs dev_A=0 → after
      expect(clock.compare({})).toBe('after');
      expect(clock.compare({ dev_A: 0 })).toBe('after');
      expect(clock.compare({ dev_A: 1 })).toBe('equal');
    });

    it('dominates debe cubrir todas las ramas', () => {
      const a = new VectorClock('dev_A', { dev_A: 2 });
      const b = new VectorClock('dev_B', { dev_A: 1 });
      const c = new VectorClock('dev_C', { dev_B: 1 });
      
      expect(a.dominates(b)).toBe(true);   // after
      expect(b.dominates(a)).toBe(false);  // before
      expect(a.dominates(a.clone())).toBe(true); // equal
      expect(a.dominates(c)).toBe(false);  // concurrent (líneas 155+)
    });
  });
});