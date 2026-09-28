# 📅 Semana 2: Nivel 2 — Motor de Datos Local Blindado

**Estado:** ⏳ PENDIENTE
**Inicio previsto:** [Fecha]
**Duración:** 7 días (PAE)

---

## 🎯 Objetivo Semanal

Construir la base de datos local (IndexedDB) que almacena todo de forma cifrada y los índices de búsqueda vectorial, con cifrado automático y fallback a búsqueda por fuerza bruta si WASM falla.

---

## 📅 Plan Diario

### Día 6: DB Core (Parte 1)

**Tareas:**
- Implementar `Database.init()` (inicialización de IndexedDB)
- Implementar `Database.createRecord(data)` con cifrado automático
- Escribir `tests/db.test.js` usando `fake-indexeddb`
- Probar creación y lectura de registros cifrados

**Entregables:**
- `src/js/db/db.js`
- `tests/db.test.js`

**Validación:**
- Pruebas unitarias pasan al 100%
- Registro creado y recuperado correctamente

### Día 7: DB Core (Parte 2)

**Tareas:**
- Implementar `getAllRecords()`, `updateRecord()`, `deleteRecord()`
- Integración de cifrado/descifrado automático
- Prueba end-to-end: crear → cifrar → leer → descifrar

**Entregables:**
- `db.js` con CRUD completo
- Tests de CRUD

**Validación:**
- CRUD completamente funcional
- Cifrado transparente al usuario

### Día 8: HNSW Index con WASM

**Tareas:**
- Implementar `HNSWIndex` con lógica de inserción
- Implementar `HNSWIndex.search()` con búsqueda aproximada
- Escribir `tests/hnsw-wasm.test.js`

**Entregables:**
- `src/js/vectordb/hnsw-wasm.js`

**Validación:**
- Búsqueda devuelve el vecino más cercano correcto

### Día 9: Fallback de HNSW

**Tareas:**
- Implementar búsqueda por fuerza bruta (Cosine Similarity) en JS puro
- Función `_bruteForceSearch()` probada
- Integración automática con HNSW

**Entregables:**
- Fallback funcional en `hnsw-wasm.js`

**Validación:**
- Si WASM falla, el fallback se usa automáticamente

### Día 10: Compresión

**Tareas:**
- Implementar `Compression.compress()` con CompressionStream
- Implementar `Compression.decompress()`
- Escribir `tests/compression.test.js`

**Entregables:**
- `src/js/compression.js`

**Validación:**
- Compresión/descompresión exitosa
- Ratio de compresión verificado

### Día 11: Refactorización Nivel 2

**Tareas:**
- Revisar todo el Nivel 2
- Refactorizar código duplicado
- Documentar con JSDoc
- Asegurar cobertura >90%

**Entregables:**
- Nivel 2 pulido y documentado

**Validación:**
- Todas las pruebas pasan
- Cobertura >90%

### Día 12: Testing y Cierre Semana 2

**Tareas:**
- Ejecutar todas las pruebas
- Verificar integración con Nivel 1
- Actualizar README y documentación
- Commit final

**Entregables:**
- Semana 2 cerrada
- Documentación actualizada

**Validación:**
- Nivel 2 completado al 100%

---

## 🛠️ Tecnologías a Usar

- **IndexedDB:** Base de datos local del navegador
- **fake-indexeddb:** Mock de IndexedDB para tests en Node.js
- **CryptoUtils:** Cifrado AES-256-GCM (Nivel 1)
- **CompressionStream:** Compresión nativa del navegador
- **HNSW:** Hierarchical Navigable Small World (índice vectorial)

---

## 📊 Criterios de Éxito

- [ ] `db.js` con CRUD completamente funcional
- [ ] Cifrado automático en escritura/lectura
- [ ] Búsqueda vectorial funcional (HNSW o fallback)
- [ ] Compresión funcional
- [ ] Cobertura >90% en todos los módulos
- [ ] Integración con Nivel 1 verificada
- [ ] Documentación completa