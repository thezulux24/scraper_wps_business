const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const {
  DB_PATH,
  REPORTS_DIR,
  BACKUPS_DIR,
  SESSION_BASE,
  ensureDataDirs,
  resolveLegacyFolder,
  discoverKnownLegacySources,
  readSettings,
  writeSettings,
} = require('./paths');

class OrderDatabase {
  constructor(dbPath = DB_PATH) {
    ensureDataDirs();
    this.dbPath = dbPath;
    this._initDb();
  }

  _open(targetPath = this.dbPath) {
    const conn = new DatabaseSync(targetPath);
    conn.exec('PRAGMA journal_mode = WAL;');
    conn.exec('PRAGMA busy_timeout = 5000;');
    return conn;
  }

  _initDb() {
    const conn = this._open();
    try {
      conn.exec(`
        CREATE TABLE IF NOT EXISTS orders (
          id                 TEXT PRIMARY KEY,
          whatsapp_order_id  TEXT UNIQUE,
          cliente            TEXT NOT NULL DEFAULT '',
          producto           TEXT NOT NULL DEFAULT '',
          monto              REAL NOT NULL DEFAULT 0.0,
          fecha              TEXT NOT NULL,
          estado             TEXT NOT NULL DEFAULT 'Desconocido',
          synced_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
      `);

      const cols = conn.prepare('PRAGMA table_info(orders)').all();
      const colNames = new Set(cols.map((c) => c.name));
      if (!colNames.has('whatsapp_order_id')) {
        conn.exec('ALTER TABLE orders ADD COLUMN whatsapp_order_id TEXT;');
      }

      conn.exec('CREATE INDEX IF NOT EXISTS idx_orders_fecha ON orders(fecha);');
      conn.exec('CREATE INDEX IF NOT EXISTS idx_orders_cliente ON orders(cliente);');
      try {
        conn.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_whatsapp_id_unique
          ON orders(whatsapp_order_id);
        `);
      } catch (_) {
        conn.exec(`
          CREATE INDEX IF NOT EXISTS idx_orders_whatsapp_id
          ON orders(whatsapp_order_id);
        `);
      }

      conn.exec(`
        CREATE TABLE IF NOT EXISTS deleted_orders (
          id          TEXT PRIMARY KEY,
          deleted_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
      `);

      conn.exec('PRAGMA user_version = 2;');
    } finally {
      conn.close();
    }
  }

  getAll() {
    const conn = this._open();
    try {
      const rows = conn
        .prepare(
          `SELECT id, whatsapp_order_id, cliente, producto, monto, fecha, estado, synced_at
           FROM orders
           ORDER BY fecha DESC, synced_at DESC`
        )
        .all();
      return rows.map((r) => ({ ...r, monto: Number(r.monto || 0) }));
    } finally {
      conn.close();
    }
  }

  count() {
    const conn = this._open();
    try {
      const row = conn.prepare('SELECT COUNT(*) AS c FROM orders').get();
      return Number(row ? row.c : 0);
    } finally {
      conn.close();
    }
  }

  getById(orderId) {
    const conn = this._open();
    try {
      const row = conn
        .prepare(
          'SELECT id, whatsapp_order_id, cliente, producto, monto, fecha, estado FROM orders WHERE id = ? LIMIT 1'
        )
        .get(String(orderId));
      return row ? { ...row, monto: Number(row.monto || 0) } : null;
    } finally {
      conn.close();
    }
  }

  getSyncStats() {
    const conn = this._open();
    try {
      const total = Number(conn.prepare('SELECT COUNT(*) AS c FROM orders').get()?.c || 0);
      const withWaId = Number(
        conn
          .prepare("SELECT COUNT(*) AS c FROM orders WHERE whatsapp_order_id IS NOT NULL AND whatsapp_order_id != ''")
          .get()?.c || 0
      );
      return {
        total,
        with_whatsapp_id: withWaId,
        without_whatsapp_id: total - withWaId,
        success_rate: total > 0 ? (withWaId / total) * 100 : 0,
      };
    } finally {
      conn.close();
    }
  }

  _findExistingOrderId(conn, orderId, waOrderId) {
    if (waOrderId) {
      const row = conn
        .prepare('SELECT id FROM orders WHERE whatsapp_order_id = ? LIMIT 1')
        .get(String(waOrderId));
      if (row && row.id) return String(row.id);
    }
    const row = conn
      .prepare('SELECT id FROM orders WHERE id = ? LIMIT 1')
      .get(String(orderId));
    return row && row.id ? String(row.id) : null;
  }

  upsertOrders(orders = []) {
    const { inserted, updated } = this._upsert(orders);
    return { inserted, updated, totalAffected: inserted + updated };
  }

  _upsert(orders = []) {
    if (!Array.isArray(orders) || orders.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    let inserted = 0;
    let updated = 0;
    const conn = this._open();
    try {
      conn.exec('BEGIN IMMEDIATE;');
      const selectPrevMonto = conn.prepare('SELECT monto FROM orders WHERE id = ? LIMIT 1');
      const updateStmt = conn.prepare(`
        UPDATE orders
        SET cliente = ?, producto = ?, monto = ?, fecha = ?,
            estado = ?, whatsapp_order_id = ?, synced_at = datetime('now','localtime')
        WHERE id = ?
          AND (cliente IS NOT ? OR producto IS NOT ? OR monto IS NOT ?
               OR fecha IS NOT ? OR estado IS NOT ? OR whatsapp_order_id IS NOT ?)
      `);
      const insertStmt = conn.prepare(`
        INSERT INTO orders (id, whatsapp_order_id, cliente, producto, monto, fecha, estado, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
      `);

      for (const o of orders) {
        const orderId = String(o.id || '').trim();
        const fecha = String(o.fecha || '').trim();
        if (!orderId || !fecha) continue;

        const waOrderId = o.whatsapp_order_id ? String(o.whatsapp_order_id).trim() : null;
        const cliente = String(o.cliente || '').trim() || 'Desconocido';
        const producto = String(o.producto || '').trim() || 'Sin descripcion';
        let monto = Number(o.monto || 0);
        if (!Number.isFinite(monto) || monto < 0) monto = 0;
        const estado = String(o.estado || '').trim() || 'Desconocido';

        const existingId = this._findExistingOrderId(conn, orderId, waOrderId);
        if (existingId) {
          if (monto <= 0) {
            const prevRow = selectPrevMonto.get(existingId);
            const prevMonto = Number(prevRow ? prevRow.monto : 0);
            if (prevMonto > 0) monto = prevMonto;
          }
          const res = updateStmt.run(
            cliente,
            producto,
            monto,
            fecha,
            estado,
            waOrderId,
            existingId,
            cliente,
            producto,
            monto,
            fecha,
            estado,
            waOrderId
          );
          if (res.changes > 0) updated += 1;
        } else {
          insertStmt.run(orderId, waOrderId, cliente, producto, monto, fecha, estado);
          inserted += 1;
        }
      }
      conn.exec('COMMIT;');
    } catch (err) {
      try {
        conn.exec('ROLLBACK;');
      } catch (_) {}
      throw err;
    } finally {
      conn.close();
    }

    return { inserted, updated };
  }

  merge(newOrders = []) {
    if (!Array.isArray(newOrders) || newOrders.length === 0) {
      return { inserted: 0, updated: 0 };
    }
    const conn = this._open();
    let deletedSet = new Set();
    try {
      const rows = conn.prepare('SELECT id FROM deleted_orders').all();
      deletedSet = new Set(rows.map((r) => String(r.id)));
    } finally {
      conn.close();
    }

    const filtered = newOrders.filter(
      (o) => !deletedSet.has(String(o.id || '')) && !deletedSet.has(String(o.whatsapp_order_id || ''))
    );
    return this._upsert(filtered);
  }

  deleteOrders(orderIds = []) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) return 0;
    const conn = this._open();
    try {
      conn.exec('BEGIN IMMEDIATE;');
      const selectRow = conn.prepare('SELECT id, whatsapp_order_id FROM orders WHERE id = ?');
      const markDeleted = conn.prepare('INSERT OR IGNORE INTO deleted_orders (id) VALUES (?)');
      const deleteRow = conn.prepare('DELETE FROM orders WHERE id = ?');

      let deletedCount = 0;
      for (const rawId of orderIds) {
        const id = String(rawId || '').trim();
        if (!id) continue;
        const row = selectRow.get(id);
        if (row) {
          if (row.id) markDeleted.run(String(row.id));
          if (row.whatsapp_order_id) markDeleted.run(String(row.whatsapp_order_id));
        }
        const res = deleteRow.run(id);
        deletedCount += Number(res.changes || 0);
      }
      conn.exec('COMMIT;');
      return deletedCount;
    } catch (err) {
      try {
        conn.exec('ROLLBACK;');
      } catch (_) {}
      throw err;
    } finally {
      conn.close();
    }
  }

  createBackup(label = 'manual') {
    ensureDataDirs();
    if (!fs.existsSync(this.dbPath)) return null;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(BACKUPS_DIR, `orders_backup_${label}_${ts}.db`);
    const conn = this._open();
    try {
      conn.exec('PRAGMA wal_checkpoint(FULL);');
    } catch (_) {
    } finally {
      conn.close();
    }
    fs.copyFileSync(this.dbPath, dest);
    return dest;
  }

  inspectLegacySource(folderOrFile) {
    const resolved = resolveLegacyFolder(folderOrFile);
    if (!resolved) {
      return { ok: false, error: 'No se encontro una base de datos orders.db ni sesion en la ruta seleccionada.' };
    }
    let ordersCount = 0;
    let dateRange = null;
    if (resolved.dbPath && fs.existsSync(resolved.dbPath)) {
      const legacyConn = new DatabaseSync(resolved.dbPath, { open: true });
      try {
        const countRow = legacyConn.prepare('SELECT COUNT(*) AS c, MIN(fecha) AS minF, MAX(fecha) AS maxF FROM orders').get();
        ordersCount = Number(countRow?.c || 0);
        if (countRow?.minF && countRow?.maxF) {
          dateRange = `${countRow.minF} a ${countRow.maxF}`;
        }
      } catch (_) {
        // table might not exist
      } finally {
        legacyConn.close();
      }
    }

    let reportsCount = 0;
    if (resolved.reportsDir && fs.existsSync(resolved.reportsDir)) {
      reportsCount = fs
        .readdirSync(resolved.reportsDir)
        .filter((f) => f.toLowerCase().endsWith('.pdf') || f.toLowerCase().endsWith('.xlsx')).length;
    }

    return {
      ok: true,
      sourceLabel: resolved.sourceLabel,
      dbPath: resolved.dbPath,
      ordersCount,
      dateRange,
      reportsDir: resolved.reportsDir,
      reportsCount,
      sessions: resolved.sessions.map((s) => s.browser),
    };
  }

  migrateFromSource(folderOrFile) {
    const resolved = resolveLegacyFolder(folderOrFile);
    if (!resolved) {
      return {
        ok: false,
        error: 'No se encontraron datos validos (orders.db, reportes o sesion) en la ruta indicada.',
      };
    }

    const backupPath = this.createBackup('pre_migracion');
    let importedOrders = 0;
    let updatedOrders = 0;
    let copiedReports = 0;
    const migratedSessions = [];

    if (resolved.dbPath && fs.existsSync(resolved.dbPath)) {
      if (path.resolve(resolved.dbPath).toLowerCase() !== path.resolve(this.dbPath).toLowerCase()) {
        const legacyConn = new DatabaseSync(resolved.dbPath);
        let legacyOrders = [];
        let legacyDeleted = [];
        try {
          const cols = legacyConn.prepare('PRAGMA table_info(orders)').all();
          const hasWaId = cols.some((c) => c.name === 'whatsapp_order_id');
          if (hasWaId) {
            legacyOrders = legacyConn
              .prepare('SELECT id, whatsapp_order_id, cliente, producto, monto, fecha, estado FROM orders')
              .all();
          } else {
            legacyOrders = legacyConn
              .prepare('SELECT id, NULL AS whatsapp_order_id, cliente, producto, monto, fecha, estado FROM orders')
              .all();
          }
          try {
            legacyDeleted = legacyConn.prepare('SELECT id FROM deleted_orders').all();
          } catch (_) {}
        } finally {
          legacyConn.close();
        }

        if (legacyDeleted.length > 0) {
          const conn = this._open();
          try {
            const stmt = conn.prepare('INSERT OR IGNORE INTO deleted_orders (id) VALUES (?)');
            for (const d of legacyDeleted) {
              if (d.id) stmt.run(String(d.id));
            }
          } finally {
            conn.close();
          }
        }

        if (legacyOrders.length > 0) {
          const res = this._upsert(legacyOrders);
          importedOrders = res.inserted;
          updatedOrders = res.updated;
        }
      }
    }

    if (resolved.reportsDir && fs.existsSync(resolved.reportsDir)) {
      ensureDataDirs();
      const files = fs.readdirSync(resolved.reportsDir);
      for (const fname of files) {
        if (!fname.toLowerCase().endsWith('.pdf') && !fname.toLowerCase().endsWith('.xlsx')) continue;
        const srcFile = path.join(resolved.reportsDir, fname);
        const dstFile = path.join(REPORTS_DIR, fname);
        if (!fs.existsSync(dstFile)) {
          fs.copyFileSync(srcFile, dstFile);
          copiedReports += 1;
        }
      }
    }

    for (const s of resolved.sessions || []) {
      const targetSession = `${SESSION_BASE}_${s.browser}`;
      if (!fs.existsSync(targetSession) && fs.existsSync(s.path)) {
        try {
          fs.cpSync(s.path, targetSession, { recursive: true });
          migratedSessions.push(s.browser);
        } catch (_) {
          // Session might be locked by an open browser
        }
      }
    }

    return {
      ok: true,
      sourceLabel: resolved.sourceLabel,
      backupPath,
      importedOrders,
      updatedOrders,
      totalInDb: this.count(),
      copiedReports,
      migratedSessions,
    };
  }

  autoMigrateIfNeeded() {
    const settings = readSettings();
    const currentCount = this.count();
    if (settings.autoMigratedOnce && currentCount > 0) {
      return { ran: false, totalInDb: currentCount };
    }

    const candidates = discoverKnownLegacySources();
    const summary = {
      ran: true,
      sourcesChecked: candidates.length,
      importedOrders: 0,
      updatedOrders: 0,
      copiedReports: 0,
      migratedSessions: [],
      sourcesUsed: [],
    };

    for (const cand of candidates) {
      const res = this.migrateFromSource(cand.sourceLabel);
      if (res.ok && (res.importedOrders > 0 || res.updatedOrders > 0 || res.copiedReports > 0 || res.migratedSessions.length > 0)) {
        summary.importedOrders += res.importedOrders;
        summary.updatedOrders += res.updatedOrders;
        summary.copiedReports += res.copiedReports;
        summary.migratedSessions.push(...res.migratedSessions);
        summary.sourcesUsed.push(cand.sourceLabel);
      }
    }

    writeSettings({ autoMigratedOnce: true, lastAutoMigrationAt: new Date().toISOString() });
    summary.totalInDb = this.count();
    return summary;
  }
}

module.exports = { OrderDatabase };
