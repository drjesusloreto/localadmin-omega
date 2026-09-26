// tests/setup.js

// 1. Polyfill de crypto para Node.js (para pruebas)
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

// 2. Polyfill de Blob si no existe
if (typeof Blob === 'undefined') {
  const { Blob } = await import('node:buffer');
  globalThis.Blob = Blob;
}

// 3. Mock de navigator.storage (si no existe en el entorno)
if (!globalThis.navigator) {
  globalThis.navigator = {};
}
if (!globalThis.navigator.storage) {
  globalThis.navigator.storage = {
    estimate: async () => ({
      usage: 1024 * 1024,        // 1 MB
      quota: 100 * 1024 * 1024   // 100 MB
    })
  };
}

// 4. happy-dom YA define localStorage, solo lo limpiamos entre tests
// (no lo sobrescribimos, ¡eso causaba el error!)
import { beforeEach } from 'vitest';
beforeEach(() => {
  if (globalThis.localStorage) {
    globalThis.localStorage.clear();
  }
});

console.log('✅ Test setup completado');