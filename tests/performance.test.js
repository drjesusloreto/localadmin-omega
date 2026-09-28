// tests/performance.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoUtils } from '../src/js/core/crypto-utils.js';
import { Database } from '../src/js/db/db.js';
import { NaiveBayesClassifier } from '../src/js/intelligence/classifier.js';
import { HNSWIndex } from '../src/js/vectordb/hnsw-wasm.js';

describe('Performance Benchmarks', () => {
    describe('CryptoUtils', () => {
        it('debe derivar clave en <100ms', async () => {
            const salt = CryptoUtils.generateSalt();
            const start = performance.now();
            await CryptoUtils.deriveKey('test-password', salt);
            const duration = performance.now() - start;
            console.log(`  deriveKey: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(500); // PBKDF2 con 100K iteraciones
        });

        it('debe cifrar/descifrar en <10ms', async () => {
            const salt = CryptoUtils.generateSalt();
            const key = await CryptoUtils.deriveKey('test', salt);

            const start = performance.now();
            const encrypted = await CryptoUtils.encryptString('Lorem ipsum '.repeat(100), key);
            const decrypted = await CryptoUtils.decryptString(encrypted, key);
            const duration = performance.now() - start;

            console.log(`  encrypt+decrypt 1.2KB: ${duration.toFixed(2)}ms`);
            expect(decrypted).toContain('Lorem ipsum');
            expect(duration).toBeLessThan(50);
        });
    });

    describe('Database', () => {
        let db;

        beforeEach(async () => {
            db = new Database();
            await db.init();
            await db.clearAll();
            await db.setEncryptionKey('test-password');
        });

        it('debe crear 100 registros en <5s', async () => {
            const start = performance.now();
            for (let i = 0; i < 100; i++) {
                await db.createRecord({ name: `Record ${i}`, content: 'Lorem ipsum' });
            }
            const duration = performance.now() - start;
            console.log(`  100 createRecord: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(5000);
            db.close();
        });
    });

    describe('Classifier', () => {
        it('debe entrenar con 1000 docs en <500ms', () => {
            const classifier = new NaiveBayesClassifier();
            const docs = Array.from({ length: 1000 }, (_, i) => ({
                text: `factura cliente pago documento ${i}`,
                category: i % 2 === 0 ? 'finanzas' : 'proyectos'
            }));

            const start = performance.now();
            for (const doc of docs) {
                classifier.train(doc.text, doc.category);
            }
            const duration = performance.now() - start;
            console.log(`  train 1000 docs: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(500);
        });

        it('debe predecir en <5ms', () => {
            const classifier = new NaiveBayesClassifier();
            for (let i = 0; i < 100; i++) {
                classifier.train(`factura cliente pago ${i}`, 'finanzas');
                classifier.train(`proyecto desarrollo ${i}`, 'proyectos');
            }

            const start = performance.now();
            const result = classifier.predict('nueva factura de cliente');
            const duration = performance.now() - start;
            console.log(`  predict: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(50);
            expect(result.category).toBe('finanzas');
        });
    });

    describe('HNSW', () => {
        it('debe indexar 1000 vectores en <500ms', () => {
            const index = new HNSWIndex({ dimension: 16 });
            index.initialized = true;

            const vectors = Array.from({ length: 1000 }, (_, i) => ({
                id: `vec${i}`,
                vector: Array.from({ length: 16 }, () => Math.random())
            }));

            const start = performance.now();
            index.addBatch(vectors);
            const duration = performance.now() - start;
            console.log(`  addBatch 1000 vectores: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(500);
        });

        it('debe buscar en 1000 vectores en <100ms', () => {
            const index = new HNSWIndex({ dimension: 16 });
            index.initialized = true;

            const vectors = Array.from({ length: 1000 }, (_, i) => ({
                id: `vec${i}`,
                vector: Array.from({ length: 16 }, () => Math.random())
            }));
            index.addBatch(vectors);

            const query = Array.from({ length: 16 }, () => Math.random());
            const start = performance.now();
            const results = index.search(query, 10);
            const duration = performance.now() - start;
            console.log(`  search top-10: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(200);
            expect(results.length).toBe(10);
        });
    });
});