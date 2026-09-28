# Guía de Despliegue — LocalAdmin Omega

## Plataforma Recomendada: Cloudflare Pages

LocalAdmin Omega es una PWA (Progressive Web App) que funciona 100% offline.
El despliegue se realiza en **Cloudflare Pages** por su velocidad, CDN global
y soporte nativo para Service Workers.

### Requisitos previos

- Node.js 20+
- Cuenta en Cloudflare
- Dominio `localadmin.io` (o el que prefieras)

### Paso 1: Preparar el build

```bash
npm run build