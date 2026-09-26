// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Entorno que simula el DOM del navegador
    environment: 'happy-dom',
    
    // Permitir funciones globales (describe, it, expect sin importar)
    globals: true,
    
    // Archivos de setup que se ejecutan antes de cada suite de pruebas
    setupFiles: ['./tests/setup.js'],
    
    // Configuración de cobertura
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/js/**/*.js'],
      exclude: ['src/js/ui/**', 'tests/**']
    },
    
    // Archivos de prueba a incluir
    include: ['tests/**/*.test.js']
  }
});