// src/js/ui/main.js

/**
 * Orquestador principal de la UI de LocalAdmin Omega.
 * 
 * Responsabilidades:
 * - Inicializar Database, RBAC y PolicyEngine.
 * - Renderizar la lista de registros en el DOM.
 * - Manejar eventos (crear, editar, eliminar, buscar, sincronizar).
 * - Aplicar políticas de acceso antes de cada acción.
 * 
 * Referencia: EDC Página 220-240 + PAE Semana 5, Día 20
 */
import { Database } from '../db/db.js';
import { RBAC } from '../tenant/rbac.js';
import { PolicyEngine } from '../tenant/policy-engine.js';

export class AppUI {
    /**
     * @param {Object} options
     * @param {Object} options.db - Instancia de Database (opcional, se crea si no se pasa).
     * @param {Object} options.rbac - Instancia de RBAC (opcional).
     * @param {Object} options.policyEngine - Instancia de PolicyEngine (opcional).
     */
    constructor(options = {}) {
        this.db = options.db || new Database();
        this.rbac = options.rbac || new RBAC();
        this.policyEngine = options.policyEngine || new PolicyEngine(this.rbac);
        this.records = [];
        this.filteredRecords = [];
        this.currentUser = 'viewer'; // Por defecto
        this.currentSearch = '';
        this._abortController = null;
        this._initialized = false;
    }

    /**
     * Inicializa la aplicación.
     * @returns {Promise<AppUI>}
     */
    async init() {
        await this.db.init();
        await this.db.setEncryptionKey('ui-default-password');

        // Asignar roles a los usuarios por defecto
        this.rbac.assignRole('admin', 'Admin');
        this.rbac.assignRole('editor', 'Editor');
        this.rbac.assignRole('viewer', 'Viewer');
        this.rbac.setCurrentUser(this.currentUser);

        // Cargar registros
        await this.loadRecords();

        // Configurar event listeners
        this._setupEventListeners();

        // Renderizar
        this.render();

        this._initialized = true;
        return this;
    }

    /**
     * Carga los registros desde la DB.
     * @returns {Promise<void>}
     */
    async loadRecords() {
        this.records = await this.db.getAllRecords();
        this.filteredRecords = [...this.records];
    }

    /**
     * Cambia el usuario actual.
     * @param {string} userId
     */
    setCurrentUser(userId) {
        this.currentUser = userId;
        this.rbac.setCurrentUser(userId);
        this.render();
    }

	 /** Filtra los registros por búsqueda.
	 * Descifra el contenido antes de buscar (es async).
	 * @param {string} query
	 * @returns {Promise<void>}
	 */
	async setSearch(query) {
		this.currentSearch = String(query || '').toLowerCase();
		
		if (!this.currentSearch) {
			this.filteredRecords = [...this.records];
		} else {
			// Descifrar contenido de cada registro para buscar
			const decrypted = await Promise.all(
				this.records.map(async (r) => {
					let content = '';
					try {
						content = await this.db.decryptRecordContent(r);
					} catch (e) {
						content = '';
					}
					return { record: r, decryptedContent: content };
				})
			);

			this.filteredRecords = decrypted
				.filter(({ record, decryptedContent }) => {
					const text = `${record.name || ''} ${decryptedContent} ${(record.tags || []).join(' ')}`.toLowerCase();
					return text.includes(this.currentSearch);
				})
				.map(({ record }) => record);
		}
		
		this.render();
	}

    /**
     * Verifica si el usuario actual puede hacer una acción.
     * @param {string} resource
     * @param {string} action
     * @returns {boolean}
     */
    can(resource, action) {
        return this.policyEngine.can({
            userId: this.currentUser,
            resource,
            action
        });
    }

    /**
     * Abre el modal para un registro nuevo.
     */
    openModalForCreate() {
        if (!this.can('records', 'write')) {
            console.warn('Usuario sin permiso para crear');
            return;
        }
        this._editingId = null;
        const title = document.getElementById('modal-title');
        if (title) title.textContent = 'Nuevo Registro';
        const form = document.getElementById('record-form');
        if (form) form.reset();
        this._openModal();
    }

    /**
     * Abre el modal para editar un registro existente.
     * @param {number} id
     */
    openModalForEdit(id) {
        if (!this.can('records', 'write')) {
            console.warn('Usuario sin permiso para editar');
            return;
        }
        const record = this.records.find(r => r.id === id);
        if (!record) return;

        this._editingId = id;
        const title = document.getElementById('modal-title');
        if (title) title.textContent = 'Editar Registro';
        const nameInput = document.getElementById('record-name');
        if (nameInput) nameInput.value = record.name || '';
        const contentInput = document.getElementById('record-content');
        if (contentInput) contentInput.value = record.content || '';
        const categoryInput = document.getElementById('record-category');
        if (categoryInput) categoryInput.value = record.category || 'general';
        this._openModal();
    }

