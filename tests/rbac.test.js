// tests/rbac.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { RBAC } from '../src/js/tenant/rbac.js';

describe('RBAC', () => {
    let rbac;

    beforeEach(() => {
        rbac = new RBAC();
    });

    // ============================================================
    // ROLES POR DEFECTO
    // ============================================================
    describe('roles por defecto', () => {
        it('debe tener los roles Viewer, Editor y Admin', () => {
            expect(rbac.hasRole('Viewer')).toBe(true);
            expect(rbac.hasRole('Editor')).toBe(true);
            expect(rbac.hasRole('Admin')).toBe(true);
        });

        it('Admin debe tener permiso wildcard', () => {
            rbac.assignRole('user_admin', 'Admin');
            expect(rbac.can('user_admin', 'anything')).toBe(true);
            expect(rbac.can('user_admin', 'records:delete')).toBe(true);
        });

        it('Viewer solo debe poder leer', () => {
            rbac.assignRole('user_viewer', 'Viewer');
            expect(rbac.can('user_viewer', 'records:read')).toBe(true);
            expect(rbac.can('user_viewer', 'records:write')).toBe(false);
            expect(rbac.can('user_viewer', 'records:delete')).toBe(false);
        });

        it('Editor debe poder leer y escribir', () => {
            rbac.assignRole('user_editor', 'Editor');
            expect(rbac.can('user_editor', 'records:read')).toBe(true);
            expect(rbac.can('user_editor', 'records:write')).toBe(true);
            expect(rbac.can('user_editor', 'records:delete')).toBe(true);
        });
    });

    // ============================================================
    // CREAR ROL
    // ============================================================
    describe('createRole', () => {
        it('debe crear un rol personalizado', () => {
            rbac.createRole('Auditor', ['records:read', 'audit:read']);
            expect(rbac.hasRole('Auditor')).toBe(true);
        });

        it('debe permitir crear roles sin permisos', () => {
            rbac.createRole('Empty');
            rbac.assignRole('user_empty', 'Empty');
            expect(rbac.can('user_empty', 'records:read')).toBe(false);
        });

        it('debe soportar encadenamiento', () => {
            const result = rbac.createRole('Test', ['records:read']);
            expect(result).toBe(rbac);
        });
    });

    // ============================================================
    // ASIGNAR ROL
    // ============================================================
    describe('assignRole', () => {
        it('debe asignar un rol existente', () => {
            expect(rbac.assignRole('user1', 'Editor')).toBe(true);
            expect(rbac.getRole('user1')).toBe('Editor');
        });

        it('debe lanzar error con rol desconocido', () => {
            expect(() => rbac.assignRole('user1', 'Unknown')).toThrow('Rol desconocido');
        });

        it('debe reemplazar el rol anterior', () => {
            rbac.assignRole('user1', 'Viewer');
            rbac.assignRole('user1', 'Editor');
            expect(rbac.getRole('user1')).toBe('Editor');
        });
    });

    // ============================================================
    // VERIFICAR PERMISOS
    // ============================================================
    describe('can', () => {
        it('debe retornar false para usuario sin rol', () => {
            expect(rbac.can('unknown_user', 'records:read')).toBe(false);
        });

        it('debe retornar false para acción no permitida', () => {
            rbac.assignRole('user1', 'Viewer');
            expect(rbac.can('user1', 'records:write')).toBe(false);
        });

        it('debe retornar true para acción permitida', () => {
            rbac.assignRole('user1', 'Editor');
            expect(rbac.can('user1', 'records:write')).toBe(true);
        });
    });

    // ============================================================
    // USUARIO ACTUAL
    // ============================================================
    describe('usuario actual', () => {
        it('debe establecer y obtener el usuario actual', () => {
            rbac.setCurrentUser('user1');
            expect(rbac.getCurrentUser()).toBe('user1');
        });

        it('canCurrent debe usar el usuario actual', () => {
            rbac.assignRole('user1', 'Editor');
            rbac.setCurrentUser('user1');
            expect(rbac.canCurrent('records:write')).toBe(true);
        });

        it('canCurrent debe retornar false sin usuario', () => {
            expect(rbac.canCurrent('records:read')).toBe(false);
        });
    });

    // ============================================================
    // LISTAR Y LIMPIAR
    // ============================================================
    describe('utilidades', () => {
        it('debe listar todos los roles', () => {
            const roles = rbac.listRoles();
            expect(roles).toContain('Viewer');
            expect(roles).toContain('Editor');
            expect(roles).toContain('Admin');
        });

        it('debe limpiar y reinicializar roles', () => {
            rbac.assignRole('user1', 'Editor');
            rbac.clear();
            expect(rbac.getRole('user1')).toBeNull();
            expect(rbac.hasRole('Viewer')).toBe(true);
        });

        it('debe retornar permisos vacíos para usuario sin rol', () => {
            const perms = rbac.getPermissions('unknown');
            expect(perms.size).toBe(0);
        });
    });
});