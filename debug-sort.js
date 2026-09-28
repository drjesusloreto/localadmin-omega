// debug-sort.js
import { Database } from './src/js/db/db.js';

async function main() {
  // Limpiar IndexedDB
  const dbs = await indexedDB.databases();
  for (const info of dbs) {
    indexedDB.deleteDatabase(info.name);
  }

  const db = new Database();
  await db.init();
  await db.setEncryptionKey('test');

  // Crear r1 con timestamp forzado
  const r1 = await db.createRecord({ name: 'First' });
  console.log('\n=== Después de crear r1 ===');
  console.log('r1.id:', r1.id);
  console.log('r1.updated_at:', r1.updated_at);

  // Forzar timestamp antiguo
  r1.updated_at = '2020-01-01T00:00:00.000Z';
  console.log('\n=== Forzando r1.updated_at a 2020 ===');
  console.log('r1.updated_at antes del put:', r1.updated_at);

  await db._tx('records', 'readwrite', store => store.put(r1));

  // Verificar que se guardó correctamente
  const checkR1 = await db.getRecord(r1.id);
  console.log('\n=== Después del put ===');
  console.log('checkR1.updated_at:', checkR1.updated_at);

  // Crear r2
  const r2 = await db.createRecord({ name: 'Second' });
  console.log('\n=== Después de crear r2 ===');
  console.log('r2.id:', r2.id);
  console.log('r2.updated_at:', r2.updated_at);

  // Obtener todos
  const all = await db.getAllRecords();
  console.log('\n=== Todos los registros ===');
  all.forEach(r => {
    console.log(`- id: ${r.id}, name: ${r.name}, updated_at: ${r.updated_at}`);
  });

  // Ordenar descendente
  const sortedDesc = await db.getAllRecords({ sort: 'updated_at_desc' });
  console.log('\n=== Ordenado desc por updated_at ===');
  sortedDesc.forEach((r, i) => {
    console.log(`${i}: id: ${r.id}, name: ${r.name}, updated_at: ${r.updated_at}`);
  });

  console.log('\n=== Diagnóstico ===');
  console.log('sortedDesc[0].id:', sortedDesc[0].id);
  console.log('r2.id (más reciente):', r2.id);
  console.log('¿sortedDesc[0] es r2?', sortedDesc[0].id === r2.id);
}

main().catch(console.error);