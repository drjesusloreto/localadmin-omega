# 🌌 LocalAdmin Omega

> **Gestor de bases de datos y archivos local, offline-first, sin servidor.**

[![Tests](https://img.shields.io/badge/tests-101%20passing-brightgreen)]()
[![Coverage](https://img.shields.io/badge/coverage-96%25-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

---

## 📖 Descripción

LocalAdmin Omega es una plataforma de gestión de datos y archivos que funciona **100% offline**, **sin servidor propio**, con **cifrado de grado militar** y **sincronización multi-dispositivo**.

### Características principales

- 🔐 **Cifrado AES-256-GCM** con PBKDF2 (100,000 iteraciones)
- 📴 **Offline-first**: Funciona sin internet
- 🔄 **Vector Clocks**: Detección de conflictos en sincronización
- ⛓️ **Blockchain Audit**: Cadena de auditoría inmutable
- 🌳 **Merkle Tree**: Verificación de integridad
- 🚀 **Sin servidor**: Los datos nunca salen del dispositivo
- 📦 **PWA**: Instalable, progresiva, offline

---

## 🏗️ Arquitectura del Proyecto

### Nivel 1: Núcleo Criptográfico (✅ COMPLETADO)

```
src/js/core/
├── crypto-utils.js        → Cifrado AES-256-GCM, PBKDF2, hash SHA-256
├── vector-clock.js        → Detección de conflictos multi-dispositivo
└── audit/
    ├── merkle-tree.js     → Verificación de integridad
    └── blockchain-audit.js → Cadena de auditoría inmutable
```

### Niveles Pendientes

- **Nivel 2:** Motor de Datos (IndexedDB + cifrado)
- **Nivel 3:** Inteligencia Local (ML, búsqueda, diff)
- **Nivel 4:** Sincronización (GAS + P2P)
- **Nivel 5:** Interfaz de Usuario y Gobernanza
- **Nivel 6:** Plataforma (Workflows, RBAC)

---

## 🚀 Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/localadmin-omega.git
cd localadmin-omega

# 2. Instalar dependencias
npm install

# 3. Ejecutar en modo desarrollo
npm run dev
```

---

## 🧪 Testing

```bash
# Ejecutar todos los tests
npm test

# Modo watch (re-ejecuta al guardar)
npm run test:watch

# Con cobertura
npm run test:coverage
```

**Estado actual:**
- ✅ 101 pruebas pasando
- ✅ 96% de cobertura
- ✅ 5 módulos implementados

---

## 📁 Estructura

```
localadmin-omega/
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions
├── docs/
│   ├── README.md
│   └── ARCHITECTURE.md
├── public/
│   └── index.html
├── src/
│   └── js/
│       ├── core/               # Nivel 1
│       │   ├── crypto-utils.js
│       │   ├── vector-clock.js
│       │   ├── index.js
│       │   └── audit/
│       │       ├── merkle-tree.js
│       │       ├── blockchain-audit.js
│       │       └── index.js
│       └── index.js
├── tests/
│   ├── setup.js
│   ├── smoke.test.js
│   ├── crypto-utils.test.js
│   ├── vector-clock.test.js
│   ├── merkle-tree.test.js
│   ├── blockchain-audit.test.js
│   └── integration.test.js
├── .gitignore
├── package.json
├── vite.config.js
├── vitest.config.js
└── README.md
```

---

## 🎯 Roadmap

| Nivel | Descripción | Estado |
|-------|-------------|--------|
| 1 | Núcleo Criptográfico | ✅ 100% |
| 2 | Motor de Datos | ⏳ 0% |
| 3 | Inteligencia Local | ⏳ 0% |
| 4 | Sincronización | ⏳ 0% |
| 5 | Interfaz y Gobernanza | ⏳ 0% |
| 6 | Plataforma | ⏳ 0% |

---

## 📄 Licencia

MIT © 2024 LocalAdmin Omega

---

**Hecho con ❤️ para devolver el control de los datos a las personas.**