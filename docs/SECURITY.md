# Política de Seguridad — LocalAdmin Omega

## Versiones Soportadas

| Versión | Soportada | Notas |
|---------|-----------|-------|
| 0.1.x   | ✅ Sí     | Versión actual |
| < 0.1   | ❌ No     | Versiones de desarrollo |

## Reportar una Vulnerabilidad

**NO abras un issue público para reportar vulnerabilidades de seguridad.**

En su lugar, envía un correo a: **security@localadmin.io**

### Información a incluir

1. **Descripción** de la vulnerabilidad.
2. **Pasos para reproducirla** (con detalles).
3. **Impacto potencial** (confidencialidad, integridad, disponibilidad).
4. **Versión afectada** de LocalAdmin Omega.
5. **Sugerencia de fix** (si la tienes).
6. **Tu información de contacto** (opcional, para crédito).

### Tiempo de respuesta

- **Acuse de recibo:** 48 horas.
- **Evaluación inicial:** 5 días hábiles.
- **Fix y parche:** 30 días hábiles (según complejidad).
- **Divulgación pública:** 90 días después del fix (coordinado).

### Reconocimiento

Agradecemos a los investigadores de seguridad. Con tu permiso, te acreditaremos en:
- `SECURITY.md` (sección de agradecimientos).
- Release notes del parche.

## Modelo de Amenazas

### Activos protegidos

1. **Datos del usuario** — Cifrados con AES-256-GCM.
2. **Metadatos** — Vector clocks, change log, embeddings.
3. **Archivos adjuntos** — Cifrados con AES-256-GCM.
4. **Claves maestras** — Derivadas con PBKDF2 (100K iteraciones).

### Amenazas consideradas

| Amenaza | Mitigación |
|---------|-----------|
| **Acceso físico al dispositivo** | Cifrado en reposo (AES-256-GCM) |
| **XSS** | CSP restrictiva + escape de HTML |
| **Inyección de código** | Sin `eval`, sin `Function()` dinámico |
| **Man-in-the-middle** | HTTPS obligatorio, WebRTC DTLS |
| **Modificación de datos** | Blockchain audit + Merkle tree |
| **Repudio** | Firma de eventos con device ID |
| **Fuga de datos por sync** | Cifrado extremo a extremo |

### Amenazas NO mitigadas (fuera de scope)

- **Compromiso del dispositivo** (malware, keylogger).
- **Ataques de canal lateral** (timing, power).
- **Coerción física** (rubber-hose).
- **Ataques cuánticos** (futuro, requiere migración a post-quantum).

## Prácticas de Seguridad Implementadas

### Criptografía

- ✅ **AES-256-GCM** para cifrado simétrico.
- ✅ **PBKDF2** con 100,000 iteraciones para derivación de claves.
- ✅ **SHA-256** para hashing.
- ✅ **IV único** por operación de cifrado.
- ✅ **Salt único** por usuario.
- ✅ **Web Crypto API** (no implementaciones caseras).

### Gestión de secretos

- ✅ **Sin secretos hardcodeados** en el código.
- ✅ **Sin API keys** en el repositorio.
- ✅ **Variables de entorno** para configuración sensible.

### Validación de entrada

- ✅ **Escape de HTML** en el parser de Markdown.
- ✅ **Validación de tipos** en APIs críticas.
- ✅ **Sanitización** de datos antes de persistir.

### Content Security Policy
