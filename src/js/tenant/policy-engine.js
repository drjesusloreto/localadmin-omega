// src/js/tenant/policy-engine.js

/**
 * Motor de políticas para autorización contextual.
 * 
 * Evalúa reglas (policies) sobre un contexto (usuario, recurso, acción)
 * para tomar decisiones de autorización.
 * 
 * Referencia: EDC Página 210-220 + PAE Semana 5, Día 20
 */
export class PolicyEngine {
    constructor(rbac) {
        this.rbac = rbac;
        /** @type {Array<Object>} */
        this.policies = [];
    }

    /**
     * Añade una política al motor.
     * 
     * @param {Object} policy
     * @param {string} policy.name - Nombre descriptivo.
     * @param {string} policy.resource - Recurso (ej: 'records').
     * @param {string} policy.action - Acción (ej: 'write').
     * @param {string} policy.effect - 'allow' | 'deny'.
     * @param {Function} policy.condition - (ctx) => boolean.
     * @param {number} policy.priority - Mayor número = mayor prioridad.
     * @returns {PolicyEngine}
     */
    addPolicy(policy) {
        this.policies.push({
            priority: 0,
            effect: 'deny',
            ...policy
        });
        // Ordenar por prioridad descendente
        this.policies.sort((a, b) => b.priority - a.priority);
        return this;
    }

    /**
     * Elimina una política por nombre.
     * @param {string} name
     * @returns {boolean}
     */
    removePolicy(name) {
        const idx = this.policies.findIndex(p => p.name === name);
        if (idx >= 0) {
            this.policies.splice(idx, 1);
            return true;
        }
        return false;
    }

    /**
     * Evalúa todas las políticas con un contexto.
     * 
     * @param {Object} context
     * @param {string} context.userId
     * @param {string} context.resource
     * @param {string} context.action
     * @param {Object} context.metadata - Datos adicionales.
     * @returns {{ allowed: boolean, reason: string, matchedPolicy: string|null }}
     */
    evaluate(context) {
        // 1. Verificar permisos base con RBAC
        const action = `${context.resource}:${context.action}`;
        const hasBasePermission = this.rbac.can(context.userId, action);

        if (!hasBasePermission) {
            return {
                allowed: false,
                reason: `RBAC denegó: ${action}`,
                matchedPolicy: null
            };
        }

        // 2. Evaluar políticas adicionales en orden de prioridad
        for (const policy of this.policies) {
            if (policy.resource !== context.resource) continue;
            if (policy.action !== context.action) continue;

            let conditionMet = false;
            try {
                conditionMet = typeof policy.condition === 'function'
                    ? policy.condition(context)
                    : true;
            } catch (e) {
                console.warn(`Error evaluando política ${policy.name}:`, e);
                continue;
            }

            if (conditionMet) {
                return {
                    allowed: policy.effect === 'allow',
                    reason: `Política: ${policy.name}`,
                    matchedPolicy: policy.name
                };
            }
        }

        // 3. Si no hay políticas que apliquen, permitir (RBAC ya autorizó)
        return {
            allowed: true,
            reason: 'Sin políticas adicionales',
            matchedPolicy: null
        };
    }

    /**
     * Retorna true si el contexto está permitido.
     * @param {Object} context
     * @returns {boolean}
     */
    can(context) {
        return this.evaluate(context).allowed;
    }

    /**
     * Retorna todas las políticas registradas.
     * @returns {Array<Object>}
     */
    listPolicies() {
        return [...this.policies];
    }

    /**
     * Limpia todas las políticas.
     */
    clear() {
        this.policies = [];
    }
}