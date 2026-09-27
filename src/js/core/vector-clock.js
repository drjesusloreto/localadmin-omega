// src/js/core/vector-clock.js

/**
 * Vector Clock para detección de conflictos en sincronización multi-dispositivo.
 * 
 * Cada dispositivo tiene un ID único y mantiene un contador lógico.
 * Al sincronizar, se comparan los relojes para detectar:
 *   - before: este reloj es más antiguo
 *   - after: este reloj es más reciente
 *   - concurrent: hay un conflicto real (ambos avanzaron independientemente)
 *   - equal: son idénticos
 * 
 * Referencia: EDC Página 35-36 + PAE Semana 1, Día 4
 */

// ============================================================================
// GESTIÓN DEL ID DE DISPOSITIVO
// ============================================================================

const DEVICE_ID_KEY = 'localadmin_device_id';

/**
 * Obtiene (o genera) un ID único para este dispositivo.
 * Persiste en localStorage para que sea estable entre sesiones.
 * @returns {string} - ID de dispositivo único
 */
export function getDeviceId() {
  // En el navegador
  if (typeof localStorage !== 'undefined') {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = generateDeviceId();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  }
  
  // Fallback para entornos sin localStorage (tests)
  return generateDeviceId();
}

/**
 * Genera un ID único de dispositivo.
 * @returns {string}
 */
function generateDeviceId() {
  // Usa crypto.randomUUID si está disponible
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `dev_${crypto.randomUUID().slice(0, 8)}`;
  }
  
  // Fallback: timestamp + random
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `dev_${timestamp}_${random}`;
}

// ============================================================================
// CLASE VECTOR CLOCK
// ============================================================================

export class VectorClock {
  /**
   * @param {string} deviceId - ID único de este dispositivo
   * @param {Object} clock - Estado inicial del reloj (ej: {dev_A: 1, dev_B: 2})
   */
  constructor(deviceId, clock = {}) {
    if (!deviceId) {
      throw new Error('VectorClock requiere un deviceId');
    }
    this.deviceId = deviceId;
    this.clock = { ...clock };
  }

  /**
   * Incrementa el contador para este dispositivo.
   * Se llama cada vez que el dispositivo hace un cambio.
   * @returns {VectorClock} - this (para encadenamiento)
   */
  increment() {
    this.clock[this.deviceId] = (this.clock[this.deviceId] || 0) + 1;
    return this;
  }

  /**
   * Fusiona este reloj con otro.
   * Toma el máximo de cada entrada.
   * @param {VectorClock|Object} other - Otro vector clock
   * @returns {VectorClock} - Nuevo VectorClock fusionado
   */
  merge(other) {
    const otherClock = other.clock || other;
    const merged = { ...this.clock };

    for (const [device, counter] of Object.entries(otherClock)) {
      merged[device] = Math.max(merged[device] || 0, counter);
    }

    return new VectorClock(this.deviceId, merged);
  }

  /**
   * Compara este reloj con otro.
   * 
   * @param {VectorClock|Object} other 
   * @returns {'before'|'after'|'concurrent'|'equal'} 
   *   - before: este reloj es más antiguo
   *   - after: este reloj es más nuevo
   *   - concurrent: conflicto (ambos avanzaron independientemente)
   *   - equal: son idénticos
   */
  compare(other) {
    const otherClock = other.clock || other;
    const allDevices = new Set([
      ...Object.keys(this.clock),
      ...Object.keys(otherClock)
    ]);

    let less = false;   // Este reloj tiene algún contador MENOR
    let greater = false; // Este reloj tiene algún contador MAYOR

    for (const device of allDevices) {
      const thisCount = this.clock[device] || 0;
      const otherCount = otherClock[device] || 0;

      if (thisCount < otherCount) less = true;
      if (thisCount > otherCount) greater = true;
    }

    if (less && greater) return 'concurrent';
    if (less) return 'before';
    if (greater) return 'after';
    return 'equal';
  }

  /**
   * Serializa el reloj a JSON.
   * @returns {{deviceId: string, clock: Object}}
   */
  toJSON() {
    return {
      deviceId: this.deviceId,
      clock: { ...this.clock }
    };
  }

  /**
   * Crea un VectorClock desde un JSON.
   * @param {Object} json - {deviceId, clock}
   * @param {string} [fallbackDeviceId] - ID a usar si no está en el JSON
   * @returns {VectorClock}
   */
  static fromJSON(json, fallbackDeviceId = null) {
    if (!json) {
      throw new Error('fromJSON requiere un objeto');
    }
    
    const deviceId = json.deviceId || fallbackDeviceId;
    if (!deviceId) {
      throw new Error('fromJSON requiere deviceId (en JSON o como fallback)');
    }
    
    return new VectorClock(deviceId, json.clock || {});
  }

  /**
   * Devuelve una copia clonada del reloj.
   * @returns {VectorClock}
   */
  clone() {
    return new VectorClock(this.deviceId, { ...this.clock });
  }

  /**
   * Verifica si este reloj domina a otro (es más nuevo o igual).
   * @param {VectorClock|Object} other 
   * @returns {boolean}
   */
  dominates(other) {
    const cmp = this.compare(other);
    return cmp === 'after' || cmp === 'equal';
  }

  /**
   * Verifica si los relojes son concurrentes (conflicto real).
   * @param {VectorClock|Object} other 
   * @returns {boolean}
   */
  isConcurrent(other) {
    return this.compare(other) === 'concurrent';
  }
}