    /**
     * Guarda un registro (crear o actualizar).
     * @param {Object} data
     * @returns {Promise<Object|null>}
     */
    async saveRecord(data) {
        if (!this.can('records', 'write')) {
            console.warn('Usuario sin permiso para guardar');
            return null;
        }

        let saved;
        if (this._editingId) {
            saved = await this.db.updateRecord(this._editingId, data);
        } else {
            saved = await this.db.createRecord(data);
        }

        await this.loadRecords();
        this.render();
        return saved;
    }

    /**
     * Elimina un registro.
     * @param {number} id
     * @returns {Promise<boolean>}
     */
    async deleteRecord(id) {
        if (!this.can('records', 'delete')) {
            console.warn('Usuario sin permiso para eliminar');
            return false;
        }
        await this.db.deleteRecord(id);
        await this.loadRecords();
        this.render();
        return true;
    }

    /**
     * Renderiza la lista de registros en el DOM.
     */
    render() {
        const listEl = document.getElementById('records-list');
        const emptyEl = document.getElementById('empty-state');
        const newBtn = document.getElementById('btn-new');

        if (!listEl) return;

        // Actualizar botón Nuevo según permisos
        if (newBtn) {
            newBtn.disabled = !this.can('records', 'write');
        }

        // Limpiar lista
        listEl.innerHTML = '';

        if (this.filteredRecords.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';

        for (const record of this.filteredRecords) {
            listEl.appendChild(this._renderRecordCard(record));
        }
    }

    /**
     * Cierra el modal.
     */
    closeModal() {
        const modal = document.getElementById('record-modal');
        if (modal && typeof modal.close === 'function') {
            modal.close();
        }
        this._editingId = null;
    }

    /**
     * Limpia los recursos.
     */
    destroy() {
        if (this._abortController) {
            this._abortController.abort();
        }
        if (this.db?.db) {
            this.db.close();
        }
    }

    // ============================================================
    // MÉTODOS PRIVADOS
    // ============================================================

    /**
     * Abre el modal.
     * @private
     */
    _openModal() {
        const modal = document.getElementById('record-modal');
        if (modal && typeof modal.showModal === 'function') {
            modal.showModal();
        }
    }

    /**
     * Configura todos los event listeners.
     * @private
     */
    _setupEventListeners() {
        this._abortController = new AbortController();
        const signal = this._abortController.signal;

        // Selector de usuario
        const userSelect = document.getElementById('user-select');
        if (userSelect) {
            userSelect.addEventListener('change', (e) => {
                this.setCurrentUser(e.target.value);
            }, { signal });
        }

        // Búsqueda
        const searchInput = document.getElementById('search-input');
		if (searchInput) {
			searchInput.addEventListener('input', async (e) => {
				await this.setSearch(e.target.value);
			}, { signal });
		}

        // Botón Nuevo
        const newBtn = document.getElementById('btn-new');
        if (newBtn) {
            newBtn.addEventListener('click', () => {
                this.openModalForCreate();
            }, { signal });
        }

        // Formulario
        const form = document.getElementById('record-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const data = {
                    name: document.getElementById('record-name')?.value || '',
                    content: document.getElementById('record-content')?.value || '',
                    category: document.getElementById('record-category')?.value || 'general'
                };
                await this.saveRecord(data);
                this.closeModal();
            }, { signal });
        }

        // Botón Cancelar
        const cancelBtn = document.getElementById('btn-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.closeModal();
            }, { signal });
        }
    }

    /**
     * Renderiza una tarjeta de registro.
     * @private
     */
    _renderRecordCard(record) {
        const card = document.createElement('div');
        card.className = 'record-card';
        card.dataset.id = record.id;

        const title = document.createElement('h3');
        title.textContent = record.name || 'Sin nombre';
        card.appendChild(title);

        if (record.content) {
            const content = document.createElement('p');
            content.textContent = record.content.substring(0, 100);
            card.appendChild(content);
        }

        const actions = document.createElement('div');
        actions.className = 'actions';

        if (this.can('records', 'write')) {
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Editar';
            editBtn.dataset.action = 'edit';
            editBtn.dataset.id = record.id;
            editBtn.addEventListener('click', () => this.openModalForEdit(record.id));
            actions.appendChild(editBtn);
        }

        if (this.can('records', 'delete')) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Eliminar';
            deleteBtn.dataset.action = 'delete';
            deleteBtn.dataset.id = record.id;
            deleteBtn.addEventListener('click', () => this.deleteRecord(record.id));
            actions.appendChild(deleteBtn);
        }

        card.appendChild(actions);
        return card;
    }
}

// Auto-inicializar en el navegador
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('DOMContentLoaded', async () => {
        const app = new AppUI();
        await app.init();
        window.app = app; // Útil para debugging
    });
}