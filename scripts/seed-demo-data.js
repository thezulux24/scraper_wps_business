#!/usr/bin/env node
/**
 * Script CLI para poblar la base de datos de Café Pa'l Monte con datos realistas
 * hasta la fecha y hora actual del sistema, y generar reportes PDF y Excel verificados.
 *
 * Uso:
 *   node scripts/seed-demo-data.js
 */
const { DB_PATH, REPORTS_DIR, ensureDataDirs } = require('../src/main/paths');
const { OrderDatabase } = require('../src/main/database');
const { ReportExporter } = require('../src/main/exporter');
const { seedDatabaseAndReports } = require('../src/main/demo-seeder');

async function main() {
  ensureDataDirs();
  const db = new OrderDatabase(DB_PATH);
  const exporter = new ReportExporter(REPORTS_DIR);
  const now = new Date();

  console.log(`[Seed] Sembrando órdenes realistas de Café Pa'l Monte hasta: ${now.toLocaleString('es-CO')}...`);
  const res = await seedDatabaseAndReports({
    db,
    exporter,
    now,
    cleanExisting: true,
  });

  console.log(`[Seed] Base de datos actualizada en: ${DB_PATH}`);
  console.log(`[Seed] Respaldo previo guardado en: ${res.backupPath}`);
  console.log(`[Seed] Total de órdenes sembradas: ${res.totalInDb} (hasta ${res.latestDate})`);
  console.log(`[Seed] Reportes generados (${res.generatedFiles.length}):`);
  for (const f of res.generatedFiles) {
    console.log(`  - ${f}`);
  }
}

main().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
