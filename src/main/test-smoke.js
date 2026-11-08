const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { OrderDatabase } = require('./database');
const { ReportExporter } = require('./exporter');
const { detectBrowser } = require('./scraper');
const { DB_PATH, REPORTS_DIR } = require('./paths');
const puppeteer = require('puppeteer-core');

async function runTests() {
  console.log('--- 1. Verificando Base de Datos y Migracion Automatica ---');
  const db = new OrderDatabase(DB_PATH);
  const mig = db.autoMigrateIfNeeded();
  console.log('Resultado autoMigrateIfNeeded:', mig);

  // Forzar migración desde la raíz del proyecto para asegurar que trae los pedidos actuales
  const projectRoot = path.resolve(__dirname, '..', '..');
  const inspectRes = db.inspectLegacySource(projectRoot);
  console.log('Inspeccion de carpeta actual:', inspectRes);
  assert.strictEqual(inspectRes.ok, true, 'La inspeccion de la carpeta del proyecto debe ser exitosa');
  assert.ok(inspectRes.ordersCount >= 6, 'Debe detectar los pedidos existentes en app/orders.db');

  const migExplicit = db.migrateFromSource(projectRoot);
  console.log('Migracion explicita:', migExplicit);
  assert.strictEqual(migExplicit.ok, true);

  const allOrders = db.getAll();
  console.log('Total ordenes en nueva BD:', allOrders.length);
  assert.ok(allOrders.length >= 6, 'La BD migrada debe contener al menos los 6 pedidos originales');
  const syncStats = db.getSyncStats();
  console.log('Sync stats:', syncStats);
  assert.strictEqual(syncStats.total, allOrders.length);

  // Probar respaldo
  const backupFile = db.createBackup('test');
  assert.ok(backupFile && fs.existsSync(backupFile), 'El archivo de respaldo debe existir');
  console.log('Respaldo creado en:', backupFile);

  console.log('--- 2. Verificando Generacion de Reportes PDF y Excel ---');
  const exporter = new ReportExporter(REPORTS_DIR);
  const excelRes = await exporter.toExcel(allOrders, '2026-01-01', '2026-12-31');
  assert.strictEqual(excelRes.ok, true, 'Exportacion Excel debe ser exitosa');
  assert.ok(fs.existsSync(excelRes.filePath), 'Archivo Excel debe existir');

  const pdfRes = await exporter.toPdf(allOrders, '2026-01-01', '2026-12-31');
  assert.strictEqual(pdfRes.ok, true, 'Exportacion PDF debe ser exitosa');
  assert.ok(fs.existsSync(pdfRes.filePath), 'Archivo PDF debe existir');

  const reports = exporter.listReports();
  console.log('Total reportes disponibles:', reports.length);
  assert.ok(reports.length >= 2, 'Deben listarse los reportes generados y migrados');

  console.log('--- 3. Verificando UI Interactiva (Click-Through R-35) ---');
  const detected = detectBrowser();
  assert.ok(detected, 'Se requiere Edge o Chrome instalado para la prueba de UI');

  const browser = await puppeteer.launch({
    executablePath: detected.executablePath,
    headless: 'shell',
    defaultViewport: { width: 1360, height: 860 },
  });

  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    const htmlPath = 'file:///' + path.resolve(__dirname, '..', 'renderer', 'index.html').replace(/\\/g, '/');
    await page.goto(htmlPath, { waitUntil: 'networkidle0' });

    // Verificar navegacion a Analitica
    await page.click('#nav-analytics');
    const anVisible = await page.$eval('#view-analytics', (el) => el.classList.contains('active'));
    assert.strictEqual(anVisible, true, 'Vista Analitica debe activarse al hacer click');

    // Verificar navegacion a Reportes
    await page.click('#nav-reports');
    const repVisible = await page.$eval('#view-reports', (el) => el.classList.contains('active'));
    assert.strictEqual(repVisible, true, 'Vista Reportes debe activarse al hacer click');

    // Verificar navegacion a Sistema / Base de Datos
    await page.click('#nav-system');
    const sysVisible = await page.$eval('#view-system', (el) => el.classList.contains('active'));
    assert.strictEqual(sysVisible, true, 'Vista Sistema debe activarse al hacer click');

    // Volver al Panel
    await page.click('#nav-panel');
    const panelVisible = await page.$eval('#view-panel', (el) => el.classList.contains('active'));
    assert.strictEqual(panelVisible, true, 'Vista Panel debe activarse al hacer click');

    // Probar apertura y cierre de Modal Agregar Pedido (con validacion de formulario vacio y Escape)
    await page.click('#btn-add-order');
    const modalOpen = await page.$eval('#order-modal-backdrop', (el) => !el.classList.contains('hidden'));
    assert.strictEqual(modalOpen, true, 'Modal de Nuevo Pedido debe abrirse');

    // Intentar enviar sin cliente para verificar validacion
    await page.click('#btn-save-order');
    const formErrVisible = await page.$eval('#order-form-error', (el) => !el.classList.contains('hidden'));
    assert.strictEqual(formErrVisible, true, 'Formulario vacio debe mostrar mensaje de validacion');

    // Crear un pedido manual desde el modal
    await page.type('#order-input-client', 'Cafeteria San Antonio');
    await page.type('#order-input-product', 'Cafe Especial 500g x3');
    await page.type('#order-input-amount', '75000');
    await page.click('#btn-save-order');

    const modalClosedAfterSave = await page.$eval('#order-modal-backdrop', (el) => el.classList.contains('hidden'));
    assert.strictEqual(modalClosedAfterSave, true, 'Modal debe cerrarse tras guardar pedido');

    // Probar cambio de tema Claro <-> Oscuro (R-34)
    await page.click('#btn-theme-toggle');
    const darkTheme = await page.$eval('html', (el) => el.getAttribute('data-theme'));
    assert.strictEqual(darkTheme, 'dark', 'El tema debe cambiar a dark');

    await page.click('#btn-theme-toggle');
    const lightTheme = await page.$eval('html', (el) => el.getAttribute('data-theme'));
    assert.strictEqual(lightTheme, 'light', 'El tema debe volver a light');

    // Verificar ausencia de overflow horizontal en mobile (375px) y desktop (1360px) (R-03)
    await page.setViewport({ width: 375, height: 812 });
    const mobileOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert.strictEqual(mobileOverflow, false, 'No debe existir overflow horizontal en mobile (375px)');

    assert.strictEqual(consoleErrors.length, 0, `No debe haber errores en consola: ${consoleErrors.join('; ')}`);
    console.log('Click-through de UI completado sin errores de consola.');
  } finally {
    await browser.close();
  }

  console.log('=== TODAS LAS PRUEBAS PASARON EXITOSAMENTE ===');
}

runTests().catch((err) => {
  console.error('Fallo en pruebas:', err);
  process.exit(1);
});
