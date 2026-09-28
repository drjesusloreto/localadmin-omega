// src/js/workflows/workflow-engine.js

import { TriggerTypes, isValidTrigger } from './triggers.js';

/**
 * Motor de workflows secuenciales.
 * 
 * Permite definir workflows como una secuencia de acciones que se
 * ejecutan cuando un trigger se dispara.
 * 
 * Características:
 * - Registro de acciones reutilizables.
 * - Definición de workflows con trigger + steps.
 * - Ejecución secuencial con contexto compartido.
 * - Manejo de errores por step (no detiene el workflow completo).
 * - Soporte para acciones asíncronas.
 * 
 * Referencia: EDC Página 250-265 + PAE Semana 5, Día 21
 */
export class WorkflowEngine {
    constructor() {
        /** @type {Map<string, Function>} - name -> fn */
        this.actions = new Map();
        /** @type {Map<string, Object>} - name -> workflow */
        this.workflows = new Map();
        /** @type {Array<Object>} - historial de ejecuciones */
        this.executionLog = [];
        /** @type {number} - máximo de ejecuciones en el log */
        this.maxLogSize = 100;
    }

    /**
     * Registra una acción reutilizable.
     * 
     * @param {string} name - Nombre único de la acción.
     * @param {Function} fn - Función async que recibe (context, params).
     * @returns {WorkflowEngine}
     */
    registerAction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error(`La acción "${name}" debe ser una función`);
        }
        this.actions.set(name, fn);
        return this;
    }

    /**
     * Verifica si una acción está registrada.
     * @param {string} name
     * @returns {boolean}
     */
    hasAction(name) {
        return this.actions.has(name);
    }

    /**
     * Lista las acciones registradas.
     * @returns {Array<string>}
     */
    listActions() {
        return Array.from(this.actions.keys());
    }

    /**
     * Define un workflow.
     * 
     * @param {Object} workflow
     * @param {string} workflow.name - Nombre único del workflow.
     * @param {string} workflow.trigger - Tipo de trigger (ver TriggerTypes).
     * @param {Array<Object>} workflow.steps - Array de steps:
     *   { action: string, params?: Object, continueOnError?: boolean }
     * @param {boolean} workflow.enabled - Si está activo (default: true).
     * @returns {WorkflowEngine}
     */
    defineWorkflow(workflow) {
        if (!workflow.name) {
            throw new Error('Workflow debe tener un nombre');
        }
        if (!isValidTrigger(workflow.trigger)) {
            throw new Error(`Trigger desconocido: ${workflow.trigger}`);
        }
        if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
            throw new Error('Workflow debe tener al menos un step');
        }

        // Validar que todas las acciones existan
        for (const step of workflow.steps) {
            if (!this.actions.has(step.action)) {
                throw new Error(`Acción no registrada: ${step.action}`);
            }
        }

        this.workflows.set(workflow.name, {
            name: workflow.name,
            trigger: workflow.trigger,
            steps: [...workflow.steps],
            enabled: workflow.enabled !== false
        });

        return this;
    }

    /**
     * Lista todos los workflows registrados.
     * @returns {Array<Object>}
     */
    listWorkflows() {
        return Array.from(this.workflows.values());
    }

    /**
     * Retorna los workflows que responden a un trigger.
     * @param {string} trigger
     * @returns {Array<Object>}
     */
    getWorkflowsByTrigger(trigger) {
        return this.listWorkflows().filter(w => w.trigger === trigger && w.enabled);
    }

    /**
     * Ejecuta un workflow por nombre.
     * 
     * @param {string} workflowName
     * @param {Object} initialContext - Contexto inicial.
     * @returns {Promise<Object>} - Reporte de ejecución.
     */
    async execute(workflowName, initialContext = {}) {
        const workflow = this.workflows.get(workflowName);
        if (!workflow) {
            throw new Error(`Workflow no encontrado: ${workflowName}`);
        }
        if (!workflow.enabled) {
            return {
                workflow: workflowName,
                success: false,
                skipped: true,
                reason: 'Workflow deshabilitado',
                steps: []
            };
        }

        const context = { ...initialContext };
        const stepResults = [];
        const startTime = Date.now();

        for (let i = 0; i < workflow.steps.length; i++) {
            const step = workflow.steps[i];
            const actionFn = this.actions.get(step.action);

            try {
                const result = await actionFn(context, step.params || {});
                stepResults.push({
                    index: i,
                    action: step.action,
                    success: true,
                    result
                });
                // Actualizar contexto si la acción retorna algo
                if (result && typeof result === 'object') {
                    context._lastResult = result;
                }
            } catch (error) {
                stepResults.push({
                    index: i,
                    action: step.action,
                    success: false,
                    error: error.message
                });

                if (!step.continueOnError) {
                    break;
                }
            }
        }

        const report = {
            workflow: workflowName,
            trigger: workflow.trigger,
            success: stepResults.every(r => r.success),
            duration: Date.now() - startTime,
            steps: stepResults,
            context
        };

        // Añadir al log (con límite)
        this.executionLog.push({
            timestamp: new Date().toISOString(),
            ...report
        });
        if (this.executionLog.length > this.maxLogSize) {
            this.executionLog.shift();
        }

        return report;
    }

    /**
     * Dispara todos los workflows de un trigger específico.
     * 
     * @param {string} trigger - Tipo de trigger.
     * @param {Object} context - Contexto compartido.
     * @returns {Promise<Array<Object>>} - Reportes de cada workflow.
     */
    async triggerWorkflows(trigger, context = {}) {
        const workflows = this.getWorkflowsByTrigger(trigger);
        const reports = [];

        for (const workflow of workflows) {
            try {
                const report = await this.execute(workflow.name, context);
                reports.push(report);
            } catch (e) {
                reports.push({
                    workflow: workflow.name,
                    success: false,
                    error: e.message
                });
            }
        }

        return reports;
    }

    /**
     * Retorna el historial de ejecuciones.
     * @param {number} limit - Número máximo de entradas.
     * @returns {Array<Object>}
     */
    getExecutionLog(limit = 20) {
        return this.executionLog.slice(-limit);
    }

    /**
     * Limpia todo el motor.
     */
    clear() {
        this.actions.clear();
        this.workflows.clear();
        this.executionLog = [];
    }
}