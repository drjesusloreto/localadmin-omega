# 🏗️ Arquitectura de LocalAdmin Omega

## Visión General

LocalAdmin Omega sigue una arquitectura de **6 niveles**, donde cada nivel se construye sobre el anterior, garantizando **testeabilidad 100%** y **aislamiento de dependencias**.
## Nivel 4: Orquestación de Red y Sincronización (✅ COMPLETADO)

### Módulos

| Módulo | Responsabilidad | Cobertura |
|--------|----------------|-----------|
| `sync/gas-client.js` | Cliente GAS con reintentos y backoff | 88.75% |
| `sync/conflict-resolver.js` | Resolución de conflictos con vector clocks | 92.85% |
| `sync/sync-engine.js` | Motor de sincronización bidireccional | 93.5% |

### Características

- **Reintentos con backoff exponencial:** Solo para errores transitorios (network, 5xx).
- **Errores tipados:** `ConfigError` (permanente) y `NetworkError` (transitorio).
- **Change Log Incremental:** Solo se suben los cambios pendientes.
- **Vector Clocks:** Detección de conflictos `before/after/concurrent/equal`.
- **Field Merge:** Resolución automática de conflictos concurrentes.
- **Fallback LWW:** Last-write-wins cuando no hay vector clocks.
- **Persistencia del `lastChangeId`:** Sincronización incremental.

### Flujo de Sincronización
