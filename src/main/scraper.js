const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer-core');
const { SESSION_BASE, ensureDataDirs } = require('./paths');

const ESTADO_MAP = {
  'payment requested': 'Pendiente',
  'pago solicitado': 'Pendiente',
  pending: 'Pendiente',
  pendiente: 'Pendiente',
  completed: 'Completado',
  completado: 'Completado',
  delivered: 'Completado',
  entregado: 'Completado',
  cancelled: 'Cancelado',
  canceled: 'Cancelado',
  cancelado: 'Cancelado',
  enviado: 'Enviado',
  shipped: 'Enviado',
  sent: 'Enviado',
  'envío en preparación': 'Envío en preparación',
  'envio en preparacion': 'Envío en preparación',
  'preparing shipment': 'Envío en preparación',
  'shipment in preparation': 'Envío en preparación',
  'preparing to ship': 'Envío en preparación',
};

const WIN_BROWSER_PATHS = {
  edge: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  chrome: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ],
};

function detectBrowser() {
  ensureDataDirs();
  // 1) Preferir navegador que ya tenga carpeta de sesión vinculada
  for (const name of ['edge', 'chrome']) {
    const sessionDir = `${SESSION_BASE}_${name}`;
    const exe = (WIN_BROWSER_PATHS[name] || []).find((p) => p && fs.existsSync(p));
    if (exe && fs.existsSync(sessionDir)) {
      return { name, executablePath: exe, sessionDir };
    }
  }
  // 2) Usar el primer navegador instalado disponible (Edge o Chrome)
  for (const name of ['edge', 'chrome']) {
    const exe = (WIN_BROWSER_PATHS[name] || []).find((p) => p && fs.existsSync(p));
    if (exe) {
      return { name, executablePath: exe, sessionDir: `${SESSION_BASE}_${name}` };
    }
  }
  return null;
}

function killLingeringBrowserForSession(sessionDir) {
  if (process.platform !== 'win32' || !sessionDir) return;
  try {
    const escaped = sessionDir.replace(/'/g, "''");
    const psCmd = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${escaped}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
      timeout: 6000,
      windowsHide: true,
    });
  } catch (_) {}

  for (const lockName of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const lockFile = path.join(sessionDir, lockName);
    try {
      if (fs.existsSync(lockFile)) fs.rmSync(lockFile, { force: true });
    } catch (_) {}
  }
}

class WhatsAppScraperManager {
  constructor({ onStatus, onConnectionState, onQrUpdate, onOrdersSynced } = {}) {
    this.browser = null;
    this.page = null;
    this.connected = false;
    this.connecting = false;
    this.autoSyncActive = false;
    this.autoSyncTimer = null;
    this.qrTimer = null;
    this.browserInfo = null;
    this.showBrowserWindow = false;

    this.onStatus = onStatus || (() => {});
    this.onConnectionState = onConnectionState || (() => {});
    this.onQrUpdate = onQrUpdate || (() => {});
    this.onOrdersSynced = onOrdersSynced || (() => {});
  }

  getStatusSnapshot() {
    return {
      connected: this.connected,
      connecting: this.connecting,
      autoSyncActive: this.autoSyncActive,
      browserName: this.browserInfo ? this.browserInfo.name : null,
    };
  }

