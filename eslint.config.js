// eslint.config.js
import js from '@eslint/js';
import security from 'eslint-plugin-security';
import prettierConfig from 'eslint-config-prettier';

export default [
    // ⬇️ IGNORES GLOBALES (debe ir primero y solo)
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'coverage/**',
            'test-results/**',
            'playwright-report/**',
            '**/*.min.js',
            '**/*.min.css',
            'public/sw.js' // ⬅️ Excluimos el Service Worker (usa globals de SW)
        ]
    },

    // ⬇️ Reglas base recomendadas
    js.configs.recommended,

    // ⬇️ Configuración global (aplica a todos los archivos JS)
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                // Navegador
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                localStorage: 'readonly',
                indexedDB: 'readonly',
                caches: 'readonly',
                fetch: 'readonly',
                console: 'readonly',
                performance: 'readonly',
                crypto: 'readonly',
                Blob: 'readonly',
                File: 'readonly',
                FileReader: 'readonly',
                FormData: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                RTCPeerConnection: 'readonly',
                RTCDataChannel: 'readonly',
                RTCSessionDescription: 'readonly',
                RTCIceCandidate: 'readonly',
                CompressionStream: 'readonly',
                DecompressionStream: 'readonly',
                Response: 'readonly',
                Request: 'readonly',
                Headers: 'readonly',
                WebAssembly: 'readonly',
                globalThis: 'readonly',
                self: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                btoa: 'readonly',
                atob: 'readonly',
                AbortController: 'readonly',
                MutationObserver: 'readonly',
                Event: 'readonly',
                EventTarget: 'readonly',
                MessageEvent: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                google: 'readonly',
                // Node.js
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                global: 'readonly'
            }
        },
        plugins: {
            security
        },
        rules: {
            // ============================================================
            // Seguridad
            // ============================================================
            'security/detect-object-injection': 'off', // ⬅️ OFF: genera 100+ falsos positivos
            'security/detect-non-literal-regexp': 'warn',
            'security/detect-unsafe-regex': 'error',
            'security/detect-buffer-noassert': 'error',
            'security/detect-eval-with-expression': 'error',
            'security/detect-no-csrf-before-method-override': 'error',
            'security/detect-possible-timing-attacks': 'warn',

            // ============================================================
            // Calidad
            // ============================================================
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            'no-console': 'off',
            'no-debugger': 'error',
            'no-alert': 'warn',
            'no-var': 'error',
            'prefer-const': 'error',
            'prefer-arrow-callback': 'warn',
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-script-url': 'error',

            // ============================================================
            // Estilo
            // ============================================================
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            curly: ['error', 'all'],
            'no-throw-literal': 'error',
            'prefer-promise-reject-errors': 'error',
            'require-await': 'off', // ⬅️ OFF: métodos async sin await son válidos en clases

            // ============================================================
            // Async
            // ============================================================
            'no-async-promise-executor': 'error',
            'no-await-in-loop': 'off',
            'no-return-await': 'off', // ⬅️ OFF: es una decisión de estilo

            // ============================================================
            // Estilo avanzado
            // ============================================================
            'no-case-declarations': 'error',
            'no-useless-assignment': 'warn'
        }
    },

    // ⬇️ Configuración específica para tests (más permisiva)
    {
        files: ['tests/**/*.js'],
        rules: {
            'security/detect-object-injection': 'off',
            'no-console': 'off',
            'require-await': 'off',
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ]
        }
    },

    // ⬇️ Configuración para scripts
    {
        files: ['scripts/**/*.js'],
        rules: {
            'no-console': 'off'
        }
    },

    // ⬇️ Prettier (debe ir al final)
    prettierConfig
];
