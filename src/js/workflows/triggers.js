// src/js/workflows/triggers.js

/**
 * Tipos de triggers soportados por el WorkflowEngine.
 * 
 * Un trigger es el evento que inicia la ejecución de un workflow.
 * 
 * Referencia: EDC Página 250-260 + PAE Semana 5, Día 21
 */
export const TriggerTypes = {
    /** Ejecución manual (llamado por el usuario) */
    MANUAL: 'manual',
    /** Ejecución al crear un registro */
    RECORD_CREATED: 'record-created',
    /** Ejecución al actualizar un registro */
    RECORD_UPDATED: 'record-updated',
    /** Ejecución al eliminar un registro */
    RECORD_DELETED: 'record-deleted',
    /** Ejecución programada (cron-like) */
    SCHEDULED: 'scheduled',
    /** Ejecución por cambio de estado de sync */
    SYNC_COMPLETED: 'sync-completed'
};

/**
 * Valida que un tipo de trigger sea conocido.
 * @param {string} trigger
 * @returns {boolean}
 */
export function isValidTrigger(trigger) {
    return Object.values(TriggerTypes).includes(trigger);
}

/**
 * Lista todos los triggers disponibles.
 * @returns {Array<string>}
 */
export function listTriggers() {
    return Object.values(TriggerTypes);
}