  async connect({ visible = false } = {}) {
    if (this.connecting || this.connected) {
      return { ok: true, state: this.connected ? 'connected' : 'waiting' };
    }

    const detected = detectBrowser();
    if (!detected) {
      this.onConnectionState('disconnected');
      return {
        ok: false,
        error: 'No se encontró Microsoft Edge ni Google Chrome instalado en este equipo.',
      };
    }

    this.connecting = true;
    this.browserInfo = detected;
    this.showBrowserWindow = Boolean(visible);
    this.onConnectionState('waiting');
    this.onStatus(`Iniciando motor en ${detected.name.toUpperCase()}...`);

    try {
      await this._disposeBrowser();
      killLingeringBrowserForSession(detected.sessionDir);
      fs.mkdirSync(detected.sessionDir, { recursive: true });

      this.browser = await puppeteer.launch({
        executablePath: detected.executablePath,
        userDataDir: detected.sessionDir,
        headless: visible ? false : 'shell',
        defaultViewport: { width: 1280, height: 900 },
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-blink-features=AutomationControlled',
          '--disable-gpu',
          '--window-size=1280,900',
          '--lang=es-419',
        ],
      });

      this.browser.on('disconnected', () => {
        const wasConnected = this.connected || this.connecting;
        this.connected = false;
        this.connecting = false;
        this._stopTimers();
        if (wasConnected) {
          this.onConnectionState('disconnected');
          this.onStatus('Sesión del navegador cerrada.');
        }
      });

      const pages = await this.browser.pages();
      this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();

      // Evitar que WhatsApp rechace user-agent HeadlessChrome
      const rawUa = await this.page.browser().userAgent();
      const cleanUa = rawUa
        .replace(/HeadlessChrome/gi, 'Chrome')
        .replace(/Electron\/[\d.]+\s*/gi, '');
      await this.page.setUserAgent(cleanUa);

      this.onStatus('Abriendo WhatsApp Business Web...');
      await this.page.goto('https://web.whatsapp.com', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      this._startQrPolling();
      return { ok: true, browser: detected.name };
    } catch (err) {
      await this._disposeBrowser();
      this.connecting = false;
      this.connected = false;
      this.onConnectionState('disconnected');
      this.onStatus(`Error al iniciar navegador: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  _startQrPolling() {
    this._stopQrPolling();
    let attempts = 0;

    const tick = async () => {
      if (!this.connecting || !this.page) return;
      attempts += 1;

      try {
        const linked = await this.isWhatsAppLinked();
        if (linked) {
          this._stopQrPolling();
          this.connecting = false;
          this.connected = true;
          this.onQrUpdate({ linked: true, qrDataUrl: null, statusText: 'Sesión vinculada con éxito.' });
          this.onConnectionState('connected');
          this.onStatus('WhatsApp Business vinculado. Sincronizando pedidos...');
          await this.syncOnce();
          this.startAutoSync();
          return;
        }

        const qrCapture = await this._captureQrDataUrl();
        if (qrCapture && qrCapture.qrDataUrl) {
          this.onQrUpdate({
            linked: false,
            qrDataUrl: qrCapture.qrDataUrl,
            statusText: 'Escanea este código QR desde WhatsApp Business > Dispositivos vinculados.',
          });
          this.onStatus('Esperando escaneo de código QR...');
        } else {
          this.onQrUpdate({
            linked: false,
            qrDataUrl: null,
            statusText: 'Generando código QR de WhatsApp Web...',
          });
        }
      } catch (_) {}

      if (attempts >= 120) {
        this._stopQrPolling();
        await this.disconnect();
        this.onStatus('Tiempo de espera agotado para escanear el código QR.');
        return;
      }

      if (this.connecting) {
        this.qrTimer = setTimeout(tick, 2200);
      }
    };

    tick();
  }

  _stopQrPolling() {
    if (this.qrTimer) {
      clearTimeout(this.qrTimer);
      this.qrTimer = null;
    }
  }

  _stopTimers() {
    this._stopQrPolling();
    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    this.autoSyncActive = false;
  }

  async isWhatsAppLinked() {
    if (!this.page) return false;
    try {
      return await this.page.evaluate(() => {
        const text = (document.body?.innerText || '').toLowerCase();
        const connectedSelectors = [
          '[data-testid="menu-bar-item-business-tools"]',
          '[data-testid="menu-bar-menu"]',
          '#side',
          '#main',
          'div[contenteditable="true"][role="textbox"]',
          'button[aria-label*="Attach"]',
          'button[aria-label*="Adjuntar"]',
          'button[title*="New chat"]',
          'button[title*="Nuevo chat"]',
          '[aria-label="Herramientas"]',
          '[aria-label="Herramientas de empresa"]',
          '[aria-label="Business tools"]',
        ];
        const hasUi = connectedSelectors.some((sel) => Boolean(document.querySelector(sel)));
        if (hasUi) return true;
        const qrPresent = Boolean(
          document.querySelector(
            '[data-testid="link-device-qr-code"] canvas, canvas[aria-label*="QR"], [data-testid="qrcode"] canvas'
          )
        );
        if (qrPresent) return false;
        const tokens = ['herramientas de empresa', 'business tools', 'chats', 'archivados'];
        return tokens.some((t) => text.includes(t)) && Boolean(document.querySelector('header, nav, aside'));
      });
    } catch (_) {
      return false;
    }
  }

  async _captureQrDataUrl() {
    if (!this.page) return null;
    try {
      // Intentar extraer directamente el canvas del QR en alta nitidez
      const canvasDataUrl = await this.page.evaluate(() => {
        const selectors = [
          '[data-testid="link-device-qr-code"] canvas',
          'canvas[aria-label*="QR"]',
          '[data-testid="qrcode"] canvas',
          'canvas[aria-label*="Scan"]',
          'div[data-ref] canvas',
          '.landing-main canvas',
          'canvas',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && typeof el.toDataURL === 'function') {
            const r = el.getBoundingClientRect();
            if (r.width >= 140 && r.height >= 140) {
              try {
                return el.toDataURL('image/png');
              } catch (_) {}
            }
          }
        }
        return null;
      });

      if (canvasDataUrl) {
        return { qrDataUrl: canvasDataUrl };
      }

      // Fallback: captura recortada del elemento QR
      const handle = await this.page.$(
        '[data-testid="link-device-qr-code"], [data-testid="qrcode"], div[data-ref]'
      );
      if (handle) {
        const b64 = await handle.screenshot({ encoding: 'base64' });
        if (b64) {
          return { qrDataUrl: `data:image/png;base64,${b64}` };
        }
      }
    } catch (_) {}
    return null;
  }

  async fetchOrdersFromWhatsApp() {
    if (!this.page || !this.connected) {
      return { ok: false, error: 'WhatsApp no está conectado.', orders: [] };
    }

    this.onStatus('Leyendo pedidos desde WhatsApp Business...');
    try {
      const raw = await this.page.evaluate(async () => {
        try {
          const db = await new Promise((ok, ko) => {
            const r = indexedDB.open('model-storage');
            r.onsuccess = () => ok(r.result);
            r.onerror = () => ko('open-error');
            r.onblocked = () => ko('open-blocked');
            setTimeout(() => ko('open-timeout'), 15000);
          });
          const tx = db.transaction(['message', 'contact', 'chat'], 'readonly');
          const details = [];
          const statuses = [];
          await new Promise((ok, ko) => {
            const c = tx.objectStore('message').openCursor();
            c.onerror = () => ko('cursor-error');
            c.onsuccess = (e) => {
              const cur = e.target.result;
              if (!cur) return ok();
              const v = cur.value;
              if (
                v.type === 'interactive' &&
                (v.nativeFlowName === 'order_details' || v.nativeFlowName === 'order_status')
              ) {
                const idChat = (/^(?:true|false)_([^_]+@[^_]+)_/.exec(String(v.id)) || [])[1];
                const peer = idChat || (v.id.startsWith('true_') ? v.to : v.from);
                const rec = {
                  t: v.t,
                  peer: peer && (peer._serialized || peer),
                  params: ((v.interactivePayload && v.interactivePayload.buttons) || [])
                    .map((b) => b.buttonParamsJson)
                    .filter(Boolean),
                };
                (v.nativeFlowName === 'order_details' ? details : statuses).push(rec);
              }
              cur.continue();
            };
          });

          const get = (store, key) =>
            new Promise((ok) => {
              const r = tx.objectStore(store).get(key);
              r.onsuccess = () => ok(r.result || null);
              r.onerror = () => ok(null);
            });

          const byPhone = (pn) =>
            new Promise((ok) => {
              try {
                const r = tx.objectStore('contact').index('phoneNumber').get(pn);
                r.onsuccess = () => ok(r.result || null);
                r.onerror = () => ok(null);
              } catch (_) {
                ok(null);
              }
            });

          const names = {};
          for (const d of details) {
            if (!d.peer || d.peer in names) continue;
            const ct =
              (await get('contact', d.peer)) ||
              (d.peer.endsWith('@c.us') ? await byPhone(d.peer).catch(() => null) : null);
            const ch = await get('chat', d.peer);
            names[d.peer] =
              (ct && (ct.name || ct.verifiedName || ct.pushname || ct.username)) ||
              (ch && ch.name) ||
              (ct && ct.phoneNumber && '+' + String(ct.phoneNumber).split('@')[0]) ||
              '';
          }
          db.close();
          return { ok: true, details, statuses, names };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      });

      if (!raw || !raw.ok) {
        return {
          ok: false,
          error: (raw && raw.error) || 'No se pudo leer model-storage de WhatsApp Web.',
          orders: [],
        };
      }

      const parseJson = (txt) => {
        try {
          const obj = JSON.parse(txt);
          return obj && typeof obj === 'object' ? obj : null;
        } catch (_) {
          return null;
        }
      };

      const latestStatus = new Map();
      for (const rec of raw.statuses || []) {
        for (const params of rec.params || []) {
          const data = parseJson(params);
          const ref = data && data.reference_id;
          const st = data && data.order && data.order.status;
          if (ref && st) {
            const prev = latestStatus.get(ref);
            if (!prev || rec.t >= prev.t) {
              latestStatus.set(ref, { t: rec.t, status: st });
            }
          }
        }
      }

      const names = raw.names || {};
      const ordersMap = new Map();

      for (const rec of raw.details || []) {
        for (const params of rec.params || []) {
          const data = parseJson(params);
          const ref = data && data.reference_id;
          if (!ref) continue;
          const orderInfo = data.order || {};
          const rawStatus = latestStatus.has(ref)
            ? latestStatus.get(ref).status
            : orderInfo.status || '';
          const items = Array.isArray(orderInfo.items) ? orderInfo.items : [];
          const productoFromItems = items
            .filter((it) => it && it.name)
            .map((it) => {
              const n = String(it.name).trim();
              const q = Number(it.quantity || 1);
              return q > 1 ? `${n} x${q}` : n;
            })
            .join(', ');
          const producto =
            productoFromItems || String(data.additional_note || '').trim() || 'Pedido WhatsApp';
          const total = data.total_amount || orderInfo.subtotal || {};
          const offset = Number(total.offset || 1) || 1;
          const monto = Number(total.value || 0) / offset;

          const dt = new Date(Number(rec.t || 0) * 1000);
          const pad = (n) => String(n).padStart(2, '0');
          const fechaIso = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

          const normKey = String(rawStatus || '')
            .replace(/_/g, ' ')
            .toLowerCase()
            .trim();
          const estado = ESTADO_MAP[normKey] || rawStatus || 'Pendiente';

          ordersMap.set(String(ref), {
            id: String(ref),
            whatsapp_order_id: String(ref),
            cliente: names[rec.peer] || 'Desconocido',
            producto,
            monto: Number.isFinite(monto) ? monto : 0,
            fecha: fechaIso,
            estado,
          });
        }
      }

      const orders = Array.from(ordersMap.values());
      return { ok: true, orders, source: 'indexeddb' };
    } catch (err) {
      return { ok: false, error: err.message, orders: [] };
    }
  }

  async syncOnce() {
    const res = await this.fetchOrdersFromWhatsApp();
    if (!res.ok) {
      this.onStatus(`Aviso de sincronización: ${res.error}`);
      return res;
    }
    const syncResult = await this.onOrdersSynced(res.orders);
    return {
      ok: true,
      fetchedCount: res.orders.length,
      ...(syncResult || {}),
    };
  }

  startAutoSync() {
    if (this.autoSyncActive) return;
    this.autoSyncActive = true;
    this.onConnectionState('connected');

    const loop = async () => {
      if (!this.autoSyncActive || !this.connected) return;
      await this.syncOnce();
      if (this.autoSyncActive && this.connected) {
        this.autoSyncTimer = setTimeout(loop, 8000);
      }
    };
    this.autoSyncTimer = setTimeout(loop, 6000);
  }

  stopAutoSync() {
    this.autoSyncActive = false;
    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    this.onStatus('Sincronización automática en pausa. Modo manual disponible.');
    this.onConnectionState(this.connected ? 'connected' : 'disconnected');
  }

  async disconnect() {
    this._stopTimers();
    this.connected = false;
    this.connecting = false;
    await this._disposeBrowser();
    this.onConnectionState('disconnected');
    this.onStatus('Desconectado de WhatsApp Business.');
    return { ok: true };
  }

  async _disposeBrowser() {
    const b = this.browser;
    this.browser = null;
    this.page = null;
    if (b) {
      try {
        await b.close();
      } catch (_) {}
    }
    if (this.browserInfo && this.browserInfo.sessionDir) {
      killLingeringBrowserForSession(this.browserInfo.sessionDir);
    }
  }
}

module.exports = { WhatsAppScraperManager, detectBrowser };
