// src/js/tenant/rbac.js

/**
 * Control de Acceso Basado en Roles (RBAC).
 * 
 * Define roles con permisos granulares y verifica si un usuario
 * puede realizar una acción sobre un recurso.
 * 
 * Referencia: EDC Página 200-210 + PAE Semana 5, Día 20
 */
export class RBAC {
    constructor() {
        /** @type {Map<string, Set<string>>} - role -> permisos */
        this.roles = new Map();
        /** @type {Map<string, string>} - userId -> roleName */
        this.userRoles = new Map();
        /** @type {string|null} - Usuario actual */
        this.currentUser = null;

        // Roles por defecto
        this._registerDefaultRoles();
    }

    /**
     * Registra los roles por defecto.
     * @private
     */
    _registerDefaultRoles() {
        this.createRole('Viewer', [
            'records:read',
            'files:read',
            'search:read'
        ]);
        this.createRole('Editor', [
            'records:read',
            'records:write',
            'records:delete',
            'files:read',
            'files:write',
            'search:read',
            'sync:execute'
        ]);
        this.createRole('Admin', ['*']);
    }

    /**
     * Crea un rol con permisos.
     * @param {string} name
     * @param {Array<string>} permissions
     * @returns {RBAC}
     */
    createRole(name, permissions = []) {
        this.roles.set(name, new Set(permissions));
        return this;
    }

    /**
     * Asigna un rol a un usuario.
     * @param {string} userId
     * @param {string} roleName
     * @returns {boolean}
     */
    assignRole(userId, roleName) {
        if (!this.roles.has(roleName)) {
            throw new Error(`Rol desconocido: ${roleName}`);
        }
        this.userRoles.set(userId, roleName);
        return true;
    }

    /**
     * Obtiene el rol de un usuario.
     * @param {string} userId
     * @returns {string|null}
     */
    getRole(userId) {
        return this.userRoles.get(userId) || null;
    }

    /**
     * Obtiene los permisos del rol de un usuario.
     * @param {string} userId
     * @returns {Set<string>}
     */
    getPermissions(userId) {
        const role = this.getRole(userId);
        if (!role) return new Set();
        return this.roles.get(role) || new Set();
    }

    /**
     * Verifica si un usuario puede realizar una acción.
     * @param {string} userId
     * @param {string} action - Ej: 'records:write'
     * @returns {boolean}
     */
    can(userId, action) {
        const permissions = this.getPermissions(userId);
        if (permissions.has('*')) return true;
        return permissions.has(action);
    }

    /**
     * Verifica si el usuario actual puede realizar una acción.
     * @param {string} action
     * @returns {boolean}
     */
    canCurrent(action) {
        if (!this.currentUser) return false;
        return this.can(this.currentUser, action);
    }

    /**
     * Establece el usuario actual.
     * @param {string} userId
     */
    setCurrentUser(userId) {
        this.currentUser = userId;
    }

    /**
     * Retorna el usuario actual.
     * @returns {string|null}
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Verifica si un rol existe.
     * @param {string} roleName
     * @returns {boolean}
     */
    hasRole(roleName) {
        return this.roles.has(roleName);
    }

    /**
     * Lista todos los roles.
     * @returns {Array<string>}
     */
    listRoles() {
        return Array.from(this.roles.keys());
    }

    /**
     * Limpia todos los roles y usuarios (útil en tests).
     */
    clear() {
        this.roles.clear();
        this.userRoles.clear();
        this.currentUser = null;
        this._registerDefaultRoles();
    }
}