const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  clipboard,
} = require('electron');

const {
  DATA_DIR,
  DB_PATH,
  REPORTS_DIR,
  BACKUPS_DIR,
  ensureDataDirs,
  getAssetPath,
  readSettings,
  writeSettings,
  discoverKnownLegacySources,
} = require('./paths');
const { OrderDatabase } = require('./database');
const { ReportExporter } = require('./exporter');
const { WhatsAppScraperManager } = require('./scraper');

let mainWindow = null;
let db = null;
let exporter = null;
let scraper = null;
let autoMigrationSummary = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function readLogoDataUrl() {
  const logoPath = getAssetPath('logo.jpg');
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      const b64 = fs.readFileSync(logoPath).toString('base64');
      return `data:image/jpeg;base64,${b64}`;
    } catch (_) {}
  }
  return null;
}

function createWindow() {
  const iconPath = getAssetPath('app.ico');
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: "Café Pa'l Monte · Gestión de Pedidos",
    icon: iconPath && fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#F4ECE0',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--smoke-test')) {
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const domSnapshot = await mainWindow.webContents.executeJavaScript(`({
            title: document.title,
            totalRevenue: document.getElementById('kpi-total-revenue')?.textContent || '',
            ordersBadge: document.getElementById('nav-orders-badge')?.textContent || '',
            statusRight: document.getElementById('statusbar-db-summary')?.textContent || '',
            rowsCount: document.querySelectorAll('#orders-tbody tr').length
          })`);
          const image = await mainWindow.webContents.capturePage();
          const outDir = path.join(DATA_DIR, 'smoke');
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(path.join(outDir, 'packaged-window.png'), image.toPNG());
          fs.writeFileSync(
            path.join(outDir, 'packaged-report.json'),
            JSON.stringify({ ok: true, version: app.getVersion(), domSnapshot }, null, 2),
            'utf8'
          );
          app.exit(0);
        } catch (err) {
          const outDir = path.join(DATA_DIR, 'smoke');
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(
            path.join(outDir, 'packaged-report.json'),
            JSON.stringify({ ok: false, error: err.message }, null, 2),
            'utf8'
          );
          app.exit(1);
        }
      }, 1500);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupServices() {
  ensureDataDirs();
  db = new OrderDatabase(DB_PATH);
  autoMigrationSummary = db.autoMigrateIfNeeded();
  exporter = new ReportExporter(REPORTS_DIR);

  scraper = new WhatsAppScraperManager({
    onStatus: (msg) => {
      sendToRenderer('wa:status', msg);
    },
    onConnectionState: (state) => {
      sendToRenderer('wa:connectionState', {
        state,
        ...scraper.getStatusSnapshot(),
      });
    },
    onQrUpdate: (qrData) => {
      sendToRenderer('wa:qrUpdate', qrData);
    },
    onOrdersSynced: async (incomingOrders) => {
      const { inserted, updated } = db.merge(incomingOrders);
      const nowStr = new Date().toLocaleTimeString('es-CO', { hour12: false });
      const stats = db.getSyncStats();
      if (inserted > 0 || updated > 0) {
        const allOrders = db.getAll();
        sendToRenderer('orders:updated', {
          orders: allOrders,
          stats,
          inserted,
          updated,
        });
        sendToRenderer(
          'wa:status',
          `Sincronizado: +${inserted} nuevas, ${updated} actualizadas (${incomingOrders.length} en WhatsApp) · ${nowStr}`
        );
      } else {
        sendToRenderer(
          'wa:status',
          `Sin cambios · ${incomingOrders.length} pedidos verificados en WhatsApp · ${nowStr}`
        );
      }
      return { inserted, updated, total: stats.total };
    },
  });
}

