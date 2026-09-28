// scripts/analyze-bundle.js
/**
 * Script para analizar el bundle y detectar problemas de tamaño.
 * Ejecutar con: node scripts/analyze-bundle.js
 */
import { readFileSync, statSync, readdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { gzipSync } from 'zlib';

const DIST_DIR = 'dist';
const MAX_BUNDLE_SIZE_KB = 500;
const MAX_CHUNK_SIZE_KB = 200;

function getFilesRecursive(dir) {
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...getFilesRecursive(fullPath));
        } else {
            files.push(fullPath);
        }
    }
    return files;
}

function analyzeBundle() {
    console.log('\n📦 Análisis del Bundle\n');
    console.log('='.repeat(70));

    // ⬇️ FIX: Verificar que dist/ existe ANTES de procesar
    if (!existsSync(DIST_DIR)) {
        console.error(`\n❌ No existe el directorio "${DIST_DIR}".`);
        console.error('   Ejecuta "npm run build" primero.\n');
        process.exit(1);
    }

    let totalSize = 0;
    let totalGzipSize = 0;
    const filesByType = { js: [], css: [], html: [], other: [] };
    const chunks = [];

    const files = getFilesRecursive(DIST_DIR);

    for (const file of files) {
        const stat = statSync(file);
        const ext = extname(file).toLowerCase();
        const sizeKB = stat.size / 1024;
        const content = readFileSync(file);
        const gzipSizeKB = gzipSync(content).length / 1024;

        totalSize += sizeKB;
        totalGzipSize += gzipSizeKB;

        const info = {
            path: file.replace(DIST_DIR + '/', '').replace(DIST_DIR + '\\', ''),
            sizeKB: sizeKB.toFixed(2),
            gzipSizeKB: gzipSizeKB.toFixed(2),
            size: sizeKB,
            gzipSize: gzipSizeKB
        };

        if (ext === '.js') {
            filesByType.js.push(info);
            chunks.push(info);
        } else if (ext === '.css') {
            filesByType.css.push(info);
        } else if (ext === '.html') {
            filesByType.html.push(info);
        } else {
            filesByType.other.push(info);
        }
    }

    // Chunks JS
    console.log('\n📄 Chunks JavaScript:\n');
    console.log('  Archivo'.padEnd(50) + 'Tamaño'.padStart(12) + 'Gzip'.padStart(12));
    console.log('  ' + '-'.repeat(50) + ' ' + '-'.repeat(11) + ' ' + '-'.repeat(11));

    chunks
        .sort((a, b) => b.size - a.size)
        .forEach(chunk => {
            const warning = chunk.size > MAX_CHUNK_SIZE_KB ? ' ⚠️' : '';
            console.log(
                `  ${chunk.path.padEnd(48)} ${chunk.sizeKB.padStart(9)} KB ${chunk.gzipSizeKB.padStart(9)} KB${warning}`
            );
        });

    // CSS
    if (filesByType.css.length > 0) {
        console.log('\n🎨 CSS:\n');
        filesByType.css.forEach(f => {
            console.log(`  ${f.path.padEnd(48)} ${f.sizeKB.padStart(9)} KB`);
        });
    }

    // HTML
    if (filesByType.html.length > 0) {
        console.log('\n📄 HTML:\n');
        filesByType.html.forEach(f => {
            console.log(`  ${f.path.padEnd(48)} ${f.sizeKB.padStart(9)} KB`);
        });
    }

    // Otros (manifest, sw.js, etc.)
    if (filesByType.other.length > 0) {
        console.log('\n📎 Otros:\n');
        filesByType.other.forEach(f => {
            console.log(`  ${f.path.padEnd(48)} ${f.sizeKB.padStart(9)} KB`);
        });
    }

    // Resumen
    console.log('\n' + '='.repeat(70));
    console.log('\n📊 Resumen:\n');
    console.log(`  Total: ${totalSize.toFixed(2)} KB (${totalGzipSize.toFixed(2)} KB gzip)`);
    console.log(`  JS: ${filesByType.js.reduce((s, f) => s + f.size, 0).toFixed(2)} KB`);
    console.log(`  CSS: ${filesByType.css.reduce((s, f) => s + f.size, 0).toFixed(2)} KB`);
    console.log(`  Archivos: ${files.length}`);

    // Validaciones
    console.log('\n✅ Validaciones:\n');
    const warnings = [];

    if (totalGzipSize > MAX_BUNDLE_SIZE_KB) {
        warnings.push(`❌ Bundle total (${totalGzipSize.toFixed(2)} KB gzip) excede el límite (${MAX_BUNDLE_SIZE_KB} KB)`);
    } else {
        console.log(`  ✅ Bundle total: ${totalGzipSize.toFixed(2)} KB gzip (límite: ${MAX_BUNDLE_SIZE_KB} KB)`);
    }

    const oversizedChunks = chunks.filter(c => c.size > MAX_CHUNK_SIZE_KB);
    if (oversizedChunks.length > 0) {
        warnings.push(`⚠️ ${oversizedChunks.length} chunk(s) exceden ${MAX_CHUNK_SIZE_KB} KB`);
        oversizedChunks.forEach(c => {
            console.log(`  ⚠️ ${c.path}: ${c.sizeKB} KB`);
        });
    } else {
        console.log(`  ✅ Ningún chunk excede ${MAX_CHUNK_SIZE_KB} KB`);
    }

    if (warnings.length > 0) {
        console.log('\n⚠️ Advertencias:\n');
        warnings.forEach(w => console.log(`  ${w}`));
        process.exit(1);
    }

    console.log('\n🎉 Bundle optimizado correctamente.\n');
}

try {
    analyzeBundle();
} catch (e) {
    console.error('\n❌ Error analizando bundle:', e.message);
    console.error(e.stack);
    process.exit(1);
}