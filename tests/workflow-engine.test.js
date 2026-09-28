// tests/workflow-engine.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowEngine } from '../src/js/workflows/workflow-engine.js';
import { TriggerTypes, isValidTrigger, listTriggers } from '../src/js/workflows/triggers.js';

describe('WorkflowEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new WorkflowEngine();
    });

    // ============================================================
    // REGISTRO DE ACCIONES
    // ============================================================
    describe('registerAction', () => {
        it('debe registrar una acción', () => {
            engine.registerAction('test', async () => 'ok');
            expect(engine.hasAction('test')).toBe(true);
        });

        it('debe lanzar error si no es función', () => {
            expect(() => engine.registerAction('bad', 'not-a-function'))
                .toThrow('debe ser una función');
        });

        it('debe permitir encadenamiento', () => {
            const result = engine.registerAction('a', async () => {});
            expect(result).toBe(engine);
        });

        it('debe listar acciones registradas', () => {
            engine.registerAction('a', async () => {});
            engine.registerAction('b', async () => {});
            expect(engine.listActions()).toEqual(['a', 'b']);
        });
    });

    // ============================================================
    // DEFINICIÓN DE WORKFLOWS
    // ============================================================
    describe('defineWorkflow', () => {
        beforeEach(() => {
            engine.registerAction('action1', async () => 'r1');
            engine.registerAction('action2', async () => 'r2');
        });

        it('debe definir un workflow válido', () => {
            engine.defineWorkflow({
                name: 'test-workflow',
                trigger: TriggerTypes.MANUAL,
                steps: [{ action: 'action1' }]
            });
            expect(engine.listWorkflows().length).toBe(1);
        });

        it('debe lanzar error sin nombre', () => {
            expect(() => engine.defineWorkflow({
                trigger: TriggerTypes.MANUAL,
                steps: [{ action: 'action1' }]
            })).toThrow('debe tener un nombre');
        });

        it('debe lanzar error con trigger desconocido', () => {
            expect(() => engine.defineWorkflow({
                name: 'test',
                trigger: 'unknown-trigger',
                steps: [{ action: 'action1' }]
            })).toThrow('Trigger desconocido');
        });

        it('debe lanzar error sin steps', () => {
            expect(() => engine.defineWorkflow({
                name: 'test',
                trigger: TriggerTypes.MANUAL,
                steps: []
            })).toThrow('al menos un step');
        });

        it('debe lanzar error si acción no está registrada', () => {
            expect(() => engine.defineWorkflow({
                name: 'test',
                trigger: TriggerTypes.MANUAL,
                steps: [{ action: 'unknown-action' }]
            })).toThrow('Acción no registrada');
        });
    });

    // ============================================================
    // EJECUCIÓN DE WORKFLOWS
    // ============================================================
    describe('execute', () => {
        beforeEach(() => {
            engine.registerAction('step1', vi.fn(async () => 'result1'));
            engine.registerAction('step2', vi.fn(async () => 'result2'));
            engine.registerAction('failing', vi.fn(async () => {
                throw new Error('Fallo simulado');
            }));
        });

        it('debe ejecutar un workflow completo', async () => {
            engine.defineWorkflow({
                name: 'simple',
                trigger: TriggerTypes.MANUAL,
                steps: [
                    { action: 'step1' },
                    { action: 'step2' }
                ]
            });

            const report = await engine.execute('simple');
            expect(report.success).toBe(true);
            expect(report.steps.length).toBe(2);
            expect(report.steps[0].success).toBe(true);
            expect(report.steps[1].success).toBe(true);
        });

        it('debe lanzar error si workflow no existe', async () => {
            await expect(engine.execute('unknown'))
                .rejects.toThrow('Workflow no encontrado');
        });

        it('debe detener en el primer fallo por defecto', async () => {
            engine.defineWorkflow({
                name: 'fail-fast',
                trigger: TriggerTypes.MANUAL,
                steps: [
                    { action: 'step1' },
                    { action: 'failing' },
                    { action: 'step2' }
                ]
            });

            const report = await engine.execute('fail-fast');
            expect(report.success).toBe(false);
            expect(report.steps.length).toBe(2); // step1 + failing
            expect(report.steps[1].success).toBe(false);
        });

        it('debe continuar si continueOnError: true', async () => {
            engine.defineWorkflow({
                name: 'continue',
                trigger: TriggerTypes.MANUAL,
                steps: [
                    { action: 'failing', continueOnError: true },
                    { action: 'step2' }
                ]
            });

            const report = await engine.execute('continue');
            expect(report.steps.length).toBe(2);
            expect(report.steps[0].success).toBe(false);
            expect(report.steps[1].success).toBe(true);
        });

        it('debe compartir contexto entre steps', async () => {
            const contextSpy = vi.fn();
            engine.registerAction('readContext', async (ctx) => {
                contextSpy(ctx.initialValue);
                return ctx.initialValue * 2;
            });

            engine.defineWorkflow({
                name: 'ctx',
                trigger: TriggerTypes.MANUAL,
                steps: [{ action: 'readContext' }]
            });

            await engine.execute('ctx', { initialValue: 21 });
            expect(contextSpy).toHaveBeenCalledWith(21);
        });

        it('debe registrar el reporte en el log', async () => {
            engine.defineWorkflow({
                name: 'logged',
                trigger: TriggerTypes.MANUAL,
                steps: [{ action: 'step1' }]
            });

            await engine.execute('logged');
            const log = engine.getExecutionLog();
            expect(log.length).toBe(1);
            expect(log[0].workflow).toBe('logged');
        });

        it('debe retornar skipped si workflow está deshabilitado', async () => {
            engine.defineWorkflow({
                name: 'disabled',
                trigger: TriggerTypes.MANUAL,
                steps: [{ action: 'step1' }],
                enabled: false
            });

            const report = await engine.execute('disabled');
            expect(report.skipped).toBe(true);
            expect(report.success).toBe(false);
        });
    });

    // ============================================================
    // DISPARO POR TRIGGER
    // ============================================================
    describe('triggerWorkflows', () => {
        beforeEach(() => {
            engine.registerAction('notify', vi.fn(async () => 'notified'));
        });

        it('debe disparar todos los workflows del trigger', async () => {
            engine.defineWorkflow({
                name: 'wf1',
                trigger: TriggerTypes.RECORD_CREATED,
                steps: [{ action: 'notify' }]
            });
            engine.defineWorkflow({
                name: 'wf2',
                trigger: TriggerTypes.RECORD_CREATED,
                steps: [{ action: 'notify' }]
            });

            const reports = await engine.triggerWorkflows(TriggerTypes.RECORD_CREATED);
            expect(reports.length).toBe(2);
            expect(reports.every(r => r.success)).toBe(true);
        });

        it('debe retornar array vacío si no hay workflows', async () => {
            const reports = await engine.triggerWorkflows(TriggerTypes.SCHEDULED);
            expect(reports).toEqual([]);
        });

        it('debe ignorar workflows deshabilitados', async () => {
            engine.defineWorkflow({
                name: 'enabled-wf',
                trigger: TriggerTypes.MANUAL,
                steps: [{ action: 'notify' }]
            });
            engine.defineWorkflow({
                name: 'disabled-wf',
                trigger: TriggerTypes.MANUAL,
                steps: [{ action: 'notify' }],
                enabled: false
            });

            const reports = await engine.triggerWorkflows(TriggerTypes.MANUAL);
            expect(reports.length).toBe(1);
            expect(reports[0].workflow).toBe('enabled-wf');
        });
    });

    // ============================================================
    // LISTAR Y LIMPIAR
    // ============================================================
    describe('utilidades', () => {
        it('debe listar workflows', () => {
            engine.registerAction('a', async () => {});
            engine.defineWorkflow({
                name: 'wf1',
                trigger: TriggerTypes.MANUAL,
                steps: [{ action: 'a' }]
            });
            expect(engine.listWorkflows().length).toBe(1);
        });

        it('debe filtrar workflows por trigger', () => {
            engine.registerAction('a', async () => {});
            engine.defineWorkflow({ name: 'wf1', trigger: TriggerTypes.MANUAL, steps: [{ action: 'a' }] });
            engine.defineWorkflow({ name: 'wf2', trigger: TriggerTypes.SCHEDULED, steps: [{ action: 'a' }] });

            const manualWorkflows = engine.getWorkflowsByTrigger(TriggerTypes.MANUAL);
            expect(manualWorkflows.length).toBe(1);
            expect(manualWorkflows[0].name).toBe('wf1');
        });

        it('debe limpiar todo', () => {
            engine.registerAction('a', async () => {});
            engine.defineWorkflow({ name: 'wf', trigger: TriggerTypes.MANUAL, steps: [{ action: 'a' }] });
            engine.clear();
            expect(engine.listActions()).toEqual([]);
            expect(engine.listWorkflows()).toEqual([]);
        });

        it('debe limitar el log a maxLogSize', async () => {
            engine.registerAction('a', async () => {});
            engine.defineWorkflow({ name: 'wf', trigger: TriggerTypes.MANUAL, steps: [{ action: 'a' }] });
            engine.maxLogSize = 5;

            for (let i = 0; i < 10; i++) {
                await engine.execute('wf');
            }
            expect(engine.executionLog.length).toBe(5);
        });
    });
});

// ============================================================
// TRIGGERS
// ============================================================
describe('TriggerTypes', () => {
    it('debe tener los triggers esperados', () => {
        expect(TriggerTypes.MANUAL).toBe('manual');
        expect(TriggerTypes.RECORD_CREATED).toBe('record-created');
        expect(TriggerTypes.RECORD_UPDATED).toBe('record-updated');
        expect(TriggerTypes.RECORD_DELETED).toBe('record-deleted');
        expect(TriggerTypes.SCHEDULED).toBe('scheduled');
        expect(TriggerTypes.SYNC_COMPLETED).toBe('sync-completed');
    });

    it('isValidTrigger debe validar correctamente', () => {
        expect(isValidTrigger('manual')).toBe(true);
        expect(isValidTrigger('unknown')).toBe(false);
    });

    it('listTriggers debe retornar todos los triggers', () => {
        const triggers = listTriggers();
        expect(triggers.length).toBeGreaterThanOrEqual(6);
    });
});