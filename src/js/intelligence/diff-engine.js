// src/js/intelligence/diff-engine.js
/**
 * Motor de diff para comparar versiones de registros.
 * Implementa LCS (Longest Common Subsequence) para texto.
 */
export class DiffEngine {
    /**
     * Diff carácter a carácter entre dos strings.
     */
    static charDiff(oldText, newText) {
        const oldChars = oldText.split('');
        const newChars = newText.split('');
        const matrix = this._lcsMatrix(oldChars, newChars);
        return this._backtrack(matrix, oldChars, newChars);
    }

    /**
     * Diff palabra por palabra.
     */
    static wordDiff(oldText, newText) {
        const oldWords = oldText.split(/(\s+)/);
        const newWords = newText.split(/(\s+)/);
        const matrix = this._lcsMatrix(oldWords, newWords);
        return this._backtrack(matrix, oldWords, newWords);
    }

    /**
     * Diff línea por línea.
     */
    static lineDiff(oldText, newText) {
        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        const matrix = this._lcsMatrix(oldLines, newLines);
        return this._backtrack(matrix, oldLines, newLines);
    }

    static _lcsMatrix(a, b) {
        const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                if (a[i - 1] === b[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1] + 1;
                } else {
                    matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
                }
            }
        }
        return matrix;
    }

    static _backtrack(matrix, a, b) {
        const diff = [];
        let i = a.length, j = b.length;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
                diff.unshift({ type: 'equal', value: a[i - 1] });
                i--; j--;
            } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
                diff.unshift({ type: 'added', value: b[j - 1] });
                j--;
            } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
                diff.unshift({ type: 'removed', value: a[i - 1] });
                i--;
            }
        }
        return diff;
    }

    /**
     * Diff de objetos campo a campo.
     */
    static objectDiff(oldObj, newObj, options = {}) {
        const changes = [];
        const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
        for (const key of allKeys) {
            if (key.startsWith('_')) continue;
            if (options.ignore?.includes(key)) continue;
            const oldVal = oldObj?.[key];
            const newVal = newObj?.[key];
            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                changes.push({
                    field: key,
                    type: oldVal === undefined ? 'added' : newVal === undefined ? 'removed' : 'modified',
                    oldValue: oldVal,
                    newValue: newVal
                });
            }
        }
        return changes;
    }

    /**
     * Calcula el porcentaje de similitud entre dos textos.
     */
    static similarity(a, b) {
        if (a === b) return 100;
        if (!a || !b) return 0;
        const maxLen = Math.max(a.length, b.length);
        const diff = this.charDiff(a, b);
        const equalChars = diff.filter(d => d.type === 'equal').length;
        return Math.round((equalChars / maxLen) * 100);
    }

    /**
     * Formatea un diff en HTML con colores.
     */
    static toHTML(diff) {
        return diff.map(part => {
            const escaped = String(part.value).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
            switch (part.type) {
                case 'added': return `<ins style="background:#dcfce7;color:#166534;text-decoration:none;">${escaped}</ins>`;
                case 'removed': return `<del style="background:#fee2e2;color:#991b1b;">${escaped}</del>`;
                default: return escaped;
            }
        }).join('');
    }
}