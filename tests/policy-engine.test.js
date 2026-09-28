// tests/policy-engine.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { RBAC } from '../src/js/tenant/rbac.js';
import { PolicyEngine } from '../src/js/tenant/policy-engine.js';

describe('PolicyEngine', () => {
    let rbac;
    let engine;

    beforeEach(() => {
        rbac = new RBAC();
        engine = new PolicyEngine(rbac);
    });

    // ============================================================
    // RBAC + POLICIES
    // ============================================================
    describe('integración con RBAC', () => {
        it('debe denegar si RBAC no autoriza', () => {
            rbac.assignRole('viewer1', 'Viewer');
            const result = engine.evaluate({
                userId: 'viewer1',
                resource: 'records',
                action: 'write'
            });

            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('RBAC denegó');
        });

        it('debe permitir si RBAC autoriza y no hay políticas', () => {
            rbac.assignRole('editor1', 'Editor');
            const result = engine.evaluate({
                userId: 'editor1',
                resource: 'records',
                action: 'write'
            });

            expect(result.allowed).toBe(true);
        });
    });

    // ============================================================
    // AÑADIR POLÍTICAS
    // ============================================================
    describe('addPolicy', () => {
        it('debe añadir una política', () => {
            engine.addPolicy({
                name: 'Block huge records',
                resource: 'records',
                action: 'write',
                effect: 'deny',
                condition: (ctx) => ctx.metadata?.size > 1000000
            });

            expect(engine.listPolicies().length).toBe(1);
        });

        it('debe soportar encadenamiento', () => {
            const result = engine.addPolicy({
                name: 'Test',
                resource: 'records',
                action: 'write',
                effect: 'deny'
            });
            expect(result).toBe(engine);
        });

        it('debe ordenar políticas por prioridad', () => {
            engine.addPolicy({ name: 'Low', resource: 'r', action: 'a', priority: 1 });
            engine.addPolicy({ name: 'High', resource: 'r', action: 'a', priority: 10 });
            engine.addPolicy({ name: 'Mid', resource: 'r', action: 'a', priority: 5 });

            const policies = engine.listPolicies();
            expect(policies[0].name).toBe('High');
            expect(policies[2].name).toBe('Low');
        });
    });

    // ============================================================
    // EVALUAR POLÍTICAS
    // ============================================================
    describe('evaluate', () => {
        beforeEach(() => {
            rbac.assignRole('editor1', 'Editor');
        });

        it('debe denegar si una política aplica con deny', () => {
            engine.addPolicy({
                name: 'Block huge',
                resource: 'records',
                action: 'write',
                effect: 'deny',
                condition: (ctx) => ctx.metadata?.size > 1000
            });

            const result = engine.evaluate({
                userId: 'editor1',
                resource: 'records',
                action: 'write',
                metadata: { size: 5000 }
            });

            expect(result.allowed).toBe(false);
            expect(result.matchedPolicy).toBe('Block huge');
        });

        it('debe permitir si la política aplica con allow', () => {
            engine.addPolicy({
                name: 'Allow small',
                resource: 'records',
                action: 'write',
                effect: 'allow',
                condition: (ctx) => ctx.metadata?.size < 100
            });

            const result = engine.evaluate({
                userId: 'editor1',
                resource: 'records',
                action: 'write',
                metadata: { size: 50 }
            });

            expect(result.allowed).toBe(true);
        });

        it('debe ignorar políticas de otros recursos', () => {
            engine.addPolicy({
                name: 'Block files',
                resource: 'files',
                action: 'write',
                effect: 'deny',
                condition: () => true
            });

            const result = engine.evaluate({
                userId: 'editor1',
                resource: 'records',
                action: 'write'
            });

            expect(result.allowed).toBe(true);
        });

        it('debe manejar errores en condiciones', () => {
            engine.addPolicy({
                name: 'Bad condition',
                resource: 'records',
                action: 'write',
                effect: 'deny',
                condition: () => { throw new Error('Bad'); }
            });

            const result = engine.evaluate({
                userId: 'editor1',
                resource: 'records',
                action: 'write'
            });

            expect(result).toBeDefined();
            expect(result.allowed).toBe(true); // Ignora política con error
        });

        it('debe respetar prioridad en políticas concurrentes', () => {
            engine.addPolicy({
                name: 'Low priority allow',
                resource: 'records',
                action: 'write',
                effect: 'allow',
                priority: 1,
                condition: () => true
            });
            engine.addPolicy({
                name: 'High priority deny',
                resource: 'records',
                action: 'write',
                effect: 'deny',
                priority: 10,
                condition: () => true
            });

            const result = engine.evaluate({
                userId: 'editor1',
                resource: 'records',
                action: 'write'
            });

            expect(result.allowed).toBe(false);
            expect(result.matchedPolicy).toBe('High priority deny');
        });
    });

    // ============================================================
    // CAN (atajo)
    // ============================================================
    describe('can', () => {
        it('debe retornar true si el contexto es permitido', () => {
            rbac.assignRole('editor1', 'Editor');
            expect(engine.can({
                userId: 'editor1',
                resource: 'records',
                action: 'read'
            })).toBe(true);
        });

        it('debe retornar false si hay denegación', () => {
            rbac.assignRole('viewer1', 'Viewer');
            expect(engine.can({
                userId: 'viewer1',
                resource: 'records',
                action: 'write'
            })).toBe(false);
        });
    });

    // ============================================================
    // REMOVE / CLEAR
    // ============================================================
    describe('removePolicy y clear', () => {
        it('debe eliminar una política por nombre', () => {
            engine.addPolicy({ name: 'Test', resource: 'r', action: 'a' });
            expect(engine.removePolicy('Test')).toBe(true);
            expect(engine.listPolicies().length).toBe(0);
        });

        it('debe retornar false al eliminar política inexistente', () => {
            expect(engine.removePolicy('Unknown')).toBe(false);
        });

        it('debe limpiar todas las políticas', () => {
            engine.addPolicy({ name: 'A', resource: 'r', action: 'a' });
            engine.addPolicy({ name: 'B', resource: 'r', action: 'a' });
            engine.clear();
            expect(engine.listPolicies().length).toBe(0);
        });
    });
});