// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: '.',
    publicDir: 'public',

    server: {
        port: 5173,
        open: true,
        headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin'
        }
    },

    build: {
        target: 'es2022',
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
        minify: 'oxc',
        cssMinify: true,
        chunkSizeWarningLimit: 500,
        reportCompressedSize: true,

        rollupOptions: {
            output: {
                // ⬇️ EN VITE 8 / ROLDDOWN: manualChunks debe ser FUNCIÓN
                manualChunks(id) {
                    // Núcleo criptográfico (siempre necesario)
                    if (id.includes('core/crypto-utils') || id.includes('core/vector-clock')) {
                        return 'core-crypto';
                    }
                    // Auditoría
                    if (id.includes('core/audit/merkle-tree') || id.includes('core/audit/blockchain-audit')) {
                        return 'core-audit';
                    }
                    // Motor de datos (crítico)
                    if (id.includes('db/db.js') || id.includes('db/semantic-db.js')) {
                        return 'db-core';
                    }
                    // Búsqueda semántica (lazy)
                    if (id.includes('vectordb/hnsw-wasm')) {
                        return 'vectordb';
                    }
                    // Inteligencia (lazy)
                    if (id.includes('intelligence/classifier') ||
                        id.includes('intelligence/anomaly-detector') ||
                        id.includes('intelligence/diff-engine') ||
                        id.includes('intelligence/markdown-parser') ||
                        id.includes('intelligence/tag-suggester')) {
                        return 'intelligence';
                    }
                    // ML (lazy)
                    if (id.includes('ml/model-manager')) {
                        return 'ml';
                    }
                    // Sync (lazy)
                    if (id.includes('sync/gas-client') ||
                        id.includes('sync/conflict-resolver') ||
                        id.includes('sync/sync-engine')) {
                        return 'sync';
                    }
                    // P2P (lazy)
                    if (id.includes('p2p/webrtc-manager') || id.includes('p2p/signal-server')) {
                        return 'p2p';
                    }
                    // Tenant + Workflows (lazy)
                    if (id.includes('tenant/rbac') ||
                        id.includes('tenant/policy-engine') ||
                        id.includes('workflows/workflow-engine') ||
                        id.includes('workflows/triggers')) {
                        return 'platform';
                    }
                    // Compresión
                    if (id.includes('compression.js')) {
                        return 'compression';
                    }
                    // UI
                    if (id.includes('ui/main')) {
                        return 'ui';
                    }
                    // Devolver undefined para dejar que Vite decida
                    return undefined;
                },
                entryFileNames: 'assets/[name]-[hash].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]'
            }
        },

        commonjsOptions: {
            include: [/node_modules/],
            transformMixedEsModules: true
        }
    },

    optimizeDeps: {
        include: [],
        exclude: ['hnsw-wasm']
    },

    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.1.0'),
        __BUILD_TIME__: JSON.stringify(new Date().toISOString())
    }
});