function registerIpcHandlers() {
  ipcMain.handle('app:getInitialState', async () => {
    const orders = db.getAll();
    const stats = db.getSyncStats();
    const reports = exporter.listReports();
    const settings = readSettings();
    const knownSources = discoverKnownLegacySources().map((s) =>
      db.inspectLegacySource(s.sourceLabel)
    );

    return {
      version: app.getVersion(),
      orders,
      stats,
      reports,
      settings,
      dataDir: DATA_DIR,
      dbPath: DB_PATH,
      reportsDir: REPORTS_DIR,
      backupsDir: BACKUPS_DIR,
      autoMigration: autoMigrationSummary,
      knownLegacySources: knownSources.filter((k) => k && k.ok),
      connection: scraper.getStatusSnapshot(),
      logoDataUrl: readLogoDataUrl(),
    };
  });

  ipcMain.handle('app:saveSettings', async (_e, patch) => {
    return writeSettings(patch || {});
  });

  ipcMain.handle('app:copyToClipboard', async (_e, text) => {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  });

  // ── Pedidos CRUD ───────────────────────────────────────────────────────────
  ipcMain.handle('orders:getAll', async () => {
    return {
      orders: db.getAll(),
      stats: db.getSyncStats(),
    };
  });

  ipcMain.handle('orders:upsert', async (_e, { order, isEdit }) => {
    if (!order || !order.id) {
      return { ok: false, error: 'El ID del pedido es obligatorio.' };
    }
    if (!isEdit) {
      const existing = db.getById(order.id);
      if (existing) {
        return {
          ok: false,
          error: `Ya existe un pedido registrado con el ID "${order.id}".`,
        };
      }
    }
    db.upsertOrders([order]);
    const orders = db.getAll();
    const stats = db.getSyncStats();
    return { ok: true, orders, stats };
  });

  ipcMain.handle('orders:changeState', async (_e, { orderIds, newState }) => {
    if (!Array.isArray(orderIds) || !orderIds.length) {
      return { ok: false, error: 'No se seleccionaron pedidos.' };
    }
    const toUpdate = [];
    for (const id of orderIds) {
      const existing = db.getById(id);
      if (existing) {
        toUpdate.push({ ...existing, estado: newState });
      }
    }
    if (toUpdate.length > 0) {
      db.upsertOrders(toUpdate);
    }
    return {
      ok: true,
      updatedCount: toUpdate.length,
      orders: db.getAll(),
      stats: db.getSyncStats(),
    };
  });

  ipcMain.handle('orders:delete', async (_e, { orderIds }) => {
    const deletedCount = db.deleteOrders(orderIds || []);
    return {
      ok: true,
      deletedCount,
      orders: db.getAll(),
      stats: db.getSyncStats(),
    };
  });

  // ── WhatsApp Business ──────────────────────────────────────────────────────
  ipcMain.handle('wa:connect', async (_e, opts = {}) => {
    return await scraper.connect(opts);
  });

  ipcMain.handle('wa:disconnect', async () => {
    return await scraper.disconnect();
  });

  ipcMain.handle('wa:syncManual', async () => {
    return await scraper.syncOnce();
  });

  ipcMain.handle('wa:toggleAutoSync', async () => {
    if (scraper.autoSyncActive) {
      scraper.stopAutoSync();
    } else {
      scraper.startAutoSync();
      sendToRenderer('wa:status', 'Sincronización automática activa.');
    }
    return scraper.getStatusSnapshot();
  });

  // ── Reportes PDF / Excel ───────────────────────────────────────────────────
  ipcMain.handle('reports:export', async (_e, payload = {}) => {
    const { format, orders, dateFrom, dateTo, openAfter = true } = payload;
    try {
      const res =
        format === 'pdf'
          ? await exporter.toPdf(orders || [], dateFrom, dateTo)
          : await exporter.toExcel(orders || [], dateFrom, dateTo);
      if (res.ok && openAfter && res.filePath) {
        await shell.openPath(res.filePath);
      }
      return {
        ...res,
        reports: exporter.listReports(),
      };
    } catch (err) {
      return { ok: false, message: `Error al generar reporte: ${err.message}` };
    }
  });

  ipcMain.handle('reports:list', async () => {
    return exporter.listReports();
  });

  ipcMain.handle('shell:openPath', async (_e, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, error: 'El archivo ya no existe en disco.' };
    }
    await shell.openPath(filePath);
    return { ok: true };
  });

  ipcMain.handle('shell:showInFolder', async (_e, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { ok: true };
    }
    return { ok: false };
  });

  // ── Migración, Respaldos y Actualización ───────────────────────────────────
  ipcMain.handle('migration:pickSource', async (_e, { mode = 'folder' } = {}) => {
    const properties =
      mode === 'file' ? ['openFile'] : ['openDirectory'];
    const filters =
      mode === 'file'
        ? [{ name: 'Base de datos SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }]
        : [];

    const result = await dialog.showOpenDialog(mainWindow, {
      title:
        mode === 'file'
          ? 'Seleccionar archivo orders.db anterior'
          : 'Seleccionar carpeta anterior de Café Pa\'l Monte',
      properties,
      filters,
    });

    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }
    const targetPath = result.filePaths[0];
    return {
      canceled: false,
      inspection: db.inspectLegacySource(targetPath),
    };
  });

  ipcMain.handle('migration:inspect', async (_e, { targetPath }) => {
    return db.inspectLegacySource(targetPath);
  });

  ipcMain.handle('migration:run', async (_e, { targetPath }) => {
    const res = db.migrateFromSource(targetPath);
    if (!res.ok) return res;
    return {
      ...res,
      orders: db.getAll(),
      stats: db.getSyncStats(),
      reports: exporter.listReports(),
    };
  });

  ipcMain.handle('migration:backup', async () => {
    const backupPath = db.createBackup('usuario');
    if (!backupPath) {
      return { ok: false, error: 'No se pudo crear la copia de seguridad.' };
    }
    return { ok: true, backupPath };
  });

  ipcMain.handle('migration:openDataFolder', async () => {
    await shell.openPath(DATA_DIR);
    return { ok: true };
  });

  ipcMain.handle('updater:check', async () => {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.autoDownload = false;
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo && result.updateInfo.version !== app.getVersion()) {
        return {
          ok: true,
          updateAvailable: true,
          latestVersion: result.updateInfo.version,
          currentVersion: app.getVersion(),
        };
      }
      return {
        ok: true,
        updateAvailable: false,
        currentVersion: app.getVersion(),
        message: `Estás en la versión más reciente (v${app.getVersion()}).`,
      };
    } catch (err) {
      return {
        ok: true,
        updateAvailable: false,
        currentVersion: app.getVersion(),
        message: `Versión actual v${app.getVersion()} activa. También puedes instalar cualquier nueva versión seleccionando el archivo CafePalMonte_Setup.exe.`,
      };
    }
  });

  ipcMain.handle('updater:runWizardFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar instalador de actualización (CafePalMonte_Setup.exe)',
      properties: ['openFile'],
      filters: [{ name: 'Instalador de Windows (.exe)', extensions: ['exe'] }],
    });

    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }

    const installerExe = result.filePaths[0];
    // Crear respaldo preventivo automático antes de actualizar
    const backupPath = db.createBackup('pre_actualizacion');

    if (scraper) {
      await scraper.disconnect();
    }

    // Lanzar el asistente de actualización desacoplado y cerrar esta instancia
    const child = spawn(installerExe, [], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    setTimeout(() => {
      app.quit();
    }, 450);

    return { ok: true, backupPath, launched: installerExe };
  });
}

app.whenReady().then(() => {
  setupServices();
  registerIpcHandlers();
  createWindow();
});

app.on('before-quit', async () => {
  if (scraper) {
    try {
      await scraper.disconnect();
    } catch (_) {}
  }
});

app.on('window-all-closed', async () => {
  if (scraper) {
    try {
      await scraper.disconnect();
    } catch (_) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
