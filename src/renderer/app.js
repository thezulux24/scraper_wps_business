/* ==========================================================================
   Café Pa'l Monte · Lógica de Interfaz de Escritorio (Renderer v2)
   Framed Sheet Architecture · SVG Charts · Inspector Drawer · SQLite WAL
   ========================================================================== */

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const MESES_CORTOS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const PAID_STATES = new Set([
  'Completado',
  'Enviado',
  'Envío en preparación',
  'Entregado',
]);

const state = {
  version: '2.0.0',
  theme: 'light',
  currentView: 'panel',
  dashboardLayout: 'full', // 'full' | 'table'
  ovChartMetric: 'revenue', // 'revenue' | 'orders'
  ovChartGroup: 'date', // 'date' | 'month'
  ovSideTab: 'states', // 'states' | 'products' | 'clients'
  periodPreset: 'all',
  orders: [],
  periodOrders: [],
  filteredOrders: [],
  selectedIds: new Set(),
  sortCol: 'fecha',
  sortDesc: true,
  stateFilter: 'ALL',
  searchQuery: '',
  dateFrom: '',
  dateTo: '',
  reports: [],
  stats: { total: 0, with_whatsapp_id: 0, without_whatsapp_id: 0, success_rate: 0 },
  dataDir: '',
  dbPath: '',
  reportsDir: '',
  knownLegacySources: [],
  pendingMigrationPath: null,
  editingOrder: null,
  inspectingOrderId: null,
  contextMenuOrderId: null,
  confirmActionCallback: null,
  topCustomersSnapshot: [],
  clientSummaryMap: new Map(),
  catalogProducts: [],
  monthlyGoal: 2500000,
  crmFilter: 'all',
  crmSearchQuery: '',
  connection: {
    connected: false,
    connecting: false,
    autoSyncActive: false,
  },
};

// Fallback API si se abre fuera de Electron para pruebas de navegador
const api = window.cafeApi || {
  getInitialState: async () => ({
    version: '2.0.0',
    orders: [],
    stats: { total: 0, with_whatsapp_id: 0, without_whatsapp_id: 0, success_rate: 0 },
    reports: [],
    settings: { theme: 'light' },
    dataDir: '%LOCALAPPDATA%\\CafePalMonte',
    dbPath: '%LOCALAPPDATA%\\CafePalMonte\\orders.db',
    reportsDir: '%LOCALAPPDATA%\\CafePalMonte\\reportes',
    knownLegacySources: [],
    connection: { connected: false, connecting: false, autoSyncActive: false },
  }),
  saveSettings: async () => ({}),
  copyToClipboard: async (txt) => navigator.clipboard?.writeText(txt),
  getOrders: async () => ({ orders: state.orders, stats: state.stats }),
  upsertOrder: async (order) => {
    const idx = state.orders.findIndex((o) => o.id === order.id);
    if (idx >= 0) state.orders[idx] = order;
    else state.orders.unshift(order);
    return { ok: true, orders: state.orders, stats: { total: state.orders.length, with_whatsapp_id: 0 } };
  },
  changeOrdersState: async (ids, newState) => {
    const set = new Set(ids);
    state.orders = state.orders.map((o) => (set.has(o.id) ? { ...o, estado: newState } : o));
    return { ok: true, updatedCount: ids.length, orders: state.orders, stats: state.stats };
  },
  deleteOrders: async (ids) => {
    const set = new Set(ids);
    state.orders = state.orders.filter((o) => !set.has(o.id));
    return { ok: true, deletedCount: ids.length, orders: state.orders, stats: state.stats };
  },
  connectWhatsApp: async () => ({ ok: true }),
  disconnectWhatsApp: async () => ({ ok: true }),
  syncManual: async () => ({ ok: true }),
  toggleAutoSync: async () => ({ connected: true, autoSyncActive: !state.connection.autoSyncActive }),
  exportReport: async () => ({ ok: true, message: 'Reporte generado.' }),
  exportOrderReceipt: async () => ({ ok: true, message: 'Remisión PDF generada.' }),
  listReports: async () => [],
  openFile: async () => ({ ok: true }),
  showInFolder: async () => ({ ok: true }),
  pickLegacySource: async () => ({ canceled: true }),
  migrateFromPath: async () => ({ ok: true, importedOrders: 0, updatedOrders: 0, orders: state.orders }),
  seedDemoData: async () => ({ ok: true, orders: state.orders }),
  createBackup: async () => ({ ok: true, backupPath: 'backup.db' }),
  openDataFolder: async () => ({ ok: true }),
  checkForUpdates: async () => ({ ok: true, updateAvailable: false, message: 'Versión v2.0.0 al día.' }),
  runUpdateWizardFile: async () => ({ canceled: true }),
  runUninstallerWizard: async () => ({ ok: true }),
  getInstallStatus: async () => ({
    installed: false,
    installDir: 'C:\\Users\\USER\\AppData\\Local\\Programs\\CafePalMonte',
  }),
  pickInstallFolder: async () => ({ canceled: true }),
  runSetupWizardInstall: async () => ({
    ok: true,
    installDir: 'C:\\Users\\USER\\AppData\\Local\\Programs\\CafePalMonte',
  }),
  onWizardProgress: () => {},
  onStatus: () => {},
  onConnectionState: () => {},
  onQrUpdate: () => {},
  onOrdersUpdated: () => {},
};

// ── Utilidades de Formato y Presentación ─────────────────────────────────────
function formatMoney(value) {
  const num = Number(value || 0);
  return (
    '$' +
    num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatMoneyCompact(value) {
  const num = Math.round(Number(value || 0));
  return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatShortDate(isoStr) {
  if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return '';
  const [y, m, d] = isoStr.split('-').map(Number);
  return `${d} ${MESES_CORTOS[m - 1]?.toLowerCase() || ''} ${y}`;
}

function escapeHtml(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getBadgeClass(estado) {
  const norm = String(estado || '').toLowerCase();
  if (norm === 'completado' || norm === 'entregado') return 'badge-paid';
  if (norm === 'pendiente') return 'badge-pending';
  if (norm === 'cancelado') return 'badge-cancelled';
  if (norm === 'enviado') return 'badge-enviado';
  if (norm.includes('preparaci')) return 'badge-prep';
  return 'badge-pending';
}

// Identidad cromática suave por cliente (app-screens.md §2.3)
const AVATAR_PALETTES_LIGHT = [
  { bg: '#E6F4EA', fg: '#135228' },
  { bg: '#FCE8E6', fg: '#8C1D18' },
  { bg: '#E8F0FE', fg: '#174EA6' },
  { bg: '#FEF3C7', fg: '#78350F' },
  { bg: '#F3E8FD', fg: '#5B21B6' },
  { bg: '#E0F2F1', fg: '#004D40' },
];

const AVATAR_PALETTES_DARK = [
  { bg: '#143321', fg: '#6EE7B7' },
  { bg: '#3B1818', fg: '#FCA5A5' },
  { bg: '#172B4D', fg: '#93C5FD' },
  { bg: '#382810', fg: '#FCD34D' },
  { bg: '#2B1B42', fg: '#D8B4FE' },
  { bg: '#11302E', fg: '#5EEAD4' },
];

function getCustomerAvatarData(rawName) {
  const clean = String(rawName || 'Cliente')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : (clean.slice(0, 2) || 'CL').toUpperCase();

  let hash = 0;
  const key = String(rawName || '');
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const paletteSet = state.theme === 'dark' ? AVATAR_PALETTES_DARK : AVATAR_PALETTES_LIGHT;
  const pal = paletteSet[hash % paletteSet.length];
  return { initials, bg: pal.bg, fg: pal.fg };
}

function rebuildClientSummaryMap() {
  const map = new Map();
  for (const o of state.orders) {
    const key = o.cliente || 'Cliente';
    const cur = map.get(key) || {
      name: key,
      count: 0,
      paidCount: 0,
      paidRevenue: 0,
      pendingCount: 0,
      pendingAmount: 0,
      firstDate: '',
      lastDate: '',
      prodCounts: new Map(),
    };
    cur.count += 1;
    const monto = Number(o.monto || 0);
    if (PAID_STATES.has(o.estado)) {
      cur.paidCount += 1;
      cur.paidRevenue += monto;
    } else if (o.estado === 'Pendiente') {
      cur.pendingCount += 1;
      cur.pendingAmount += monto;
    }
    if (!cur.firstDate || o.fecha < cur.firstDate) cur.firstDate = o.fecha;
    if (!cur.lastDate || o.fecha > cur.lastDate) cur.lastDate = o.fecha;
    if (o.producto) {
      cur.prodCounts.set(o.producto, (cur.prodCounts.get(o.producto) || 0) + 1);
    }
    map.set(key, cur);
  }
  state.clientSummaryMap = map;

  // Poblar datalist de autocompletado de clientes y selector en reportes personalizados
  const clientNames = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'es'));
  const dl = document.getElementById('clients-datalist');
  if (dl) {
    dl.innerHTML = clientNames.map((n) => `<option value="${escapeHtml(n)}"></option>`).join('');
  }
  const repCliSel = document.getElementById('rep-custom-client');
  if (repCliSel) {
    const prevVal = repCliSel.value || 'ALL';
    repCliSel.innerHTML =
      `<option value="ALL">Todos los clientes (${clientNames.length})</option>` +
      clientNames.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    if (clientNames.includes(prevVal) || prevVal === 'ALL') {
      repCliSel.value = prevVal;
    }
  }
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3600);
}

function setStatusText(text) {
  const statusEl = document.getElementById('statusbar-text');
  const waSub = document.getElementById('wa-status-sub');
  if (statusEl) statusEl.textContent = text;
  if (waSub) waSub.textContent = text;
}

// ── Tema Claro / Oscuro ──────────────────────────────────────────────────────
function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  state.theme = next;
  document.documentElement.setAttribute('data-theme', next);
  const lbl = document.getElementById('theme-toggle-label');
  if (lbl) {
    lbl.textContent = next === 'dark' ? 'Oscuro' : 'Claro';
  }
  if (state.orders.length) {
    renderOrdersTable();
    renderOverviewDashboard(state.periodOrders);
    if (state.currentView === 'analytics') renderAnalytics();
  }
}

// ── Inicialización de Selectores de Fecha ────────────────────────────────────
function initDateControls() {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  const quickMonth = document.getElementById('filter-quick-month');
  const quickYear = document.getElementById('filter-quick-year');
  const anYear = document.getElementById('an-year-select');
  const anMonth = document.getElementById('an-month-select');

  if (quickMonth) {
    quickMonth.innerHTML = MESES.map(
      (m, idx) => `<option value="${idx + 1}" ${idx === curMonth ? 'selected' : ''}>${m}</option>`
    ).join('');
  }

  const yearsList = [];
  for (let y = curYear; y >= curYear - 5; y -= 1) {
    yearsList.push(y);
  }

  if (quickYear) {
    quickYear.innerHTML = yearsList.map((y) => `<option value="${y}">${y}</option>`).join('');
  }
  if (anYear) {
    anYear.innerHTML = yearsList.map((y) => `<option value="${y}">${y}</option>`).join('');
  }
  if (anMonth) {
    anMonth.innerHTML =
      `<option value="ALL">Todos los meses</option>` +
      MESES.map((m, idx) => `<option value="${idx + 1}">${m}</option>`).join('');
  }

  state.dateFrom = `${curYear}-01-01`;
  state.dateTo = todayIso();

  const inputFrom = document.getElementById('filter-date-from');
  const inputTo = document.getElementById('filter-date-to');
  if (inputFrom) inputFrom.value = state.dateFrom;
  if (inputTo) inputTo.value = state.dateTo;

  const topbarDate = document.getElementById('topbar-date');
  if (topbarDate) {
    topbarDate.textContent =
      'Hoy, ' +
      now.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
  }
}

function adjustDefaultDateRangeToOrders() {
  if (!state.orders.length) return;
  const dates = state.orders.map((o) => o.fecha).filter(Boolean).sort();
  if (!dates.length) return;
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const today = todayIso();

  state.dateFrom = minDate < state.dateFrom ? minDate : state.dateFrom;
  state.dateTo = maxDate > today ? maxDate : today;

  const inputFrom = document.getElementById('filter-date-from');
  const inputTo = document.getElementById('filter-date-to');
  if (inputFrom) inputFrom.value = state.dateFrom;
  if (inputTo) inputTo.value = state.dateTo;
}

// ── Navegación entre Vistas ──────────────────────────────────────────────────
function switchView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });

  if (viewName === 'panel') {
    renderOverviewDashboard(state.periodOrders);
  } else if (viewName === 'clients') {
    renderClientsView();
  } else if (viewName === 'analytics') {
    renderAnalytics();
  } else if (viewName === 'reports') {
    initCustomReportDates();
    renderReportsList();
  } else if (viewName === 'system') {
    renderSystemView();
  }
}

// ── Filtrado, Ordenamiento y Renderizado del Panel ───────────────────────────
function applyFiltersAndRender() {
  rebuildClientSummaryMap();

  const fromVal = document.getElementById('filter-date-from')?.value || '0000-01-01';
  const toVal = document.getElementById('filter-date-to')?.value || '9999-12-31';
  state.dateFrom = fromVal;
  state.dateTo = toVal;

  const query = state.searchQuery.trim().toLowerCase();

  // 1) Filtrar por rango de fecha y búsqueda para KPIs y gráficas del periodo
  const periodOrders = state.orders.filter((o) => {
    const inDate = o.fecha >= fromVal && o.fecha <= toVal;
    if (!inDate) return false;
    if (query) {
      const hay = `${o.id} ${o.cliente} ${o.producto} ${o.estado}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  state.periodOrders = periodOrders;
  updatePanelKpisAndFinding(periodOrders);
  renderOverviewDashboard(periodOrders);

  // 2) Filtrar por estado seleccionado
  const visible = periodOrders.filter((o) => {
    if (state.stateFilter === 'ALL') return true;
    if (state.stateFilter === 'PAID') return PAID_STATES.has(o.estado);
    return o.estado === state.stateFilter;
  });

  // 3) Ordenar según columna activa
  visible.sort((a, b) => {
    const col = state.sortCol;
    let cmp = 0;
    if (col === 'monto') {
      cmp = Number(a.monto || 0) - Number(b.monto || 0);
    } else {
      cmp = String(a[col] || '').localeCompare(String(b[col] || ''), 'es', { numeric: true });
    }
    return state.sortDesc ? -cmp : cmp;
  });

  state.filteredOrders = visible;

  const visibleIds = new Set(visible.map((o) => o.id));
  for (const id of Array.from(state.selectedIds)) {
    if (!visibleIds.has(id)) state.selectedIds.delete(id);
  }

  renderOrdersTable();
  updateNavBadge();
}

function updateNavBadge() {
  const badge = document.getElementById('nav-orders-badge');
  if (badge) badge.textContent = String(state.orders.length);

  const clientsBadge = document.getElementById('nav-clients-badge');
  if (clientsBadge) {
    clientsBadge.textContent = String(state.clientSummaryMap.size);
  }

  const statusRight = document.getElementById('statusbar-db-summary');
  if (statusRight) {
    statusRight.textContent = `${state.orders.length} pedidos · ${state.clientSummaryMap.size} clientes en SQLite WAL`;
  }

  if (state.currentView === 'clients') {
    renderClientsView();
  }
}

function updatePanelKpisAndFinding(periodOrders) {
  const paidOrders = periodOrders.filter((o) => PAID_STATES.has(o.estado));
  const pendingOrders = periodOrders.filter((o) => o.estado === 'Pendiente');
  const cancelledOrders = periodOrders.filter((o) => o.estado === 'Cancelado');

  const totalRevenue = paidOrders.reduce((acc, o) => acc + Number(o.monto || 0), 0);
  const grossRevenue = periodOrders.reduce((acc, o) => acc + Number(o.monto || 0), 0);
  const pendingAmount = pendingOrders.reduce((acc, o) => acc + Number(o.monto || 0), 0);
  const cancelledAmount = cancelledOrders.reduce((acc, o) => acc + Number(o.monto || 0), 0);
  const avgTicket = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;
  const paidSharePct = periodOrders.length > 0 ? ((paidOrders.length / periodOrders.length) * 100).toFixed(0) : '0';

  document.getElementById('kpi-total-revenue').textContent = formatMoney(totalRevenue);
  document.getElementById('kpi-ticket-avg').textContent = `Ticket promedio: ${formatMoney(avgTicket)}`;
  document.getElementById('kpi-count-total').textContent = String(periodOrders.length);
  document.getElementById('kpi-count-paid').textContent = String(paidOrders.length);
  document.getElementById('kpi-count-pending').textContent = String(pendingOrders.length);
  document.getElementById('kpi-count-cancelled').textContent = String(cancelledOrders.length);

  const grossSub = document.getElementById('kpi-gross-sub');
  if (grossSub) grossSub.textContent = `Volumen bruto: ${formatMoney(grossRevenue)}`;

  const paidShareEl = document.getElementById('kpi-paid-share');
  if (paidShareEl) paidShareEl.textContent = `${paidSharePct}% del total de órdenes`;

  const pendSub = document.getElementById('kpi-pending-amount');
  if (pendSub) {
    pendSub.textContent = pendingOrders.length > 0 ? `${formatMoney(pendingAmount)} por cobrar` : 'Sin cobros pendientes';
  }

  const cancSub = document.getElementById('kpi-cancelled-amount');
  if (cancSub) {
    cancSub.textContent = cancelledOrders.length > 0 ? `${formatMoney(cancelledAmount)} excluidos` : '0 descartadas';
  }

  // Hallazgo ejecutivo en la primera línea bajo el título (app-screens.md §2.2)
  const findingEl = document.getElementById('overview-finding');
  if (findingEl) {
    if (!periodOrders.length) {
      findingEl.textContent = 'Sin órdenes en el rango seleccionado. Amplía las fechas o sincroniza WhatsApp Business.';
    } else {
      const parts = [
        `Facturación neta de <strong>${formatMoney(totalRevenue)}</strong> en <strong>${paidOrders.length} orden(es) aprobada(s)</strong>`,
      ];
      if (pendingOrders.length > 0) {
        parts.push(`<strong>${pendingOrders.length} pendiente(s)</strong> por ${formatMoney(pendingAmount)}`);
      }
      if (cancelledOrders.length > 0) {
        parts.push(`${cancelledOrders.length} cancelada(s) (${formatMoney(cancelledAmount)})`);
      }
      findingEl.innerHTML = parts.join(' · ');
    }
  }

  document.querySelectorAll('.metric-tile').forEach((tile) => {
    const isSelected = tile.dataset.stateFilter === state.stateFilter;
    tile.classList.toggle('active', isSelected);
    tile.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  });
}

// ── Visualización Interactiva del Dashboard Principal ────────────────────────
function renderOverviewDashboard(periodOrders) {
  const gridEl = document.getElementById('overview-charts-grid');
  if (!gridEl) return;

  if (state.dashboardLayout === 'table') {
    gridEl.classList.add('hidden');
    return;
  }
  gridEl.classList.remove('hidden');

  renderOverviewMainChart(periodOrders);
  renderOverviewSidePanel(periodOrders);
}

function renderOverviewMainChart(periodOrders) {
  const host = document.getElementById('ov-main-chart');
  const titleEl = document.getElementById('ov-chart-title');
  const subEl = document.getElementById('ov-chart-sub');
  if (!host || !window.Charts) return;

  const isRev = state.ovChartMetric === 'revenue';
  const byMonth = state.ovChartGroup === 'month';

  const sourceOrders = isRev
    ? periodOrders.filter((o) => PAID_STATES.has(o.estado))
    : periodOrders.filter((o) => o.estado !== 'Cancelado');

  if (titleEl) {
    titleEl.textContent = isRev
      ? 'Pulso de facturación aprobada'
      : 'Volumen de pedidos activos';
  }

  if (!sourceOrders.length) {
    if (subEl) subEl.textContent = 'Sin registros activos en el rango actual';
    host.innerHTML = `<div class="empty-state" style="margin:0;min-height:165px"><h3>Sin datos para graficar en este rango</h3><p>Selecciona "Todo" en los atajos de periodo o sincroniza nuevas órdenes desde WhatsApp Business.</p></div>`;
    return;
  }

  const buckets = new Map();
  for (const o of sourceOrders) {
    const rawDate = String(o.fecha || '');
    if (!rawDate) continue;
    const key = byMonth ? rawDate.slice(0, 7) : rawDate;
    const prev = buckets.get(key) || 0;
    buckets.set(key, prev + (isRev ? Number(o.monto || 0) : 1));
  }

  const sortedKeys = Array.from(buckets.keys()).sort();
  const labels = sortedKeys.map((k) => {
    if (byMonth) {
      const [y, m] = k.split('-').map(Number);
      return `${MESES_CORTOS[(m || 1) - 1]} ${String(y).slice(-2)}`;
    }
    const [, m, d] = k.split('-').map(Number);
    return `${d} ${MESES_CORTOS[(m || 1) - 1]}`;
  });
  const values = sortedKeys.map((k) => buckets.get(k));
  const totalVal = values.reduce((a, b) => a + b, 0);
  const avgVal = values.length > 0 ? totalVal / values.length : 0;
  const maxVal = Math.max(...values, 0);
  const maxIdx = values.indexOf(maxVal);

  if (subEl) {
    subEl.textContent = isRev
      ? `${sortedKeys.length} ${byMonth ? 'mes(es)' : 'fecha(s)'} con actividad · Total aprobado: ${formatMoney(totalVal)} · Promedio: ${formatMoney(avgVal)}`
      : `${sortedKeys.length} ${byMonth ? 'mes(es)' : 'fecha(s)'} con pedidos · Total: ${totalVal} pedido(s)`;
  }

  const fmtFn = isRev ? formatMoneyCompact : Charts.fmt.int;
  const refObj =
    values.length >= 2 && avgVal > 0
      ? { value: avgVal, label: `Prom. ${fmtFn(avgVal)}` }
      : null;

  if (values.length > 14) {
    Charts.line(host, {
      labels,
      series: [{ name: isRev ? 'Ingresos' : 'Pedidos', values }],
      format: fmtFn,
      height: 134,
      fill: true,
      reference: refObj,
      endLabel: true,
    });
  } else {
    Charts.bars(host, {
      labels,
      values,
      format: fmtFn,
      height: 134,
      highlight: maxIdx >= 0 ? maxIdx : null,
      reference: refObj,
    });
  }
}

function renderOverviewSidePanel(periodOrders) {
  const container = document.getElementById('ov-side-content');
  const titleEl = document.getElementById('ov-side-title');
  const subEl = document.getElementById('ov-side-sub');
  if (!container) return;

  if (!periodOrders.length) {
    container.innerHTML = `<div class="empty-state" style="margin:0;min-height:130px"><p>No hay órdenes en este periodo.</p></div>`;
    return;
  }

  if (state.ovSideTab === 'states') {
    if (titleEl) titleEl.textContent = 'Composición';
    if (subEl) subEl.textContent = `${periodOrders.length} orden(es) en periodo`;

    const groups = [
      { label: 'Completado / Entregado', match: (s) => s === 'Completado' || s === 'Entregado', tone: 'pos' },
      { label: 'Enviado / En preparación', match: (s) => s === 'Enviado' || String(s).includes('preparaci'), tone: 'info' },
      { label: 'Pendiente de cobro', match: (s) => s === 'Pendiente', tone: 'warn' },
      { label: 'Cancelado (excluido)', match: (s) => s === 'Cancelado', tone: 'neg' },
    ];

    const totalOrders = periodOrders.length || 1;
    const rowsHtml = groups
      .map((g) => {
        const subset = periodOrders.filter((o) => g.match(o.estado));
        const sum = subset.reduce((a, o) => a + Number(o.monto || 0), 0);
        const pct = Math.round((subset.length / totalOrders) * 100);
        return `
          <div class="breakdown-row">
            <div class="breakdown-row-top">
              <span class="breakdown-name">
                <span class="kpi-dot ${g.tone === 'info' ? 'pos' : g.tone}"></span>
                <span>${escapeHtml(g.label)}</span>
              </span>
              <span class="breakdown-figures">
                ${formatMoney(sum)} <small>· ${subset.length} (${pct}%)</small>
              </span>
            </div>
            <div class="breakdown-track">
              <div class="breakdown-fill ${g.tone}" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      })
      .join('');

    const approvedSum = periodOrders
      .filter((o) => PAID_STATES.has(o.estado))
      .reduce((a, o) => a + Number(o.monto || 0), 0);

    container.innerHTML = `
      <div class="breakdown-list">${rowsHtml}</div>
      <div class="breakdown-footer">
        <span>Total neto aprobado (cierre contable)</span>
        <strong style="color:var(--text)">${formatMoney(approvedSum)}</strong>
      </div>
    `;
    return;
  }

  const paidOrders = periodOrders.filter((o) => PAID_STATES.has(o.estado));
  if (!paidOrders.length) {
    container.innerHTML = `<div class="empty-state" style="margin:0;min-height:150px"><p>No hay ventas aprobadas en este periodo.</p></div>`;
    return;
  }

  if (state.ovSideTab === 'products') {
    if (titleEl) titleEl.textContent = 'Top productos (aprobados)';
    if (subEl) subEl.textContent = 'Ordenados por facturación neta';
    const map = accumulateProductMap(paidOrders);
    const rows = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));
    Charts.barList(container, rows, { format: formatMoney, thin: true });
    return;
  }

  if (state.ovSideTab === 'clients') {
    if (titleEl) titleEl.textContent = 'Clientes principales';
    if (subEl) subEl.textContent = 'Mayor compra aprobada en el periodo';
    const map = new Map();
    for (const o of paidOrders) {
      map.set(o.cliente, (map.get(o.cliente) || 0) + Number(o.monto || 0));
    }
    const rows = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));
    Charts.barList(container, rows, { format: formatMoney, thin: true });
    return;
  }

  if (state.ovSideTab === 'goal') {
    const now = new Date();
    const curMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthName = MESES[now.getMonth()];
    const monthPaid = state.orders
      .filter((o) => String(o.fecha || '').startsWith(curMonthPrefix) && PAID_STATES.has(o.estado))
      .reduce((acc, o) => acc + Number(o.monto || 0), 0);
    const goal = Math.max(10000, Number(state.monthlyGoal || 2500000));
    const pct = Math.min(100, Math.round((monthPaid / goal) * 100));
    const rawPct = ((monthPaid / goal) * 100).toFixed(1);
    const remaining = Math.max(0, goal - monthPaid);

    if (titleEl) titleEl.textContent = `Meta de ${monthName}`;
    if (subEl) subEl.textContent = `${rawPct}% cumplido · Meta: ${formatMoney(goal)}`;

    container.innerHTML = `
      <div class="breakdown-list">
        <div class="breakdown-row">
          <div class="breakdown-row-top">
            <span class="breakdown-name">
              <span class="kpi-dot pos"></span>
              <span>Facturado en ${escapeHtml(monthName)}</span>
            </span>
            <span class="breakdown-figures">${formatMoney(monthPaid)} <small>(${rawPct}%)</small></span>
          </div>
          <div class="breakdown-track" style="height:8px">
            <div class="breakdown-fill pos" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="breakdown-row">
          <div class="breakdown-row-top">
            <span class="breakdown-name">
              <span class="kpi-dot ${remaining > 0 ? 'warn' : 'pos'}"></span>
              <span>${remaining > 0 ? 'Faltante para alcanzar meta' : 'Meta mensual superada'}</span>
            </span>
            <span class="breakdown-figures">${remaining > 0 ? formatMoney(remaining) : '+' + formatMoney(monthPaid - goal)}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:4px">
          <input type="number" id="input-monthly-goal" class="input-control" style="height:28px;font-size:12px;flex:1" value="${goal}" min="10000" step="50000" aria-label="Meta mensual en pesos" />
          <button type="button" class="btn btn-outline btn-sm" id="btn-save-monthly-goal" style="height:28px">Actualizar meta</button>
        </div>
      </div>
    `;

    document.getElementById('btn-save-monthly-goal')?.addEventListener('click', async () => {
      const val = Number(document.getElementById('input-monthly-goal')?.value || 0);
      if (val >= 10000) {
        state.monthlyGoal = val;
        await api.saveSettings({ monthlyGoal: val });
        renderOverviewSidePanel(state.periodOrders);
        showToast(`Meta mensual actualizada a ${formatMoney(val)}.`);
      }
    });
  }
}

// ── Renderizado de Tabla de Órdenes (app-screens.md §7) ──────────────────────
function renderOrdersTable() {
  const tbody = document.getElementById('orders-tbody');
  const emptyState = document.getElementById('orders-empty-state');
  const countSummary = document.getElementById('table-count-summary');
  const chkAll = document.getElementById('chk-select-all');

  if (countSummary) {
    countSummary.textContent = `${state.filteredOrders.length} resultado(s) en vista · ${state.orders.length} total en base de datos`;
  }

  ['id', 'cliente', 'producto', 'fecha', 'monto', 'estado'].forEach((col) => {
    const ind = document.getElementById(`sort-ind-${col}`);
    if (ind) {
      ind.textContent = state.sortCol === col ? (state.sortDesc ? '▼' : '▲') : '';
    }
  });

  if (!state.filteredOrders.length) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
    if (chkAll) chkAll.checked = false;
    updateBulkBar();
    return;
  }

  emptyState.classList.add('hidden');

  tbody.innerHTML = state.filteredOrders
    .map((o) => {
      const isSelected = state.selectedIds.has(o.id);
      const checked = isSelected ? 'checked' : '';
      const badgeCls = getBadgeClass(o.estado);
      const isCancelled = o.estado === 'Cancelado';
      const av = getCustomerAvatarData(o.cliente);
      const cliSummary = state.clientSummaryMap.get(o.cliente) || { count: 1, paidRevenue: 0 };
      const cliSubText =
        cliSummary.count > 1
          ? `${cliSummary.count} pedidos · ${formatMoneyCompact(cliSummary.paidRevenue)} aprob.`
          : '1 pedido registrado';

      return `
        <tr data-order-id="${escapeHtml(o.id)}" class="${isSelected ? 'selected' : ''}">
          <td class="col-check">
            <input
              type="checkbox"
              class="row-select-chk"
              data-order-id="${escapeHtml(o.id)}"
              aria-label="Seleccionar pedido ${escapeHtml(o.id)}"
              ${checked}
            />
          </td>
          <td class="col-id">
            <div class="col-id-wrap">
              <span class="order-id-code">${escapeHtml(o.id)}</span>
              <button
                type="button"
                class="copy-id-btn btn-copy-order-id"
                data-order-id="${escapeHtml(o.id)}"
                title="Copiar ID de referencia"
                aria-label="Copiar ID ${escapeHtml(o.id)}"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          </td>
          <td class="col-client">
            <div class="client-cell">
              <span class="client-avatar" style="background-color:${av.bg};color:${av.fg}">
                ${escapeHtml(av.initials)}
              </span>
              <div class="client-texts">
                <span class="client-name">${escapeHtml(o.cliente)}</span>
                <span class="client-sub">${escapeHtml(cliSubText)}</span>
              </div>
            </div>
          </td>
          <td class="col-product">
            <span class="product-cell-text" title="${escapeHtml(o.producto)}">${escapeHtml(o.producto)}</span>
          </td>
          <td class="col-date">
            <span class="date-cell-main">${escapeHtml(o.fecha)}</span>
            <span class="date-cell-sub">${escapeHtml(formatShortDate(o.fecha))}</span>
          </td>
          <td class="col-amount ${isCancelled ? 'is-cancelled' : ''}">
            ${formatMoney(o.monto)}
          </td>
          <td class="col-state">
            <button
              type="button"
              class="badge-pill ${badgeCls} btn-row-state-pill"
              data-order-id="${escapeHtml(o.id)}"
              title="Clic para cambiar estado"
            >
              ${escapeHtml(o.estado)}
            </button>
          </td>
          <td class="col-actions">
            <div class="row-actions-group">
              <button type="button" class="row-btn btn-row-inspect" data-order-id="${escapeHtml(o.id)}">
                Detalle
              </button>
              <button type="button" class="row-btn btn-row-edit" data-order-id="${escapeHtml(o.id)}">
                Editar
              </button>
              <button type="button" class="row-btn row-btn-danger btn-row-delete" data-order-id="${escapeHtml(o.id)}">
                Eliminar
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  if (chkAll) {
    chkAll.checked =
      state.filteredOrders.length > 0 &&
      state.filteredOrders.every((o) => state.selectedIds.has(o.id));
  }

  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-actions-bar');
  const label = document.getElementById('bulk-selected-label');
  const count = state.selectedIds.size;
  if (!bar || !label) return;
  if (count > 0) {
    bar.classList.remove('hidden');
    label.textContent = `${count} seleccionado(s)`;
  } else {
    bar.classList.add('hidden');
  }
}

// ── Drawer Lateral de Inspección de Pedido ───────────────────────────────────
function openOrderDrawer(orderId) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;
  state.inspectingOrderId = order.id;

  const backdrop = document.getElementById('order-drawer-backdrop');
  document.getElementById('drawer-order-title').textContent = `Pedido · ${order.cliente}`;
  document.getElementById('drawer-order-subtitle').textContent = `Ref. ${order.id} · ${formatShortDate(order.fecha)}`;
  document.getElementById('drawer-order-amount').textContent = formatMoney(order.monto);

  const badge = document.getElementById('drawer-order-badge');
  badge.className = `badge-pill ${getBadgeClass(order.estado)}`;
  badge.textContent = order.estado;

  document.getElementById('drawer-order-id').textContent = order.id;
  document.getElementById('drawer-order-date').textContent = `${order.fecha} (${formatShortDate(order.fecha)})`;

  const prodBox = document.getElementById('drawer-order-products');
  const lines = String(order.producto || '')
    .split(/\r?\n|,|;/)
    .map((s) => s.trim())
    .filter(Boolean);
  prodBox.innerHTML = (lines.length ? lines : [order.producto])
    .map(
      (line) => `
      <div class="kv-item">
        <span class="kv-val" style="font-family:var(--font)">${escapeHtml(line)}</span>
      </div>
    `
    )
    .join('');

  const cliStats = state.clientSummaryMap.get(order.cliente) || { count: 1, paidCount: 0, paidRevenue: 0 };
  document.getElementById('drawer-client-name').textContent = order.cliente;
  document.getElementById('drawer-client-stats').textContent =
    `${cliStats.count} pedido(s) en total · ${cliStats.paidCount} aprobado(s) por ${formatMoney(cliStats.paidRevenue)}`;

  document.querySelectorAll('#drawer-state-grid .state-quick-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.drawerState === order.estado);
  });

  backdrop?.classList.remove('hidden');
}

function closeOrderDrawer() {
  document.getElementById('order-drawer-backdrop')?.classList.add('hidden');
  state.inspectingOrderId = null;
}

// ── Analítica Comercial con Motor SVG (Charts.js) ────────────────────────────
function getAnalyticsOrders() {
  const year = Number(document.getElementById('an-year-select')?.value || new Date().getFullYear());
  const monthVal = document.getElementById('an-month-select')?.value || 'ALL';
  let prefix = String(year).padStart(4, '0');
  if (monthVal !== 'ALL') {
    prefix += `-${String(monthVal).padStart(2, '0')}`;
  }
  return {
    year,
    monthVal,
    orders: state.orders.filter((o) => String(o.fecha || '').startsWith(prefix)),
  };
}

function accumulateProductMap(ordersList) {
  const map = new Map();
  for (const o of ordersList) {
    const raw = String(o.producto || '').trim();
    const parts = raw.split(/,\s*/).filter(Boolean);
    if (!parts.length) continue;
    const share = Number(o.monto || 0) / parts.length;
    for (const part of parts) {
      const cleanName = part.replace(/^\d+\s*x\s+/i, '').trim() || part;
      map.set(cleanName, (map.get(cleanName) || 0) + share);
    }
  }
  return map;
}

function renderAnalytics() {
  const { year, monthVal, orders } = getAnalyticsOrders();
  const paidOrders = orders.filter((o) => PAID_STATES.has(o.estado));
  const pendingOrders = orders.filter((o) => o.estado === 'Pendiente');
  const totalRev = paidOrders.reduce((acc, o) => acc + Number(o.monto || 0), 0);
  const avgTicket = paidOrders.length > 0 ? totalRev / paidOrders.length : 0;
  const paidRate = orders.length > 0 ? (paidOrders.length / orders.length) * 100 : 0;

  document.getElementById('an-scope-summary').textContent =
    `${orders.length} órdenes analizadas · ${formatMoney(totalRev)} facturados`;

  document.getElementById('an-kpi-ticket').textContent = formatMoney(avgTicket);
  document.getElementById('an-kpi-rate').textContent = `${paidRate.toFixed(1)}%`;

  const rateSub = document.getElementById('an-kpi-rate-sub');
  if (rateSub) {
    rateSub.textContent = `${paidOrders.length} aprobadas de ${orders.length} totales (${pendingOrders.length} pendientes)`;
  }

  const prodRev = accumulateProductMap(paidOrders);
  const cliRev = new Map();
  for (const o of paidOrders) {
    cliRev.set(o.cliente, (cliRev.get(o.cliente) || 0) + Number(o.monto || 0));
  }

  const bestProd = Array.from(prodRev.entries()).sort((a, b) => b[1] - a[1])[0];
  const bestCli = Array.from(cliRev.entries()).sort((a, b) => b[1] - a[1])[0];

  document.getElementById('an-kpi-product').textContent = bestProd ? bestProd[0] : 'Sin registros';
  document.getElementById('an-kpi-product-sub').textContent = bestProd
    ? `${formatMoney(bestProd[1])} generados (${((bestProd[1] / (totalRev || 1)) * 100).toFixed(0)}% del ingreso)`
    : 'Según ventas pagadas del periodo';

  document.getElementById('an-kpi-customer').textContent = bestCli ? bestCli[0] : 'Sin registros';
  document.getElementById('an-kpi-customer-sub').textContent = bestCli
    ? `${formatMoney(bestCli[1])} acumulados (${((bestCli[1] / (totalRev || 1)) * 100).toFixed(0)}% del ingreso)`
    : 'Mayor facturación acumulada';

  const findingEl = document.getElementById('an-finding-text');
  if (findingEl) {
    const scopeLabel = monthVal === 'ALL' ? `el año ${year}` : `${MESES[Number(monthVal) - 1]} ${year}`;
    if (!paidOrders.length) {
      findingEl.textContent = `Sin ventas aprobadas en ${scopeLabel}. Selecciona otro año o mes para inspeccionar su rendimiento.`;
    } else {
      findingEl.innerHTML =
        `En <strong>${escapeHtml(scopeLabel)}</strong> se aprobaron <strong>${paidOrders.length} órdenes</strong> por <strong>${formatMoney(totalRev)}</strong>` +
        (bestCli ? ` · Cliente líder: <strong>${escapeHtml(bestCli[0])}</strong> (${formatMoney(bestCli[1])})` : '');
    }
  }

  renderMonthlyChart(orders, year);
  renderStatusBreakdownChart(orders);
  renderTopProductsChart(paidOrders);
  renderTopCustomersChart(paidOrders);
  renderAnnualChart(year);
  renderCancelledChart(orders, year);
}

function renderMonthlyChart(orders, year) {
  const monthly = new Array(12).fill(0);
  for (const o of state.orders) {
    if (String(o.fecha || '').startsWith(String(year)) && PAID_STATES.has(o.estado)) {
      const m = Number(String(o.fecha).slice(5, 7)) - 1;
      if (m >= 0 && m < 12) monthly[m] += Number(o.monto || 0);
    }
  }
  const totalYear = monthly.reduce((a, b) => a + b, 0);
  const activeMonths = monthly.filter((v) => v > 0);
  const avgActive = activeMonths.length > 0 ? totalYear / activeMonths.length : 0;
  const maxVal = Math.max(...monthly, 0);
  const maxIdx = maxVal > 0 ? monthly.indexOf(maxVal) : null;

  document.getElementById('chart-monthly-sub').textContent =
    `Año ${year} · Facturación anual: ${formatMoney(totalYear)}` +
    (maxIdx != null ? ` · Mes pico: ${MESES[maxIdx]} (${formatMoney(maxVal)})` : '');

  const container = document.getElementById('chart-monthly-container');
  if (window.Charts) {
    Charts.bars(container, {
      labels: MESES_CORTOS,
      values: monthly,
      format: formatMoneyCompact,
      height: 196,
      highlight: maxIdx,
      reference: avgActive > 0 ? { value: avgActive, label: `Prom. mes activo ${formatMoneyCompact(avgActive)}` } : null,
    });
  }
}

function renderAnnualChart(currentYear) {
  const yearMap = new Map();
  for (let y = currentYear - 4; y <= currentYear; y += 1) {
    yearMap.set(y, { revenue: 0, count: 0 });
  }
  for (const o of state.orders) {
    if (!PAID_STATES.has(o.estado)) continue;
    const y = Number(String(o.fecha || '').slice(0, 4));
    if (Number.isFinite(y)) {
      const prev = yearMap.get(y) || { revenue: 0, count: 0 };
      prev.revenue += Number(o.monto || 0);
      prev.count += 1;
      yearMap.set(y, prev);
    }
  }

  const entries = Array.from(yearMap.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(-5);
  const totalAll = entries.reduce((acc, [, d]) => acc + d.revenue, 0);
  document.getElementById('chart-annual-sub').textContent =
    `Acumulado últimos 5 años: ${formatMoney(totalAll)}`;

  const container = document.getElementById('chart-annual-container');
  const labels = entries.map(([yr]) => String(yr));
  const values = entries.map(([, d]) => d.revenue);
  const curIdx = entries.findIndex(([yr]) => yr === currentYear);

  if (window.Charts) {
    Charts.bars(container, {
      labels,
      values,
      format: formatMoneyCompact,
      height: 180,
      highlight: curIdx >= 0 ? curIdx : null,
    });
  }
}

function renderCancelledChart(orders, year) {
  const counts = new Array(12).fill(0);
  let cancelledAmount = 0;
  for (const o of state.orders) {
    if (String(o.fecha || '').startsWith(String(year)) && o.estado === 'Cancelado') {
      const m = Number(String(o.fecha).slice(5, 7)) - 1;
      if (m >= 0 && m < 12) {
        counts[m] += 1;
        cancelledAmount += Number(o.monto || 0);
      }
    }
  }
  const totalCanc = counts.reduce((a, b) => a + b, 0);
  document.getElementById('chart-cancelled-sub').textContent =
    `Año ${year} · ${totalCanc} cancelada(s) (${formatMoney(cancelledAmount)} excluidos del ingreso)`;

  const container = document.getElementById('chart-cancelled-container');
  if (window.Charts) {
    const maxC = Math.max(...counts, 0);
    const maxIdx = maxC > 0 ? counts.indexOf(maxC) : null;
    Charts.bars(container, {
      labels: MESES_CORTOS,
      values: counts,
      format: Charts.fmt.int,
      height: 180,
      highlight: maxIdx,
      colour: 'var(--negative)',
    });
  }
}

function renderStatusBreakdownChart(orders) {
  const container = document.getElementById('chart-status-container');
  if (!orders.length) {
    container.innerHTML = `<div class="empty-state" style="margin:0"><p>No hay órdenes en este periodo para calcular distribución.</p></div>`;
    return;
  }

  const paidCount = orders.filter((o) => PAID_STATES.has(o.estado)).length;
  const paidRatio = paidCount / orders.length;

  const statusMap = new Map();
  for (const o of orders) {
    const st = o.estado || 'Pendiente';
    const cur = statusMap.get(st) || { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(o.monto || 0);
    statusMap.set(st, cur);
  }
  const rows = Array.from(statusMap.entries()).sort((a, b) => b[1].count - a[1].count);

  container.innerHTML = `
    <div class="ring-breakdown-layout">
      <div id="an-status-ring-host"></div>
      <table class="mini-legend-table">
        <thead>
          <tr>
            <th>Estado</th>
            <th class="n">Órd.</th>
            <th class="n">Monto</th>
            <th class="n">%</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(([st, d]) => {
              const pct = ((d.count / orders.length) * 100).toFixed(0);
              return `
                <tr>
                  <td><span class="badge-pill ${getBadgeClass(st)}" style="height:20px;font-size:11px;padding:0 7px">${escapeHtml(st)}</span></td>
                  <td class="n">${d.count}</td>
                  <td class="n">${formatMoneyCompact(d.amount)}</td>
                  <td class="n">${pct}%</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  const ringHost = document.getElementById('an-status-ring-host');
  if (ringHost && window.Charts) {
    Charts.ring(ringHost, {
      value: paidRatio,
      label: `${Math.round(paidRatio * 100)}%`,
      sub: 'aprobadas',
      size: 94,
      stroke: 7,
    });
  }
}

function renderTopProductsChart(paidOrders) {
  const container = document.getElementById('chart-products-container');
  if (!paidOrders.length) {
    container.innerHTML = `<div class="empty-state" style="margin:0"><p>No hay ventas aprobadas en el periodo seleccionado.</p></div>`;
    return;
  }
  const map = accumulateProductMap(paidOrders);
  const top = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));

  if (window.Charts) {
    Charts.barList(container, top, { format: formatMoney });
  }
}

function renderTopCustomersChart(paidOrders) {
  const container = document.getElementById('chart-customers-container');
  const limit = Number(document.getElementById('an-top-limit')?.value || 10);
  const hideAmounts = Boolean(document.getElementById('an-hide-amounts')?.checked);

  if (!paidOrders.length) {
    state.topCustomersSnapshot = [];
    container.innerHTML = `<div class="empty-state" style="margin:0"><p>No hay clientes con órdenes aprobadas en este periodo.</p></div>`;
    return;
  }

  const map = new Map();
  for (const o of paidOrders) {
    const prev = map.get(o.cliente) || { revenue: 0, count: 0 };
    prev.revenue += Number(o.monto || 0);
    prev.count += 1;
    map.set(o.cliente, prev);
  }

  const topList = Array.from(map.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, limit);

  state.topCustomersSnapshot = topList.map(([name]) => name);

  if (window.Charts) {
    const rows = topList.map(([cli, d], idx) => ({
      label: `${idx + 1}. ${cli} (${d.count} ord.)`,
      value: hideAmounts ? d.count : d.revenue,
    }));
    Charts.barList(container, rows, {
      format: hideAmounts ? (v) => `${v} ped.` : formatMoney,
    });
  }
}

// ── Reportes PDF y Excel ─────────────────────────────────────────────────────
function renderReportsList() {
  const container = document.getElementById('reports-list-container');
  const countLbl = document.getElementById('reports-count-label');
  if (countLbl) {
    countLbl.textContent = `${state.reports.length} documento(s) almacenado(s) en disco`;
  }

  if (!state.reports.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Aún no has generado reportes</h3>
        <p>Usa las tarjetas de "Generación Rápida" arriba o los botones "Exportar Excel / PDF" de la barra superior.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.reports
    .map((r) => {
      const kb = Math.max(1, Math.round((r.sizeBytes || 0) / 1024));
      return `
        <div class="report-row">
          <div class="report-info">
            <span class="report-type-tag ${r.type === 'pdf' ? 'pdf' : 'excel'}">${r.type === 'pdf' ? 'PDF' : 'XLSX'}</span>
            <div class="report-meta">
              <strong>${escapeHtml(r.name)}</strong>
              <span>Generado: ${escapeHtml(r.createdAt)} · ${kb} KB</span>
            </div>
          </div>
          <div class="row-actions-group">
            <button type="button" class="btn btn-sm btn-outline btn-report-folder" data-path="${escapeHtml(r.path)}">
              Ver en carpeta
            </button>
            <button type="button" class="btn btn-sm btn-primary btn-report-open" data-path="${escapeHtml(r.path)}">
              Abrir documento
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function handleQuickReport(mode, format) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let dFrom = new Date(now);
  let dTo = new Date(now);

  if (mode === 'ultimo_mes') {
    dFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    dTo = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (mode === 'ultimo_trimestre') {
    const q = Math.floor(now.getMonth() / 3) + 1;
    if (q === 1) {
      dFrom = new Date(now.getFullYear() - 1, 9, 1);
      dTo = new Date(now.getFullYear() - 1, 11, 31);
    } else {
      const startMonth = (q - 2) * 3;
      dFrom = new Date(now.getFullYear(), startMonth, 1);
      dTo = new Date(now.getFullYear(), startMonth + 3, 0);
    }
  } else if (mode === 'ytd') {
    dFrom = new Date(now.getFullYear(), 0, 1);
    dTo = now;
  } else if (mode === 'toda_operacion') {
    const dates = state.orders.map((o) => o.fecha).filter(Boolean).sort();
    const sFrom = dates[0] || todayIso();
    const sTo = todayIso();
    await triggerExport(format, state.orders, sFrom, sTo);
    return;
  }

  const sFrom = toIso(dFrom);
  const sTo = toIso(dTo);
  const subset = state.orders.filter((o) => o.fecha >= sFrom && o.fecha <= sTo);
  await triggerExport(format, subset, sFrom, sTo);
}

async function triggerExport(format, ordersToExport, dateFrom, dateTo, customTitle = '') {
  if (!ordersToExport.length) {
    showToast('No hay órdenes en el periodo indicado para generar el reporte.');
    return;
  }
  setStatusText(`Generando reporte ${format.toUpperCase()}...`);
  const res = await api.exportReport({
    format,
    orders: ordersToExport,
    dateFrom,
    dateTo,
    customTitle,
    openAfter: true,
  });
  if (res.ok) {
    if (res.reports) state.reports = res.reports;
    renderReportsList();
    showToast(`Reporte ${format.toUpperCase()} generado y abierto.`);
    setStatusText(`Reporte guardado: ${res.filePath || ''}`);
  } else {
    showToast(res.message || 'Error al generar el reporte.');
  }
}

function initCustomReportDates() {
  const fromEl = document.getElementById('rep-custom-from');
  const toEl = document.getElementById('rep-custom-to');
  if (fromEl && !fromEl.value) {
    fromEl.value = state.dateFrom || `${new Date().getFullYear()}-01-01`;
  }
  if (toEl && !toEl.value) {
    toEl.value = state.dateTo || todayIso();
  }
}

async function handleCustomReportExport(format) {
  const fromVal = document.getElementById('rep-custom-from')?.value || '0000-01-01';
  const toVal = document.getElementById('rep-custom-to')?.value || '9999-12-31';
  const stVal = document.getElementById('rep-custom-state')?.value || 'ALL';
  const cliVal = document.getElementById('rep-custom-client')?.value || 'ALL';

  const subset = state.orders.filter((o) => {
    if (o.fecha < fromVal || o.fecha > toVal) return false;
    if (cliVal !== 'ALL' && o.cliente !== cliVal) return false;
    if (stVal === 'PAID' && !PAID_STATES.has(o.estado)) return false;
    if (stVal !== 'ALL' && stVal !== 'PAID' && o.estado !== stVal) return false;
    return true;
  });

  let customTitle = '';
  if (cliVal !== 'ALL') {
    customTitle = `ESTADO DE CUENTA · ${cliVal.toUpperCase()}`;
  } else if (stVal === 'Pendiente') {
    customTitle = 'REPORTE DE CARTERA PENDIENTE POR COBRAR';
  }

  await triggerExport(format, subset, fromVal, toVal, customTitle);
}

// ── Vista CRM: Directorio de Clientes y Cartera por Cobrar ───────────────────
function getDaysSince(isoDate) {
  if (!isoDate) return 999;
  const [y, m, d] = String(isoDate).split('-').map(Number);
  if (!y || !m || !d) return 999;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today - target) / 86400000));
}

function renderClientsView() {
  const allClients = Array.from(state.clientSummaryMap.values()).map((c) => {
    const daysSinceLast = getDaysSince(c.lastDate);
    let topProd = 'Sin registro';
    let maxCnt = 0;
    for (const [p, cnt] of c.prodCounts.entries()) {
      if (cnt > maxCnt) {
        maxCnt = cnt;
        topProd = p;
      }
    }
    return {
      ...c,
      daysSinceLast,
      topProduct: topProd,
      isVip: c.paidCount >= 2,
      hasPending: c.pendingAmount > 0,
      isInactive: daysSinceLast >= 30 && c.pendingAmount === 0,
    };
  });

  const totalPendingAmount = allClients.reduce((a, c) => a + c.pendingAmount, 0);
  const clientsWithPending = allClients.filter((c) => c.hasPending).length;
  const vipClients = allClients.filter((c) => c.isVip).length;
  const inactiveClients = allClients.filter((c) => c.isInactive).length;
  const totalApprovedRev = allClients.reduce((a, c) => a + c.paidRevenue, 0);
  const avgLtv = allClients.length > 0 ? totalApprovedRev / allClients.length : 0;

  const pendEl = document.getElementById('crm-kpi-pending-amount');
  const pendSub = document.getElementById('crm-kpi-pending-sub');
  const totEl = document.getElementById('crm-kpi-total-clients');
  const vipEl = document.getElementById('crm-kpi-vip-clients');
  const vipSub = document.getElementById('crm-kpi-vip-sub');
  const ltvEl = document.getElementById('crm-kpi-avg-ltv');
  const inactSub = document.getElementById('crm-kpi-inactive-sub');
  const findingEl = document.getElementById('crm-finding-text');

  if (pendEl) pendEl.textContent = formatMoney(totalPendingAmount);
  if (pendSub) pendSub.textContent = `${clientsWithPending} cliente(s) con cobro pendiente`;
  if (totEl) totEl.textContent = String(allClients.length);
  if (vipEl) vipEl.textContent = String(vipClients);
  if (vipSub) {
    const vipPct = allClients.length ? Math.round((vipClients / allClients.length) * 100) : 0;
    vipSub.textContent = `${vipPct}% de tasa de recompra (2+ órdenes)`;
  }
  if (ltvEl) ltvEl.textContent = formatMoney(avgLtv);
  if (inactSub) inactSub.textContent = `${inactiveClients} cliente(s) sin compra hace +30 días`;

  if (findingEl) {
    findingEl.innerHTML =
      `Base comercial de <strong>${allClients.length} clientes</strong> · ` +
      `Cartera por cobrar: <strong>${formatMoney(totalPendingAmount)}</strong> (${clientsWithPending} clientes) · ` +
      `<strong>${vipClients} clientes recurrentes VIP</strong>`;
  }

  document.querySelectorAll('.crm-kpi-tile').forEach((tile) => {
    tile.classList.toggle('active', tile.dataset.crmFilter === state.crmFilter);
  });
  document.querySelectorAll('[data-crm-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.crmTab === state.crmFilter);
  });

  const q = state.crmSearchQuery.trim().toLowerCase();
  const filtered = allClients
    .filter((c) => {
      if (state.crmFilter === 'pending' && !c.hasPending) return false;
      if (state.crmFilter === 'vip' && !c.isVip) return false;
      if (state.crmFilter === 'inactive' && !c.isInactive) return false;
      if (q) {
        const hay = `${c.name} ${c.topProduct}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (state.crmFilter === 'pending') return b.pendingAmount - a.pendingAmount;
      return b.paidRevenue - a.paidRevenue;
    });

  const countLbl = document.getElementById('crm-count-summary');
  if (countLbl) {
    countLbl.textContent = `${filtered.length} cliente(s) en vista · ${allClients.length} registrados`;
  }

  const tbody = document.getElementById('crm-tbody');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:28px;color:var(--muted)">
          No hay clientes en este segmento con el criterio actual.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((c) => {
      const av = getCustomerAvatarData(c.name);
      let segBadge = `<span class="badge-pill badge-prep" style="height:19px;font-size:10.5px;padding:0 6px">Activo</span>`;
      if (c.hasPending) {
        segBadge = `<span class="badge-pill badge-pending" style="height:19px;font-size:10.5px;padding:0 6px">Por cobrar (${c.pendingCount})</span>`;
      } else if (c.isVip) {
        segBadge = `<span class="badge-pill badge-paid" style="height:19px;font-size:10.5px;padding:0 6px">VIP Recurrente</span>`;
      } else if (c.isInactive) {
        segBadge = `<span class="badge-pill badge-cancelled" style="height:19px;font-size:10.5px;padding:0 6px">Inactivo ${c.daysSinceLast}d</span>`;
      }

      const recencyTxt =
        c.daysSinceLast === 0
          ? 'Hoy'
          : c.daysSinceLast === 1
            ? 'Ayer'
            : `Hace ${c.daysSinceLast} días`;

      return `
        <tr data-client-name="${escapeHtml(c.name)}">
          <td class="col-client">
            <div class="client-cell">
              <span class="client-avatar" style="background-color:${av.bg};color:${av.fg}">
                ${escapeHtml(av.initials)}
              </span>
              <div class="client-texts">
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="client-name">${escapeHtml(c.name)}</span>
                  ${segBadge}
                </div>
                <span class="client-sub">Cliente desde ${escapeHtml(formatShortDate(c.firstDate))}</span>
              </div>
            </div>
          </td>
          <td>
            <span style="font-weight:600;color:var(--text)">${c.paidCount} aprob.</span>
            <span class="date-cell-sub">${c.count} totales</span>
          </td>
          <td class="col-product">
            <span class="product-cell-text" title="${escapeHtml(c.topProduct)}">${escapeHtml(c.topProduct)}</span>
          </td>
          <td class="col-date">
            <span class="date-cell-main">${escapeHtml(c.lastDate)}</span>
            <span class="date-cell-sub">${escapeHtml(recencyTxt)}</span>
          </td>
          <td class="col-amount">${formatMoney(c.paidRevenue)}</td>
          <td class="col-amount" style="color:${c.pendingAmount > 0 ? 'var(--warning)' : 'var(--faint)'}">
            ${c.pendingAmount > 0 ? formatMoney(c.pendingAmount) : '$0.00'}
          </td>
          <td class="col-actions">
            <div class="row-actions-group">
              <button type="button" class="row-btn btn-crm-wa" data-client="${escapeHtml(c.name)}" title="Copiar mensaje de WhatsApp para este cliente">
                WhatsApp
              </button>
              <button type="button" class="row-btn btn-crm-pdf" data-client="${escapeHtml(c.name)}" title="Generar Estado de Cuenta en PDF con membrete">
                Estado PDF
              </button>
              <button type="button" class="row-btn btn-crm-orders" data-client="${escapeHtml(c.name)}" title="Ver pedidos de este cliente">
                Pedidos
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function buildClientWhatsAppMessage(clientName) {
  const clientOrders = state.orders.filter((o) => o.cliente === clientName);
  const pending = clientOrders.filter((o) => o.estado === 'Pendiente');
  const paid = clientOrders.filter((o) => PAID_STATES.has(o.estado));
  const pendingSum = pending.reduce((a, o) => a + Number(o.monto || 0), 0);

  if (pending.length > 0) {
    const lines = pending.map((o) => `• Ref. #${o.id} (${o.fecha}): ${o.producto} -> ${formatMoney(o.monto)}`);
    return [
      `Hola *${clientName}*, te saludamos de *Café Pa'l Monte* (San Antonio, Jamundí).`,
      `Te compartimos el resumen de tu(s) pedido(s) pendiente(s) de confirmación de pago:`,
      ...lines,
      `*Total pendiente por cancelar: ${formatMoney(pendingSum)}*`,
      `Quedamos atentos a tu comprobante. Muchas gracias por preferir nuestro café de origen.`,
    ].join('\n');
  }

  return [
    `Hola *${clientName}*, te saludamos de *Café Pa'l Monte* (San Antonio, Jamundí).`,
    `Gracias por tu confianza: registramos ${paid.length} pedido(s) aprobado(s) en tu historial comercial.`,
    `Esta semana tenemos tueste fresco disponible en nuestras líneas de origen y microlotes especiales. ¿Deseas que programemos tu próximo despacho?`,
  ].join('\n');
}

// ── Vista Sistema, Migración de BD y Actualizaciones ─────────────────────────
function renderSystemView() {
  document.getElementById('sys-db-path').textContent = state.dbPath || '';
  document.getElementById('sys-reports-path').textContent = state.reportsDir || '';
  document.getElementById('sys-sync-stats').textContent =
    `${state.orders.length} pedidos totales (${state.stats.with_whatsapp_id || 0} con ID oficial de WhatsApp Business)`;
  document.getElementById('sys-version-pill').textContent = `Versión instalada: v${state.version}`;

  const knownContainer = document.getElementById('known-sources-list');
  if (!state.knownLegacySources.length) {
    knownContainer.innerHTML = `<p class="panel-subtitle">No se detectaron otras carpetas pendientes por migrar. Puedes seleccionar cualquier carpeta o archivo <code>orders.db</code> manualmente.</p>`;
    return;
  }

  knownContainer.innerHTML = state.knownLegacySources
    .map(
      (src) => `
      <div class="known-source-item">
        <div class="known-source-info">
          <strong>${escapeHtml(src.sourceLabel)}</strong>
          <span>${src.ordersCount} pedido(s) · ${src.reportsCount} reporte(s) ${src.dateRange ? `· (${escapeHtml(src.dateRange)})` : ''}</span>
        </div>
        <button type="button" class="btn btn-sm btn-primary btn-import-known" data-source-path="${escapeHtml(src.sourceLabel)}">
          Importar y fusionar
        </button>
      </div>
    `
    )
    .join('');
}

function showMigrationPreview(inspection) {
  const box = document.getElementById('migration-preview-box');
  const details = document.getElementById('migration-preview-details');
  if (!inspection || !inspection.ok) {
    box.classList.add('hidden');
    showToast((inspection && inspection.error) || 'No se encontraron datos en la ruta seleccionada.');
    return;
  }
  state.pendingMigrationPath = inspection.sourceLabel;
  details.textContent =
    `Ruta: ${inspection.sourceLabel} · ${inspection.ordersCount} pedido(s) encontrados, ` +
    `${inspection.reportsCount} reporte(s) PDF/Excel y ${inspection.sessions?.length || 0} sesión(es) de navegador.`;
  box.classList.remove('hidden');
}

async function executeMigration(targetPath) {
  if (!targetPath) return;
  setStatusText('Ejecutando respaldo preventivo y migrando base de datos...');
  const res = await api.migrateFromPath(targetPath);
  if (!res.ok) {
    showToast(res.error || 'Error durante la migración.');
    return;
  }
  state.orders = res.orders || state.orders;
  state.stats = res.stats || state.stats;
  state.reports = res.reports || state.reports;
  document.getElementById('migration-preview-box')?.classList.add('hidden');
  adjustDefaultDateRangeToOrders();
  applyFiltersAndRender();
  renderSystemView();
  showToast(
    `Migración completada: +${res.importedOrders} nuevos, ${res.updatedOrders} actualizados, ${res.copiedReports} reportes copiados.`
  );
  setStatusText(`Base de datos sincronizada (${state.orders.length} pedidos en total).`);
}

// ── Modales: Agregar / Editar Pedido Manual ──────────────────────────────────
function openOrderModal(orderToEdit = null) {
  state.editingOrder = orderToEdit;
  const backdrop = document.getElementById('order-modal-backdrop');
  const title = document.getElementById('order-modal-title');
  const inputId = document.getElementById('order-input-id');
  const btnGen = document.getElementById('btn-generate-order-id');
  const inputClient = document.getElementById('order-input-client');
  const inputProd = document.getElementById('order-input-product');
  const inputAmount = document.getElementById('order-input-amount');
  const inputDate = document.getElementById('order-input-date');
  const inputState = document.getElementById('order-input-state');
  const errEl = document.getElementById('order-form-error');

  errEl.classList.add('hidden');

  if (orderToEdit) {
    title.textContent = `Editar Pedido · ${orderToEdit.id}`;
    inputId.value = orderToEdit.id;
    inputId.readOnly = true;
    btnGen.classList.add('hidden');
    inputClient.value = orderToEdit.cliente;
    inputProd.value = orderToEdit.producto;
    inputAmount.value = Number(orderToEdit.monto || 0).toFixed(2);
    inputDate.value = orderToEdit.fecha;
    inputState.value = orderToEdit.estado;
  } else {
    title.textContent = 'Nuevo Pedido Manual';
    inputId.value = generateOrderId();
    inputId.readOnly = false;
    btnGen.classList.remove('hidden');
    inputClient.value = '';
    inputProd.value = '';
    inputAmount.value = '';
    inputDate.value = todayIso();
    inputState.value = 'Pendiente';
  }

  renderCatalogPillsInModal();

  backdrop.classList.remove('hidden');
  setTimeout(() => {
    (orderToEdit ? inputClient : inputId).focus();
  }, 30);
}

function renderCatalogPillsInModal() {
  const box = document.getElementById('order-catalog-pills');
  if (!box) return;
  const catalog = state.catalogProducts && state.catalogProducts.length
    ? state.catalogProducts
    : [
        { name: "Café Especial Pa'l Monte Grano 500g", unitPrice: 32000 },
        { name: "Café Especial San Antonio Molido 500g", unitPrice: 32000 },
        { name: 'Café Orgánico Sierra de Jamundí 500g', unitPrice: 35000 },
        { name: 'Café Bourbón Rosado Reserva 340g', unitPrice: 42000 },
        { name: 'Café Especial Tostión Media 250g', unitPrice: 18500 },
        { name: "Kit Degustación Pa'l Monte (3x250g)", unitPrice: 56000 },
        { name: 'Bulto Mayorista Café Excelso 2.5kg', unitPrice: 145000 },
      ];

  box.innerHTML = catalog
    .map(
      (p, idx) => `
      <button type="button" class="catalog-pill-btn" data-cat-idx="${idx}">
        <span>+1 ${escapeHtml(p.name)}</span>
        <span class="catalog-pill-price">${formatMoneyCompact(p.unitPrice)}</span>
      </button>
    `
    )
    .join('');

  box.querySelectorAll('.catalog-pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = catalog[Number(btn.dataset.catIdx)];
      if (!p) return;
      const inputProd = document.getElementById('order-input-product');
      const inputAmount = document.getElementById('order-input-amount');
      if (!inputProd || !inputAmount) return;

      const curText = inputProd.value.trim();
      const escapedName = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(`(\\d+)x\\s+${escapedName}`);
      const match = curText.match(rx);
      if (match) {
        const nextQty = Number(match[1]) + 1;
        inputProd.value = curText.replace(rx, `${nextQty}x ${p.name}`);
      } else {
        inputProd.value = curText ? `${curText}, 1x ${p.name}` : `1x ${p.name}`;
      }

      const curAmount = Number(inputAmount.value || 0);
      inputAmount.value = (curAmount + Number(p.unitPrice)).toFixed(2);
    });
  });
}

function closeOrderModal() {
  document.getElementById('order-modal-backdrop')?.classList.add('hidden');
  state.editingOrder = null;
}

function generateOrderId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'CPM-';
  for (let i = 0; i < 7; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// ── Modal de Confirmación de Eliminación ─────────────────────────────────────
function openConfirmDeleteModal(orderIds) {
  if (!orderIds || !orderIds.length) return;
  const backdrop = document.getElementById('confirm-modal-backdrop');
  const titleEl = document.getElementById('confirm-modal-title');
  const msg = document.getElementById('confirm-modal-message');
  const confirmBtn = document.getElementById('btn-accept-confirm');
  if (titleEl) titleEl.textContent = 'Confirmar eliminación';
  if (confirmBtn) confirmBtn.textContent = 'Sí, eliminar definitivamente';
  msg.textContent = `¿Confirmas que deseas eliminar ${orderIds.length} pedido(s)? Quedarán marcados como descartados para que la sincronización de WhatsApp no los vuelva a importar.`;

  state.confirmActionCallback = async () => {
    const res = await api.deleteOrders(orderIds);
    if (res.ok) {
      state.orders = res.orders;
      state.stats = res.stats || state.stats;
      orderIds.forEach((id) => state.selectedIds.delete(id));
      if (state.inspectingOrderId && orderIds.includes(state.inspectingOrderId)) {
        closeOrderDrawer();
      }
      applyFiltersAndRender();
      showToast(`Se eliminaron ${res.deletedCount} pedido(s).`);
    }
    closeConfirmModal();
  };

  backdrop.classList.remove('hidden');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal-backdrop')?.classList.add('hidden');
  state.confirmActionCallback = null;
}

// ── Estado de Conexión WhatsApp y Modal QR ───────────────────────────────────
function updateConnectionUi(connPayload) {
  const dot = document.getElementById('wa-status-dot');
  const title = document.getElementById('wa-status-title');
  const discActions = document.getElementById('wa-disconnected-actions');
  const connActions = document.getElementById('wa-connected-actions');
  const autoBtn = document.getElementById('btn-wa-sync-auto');

  const connected = Boolean(connPayload.connected);
  const connecting = Boolean(connPayload.connecting);
  const autoSyncActive = Boolean(connPayload.autoSyncActive);

  state.connection = { connected, connecting, autoSyncActive };

  dot.className = 'status-dot ' + (connected ? 'connected' : connecting ? 'waiting' : 'disconnected');
  title.textContent = connected ? 'Conectado' : connecting ? 'Vinculando...' : 'Desconectado';

  if (connected) {
    discActions.classList.add('hidden');
    connActions.classList.remove('hidden');
    document.getElementById('qr-modal-backdrop')?.classList.add('hidden');
    if (autoBtn) {
      autoBtn.textContent = autoSyncActive
        ? 'Auto-sync: Activa (20s)'
        : 'Activar Auto-sync (20s)';
      autoBtn.classList.toggle('btn-accent', autoSyncActive);
    }
  } else {
    discActions.classList.remove('hidden');
    connActions.classList.add('hidden');
  }
}

// ── Menú Contextual (Click Derecho o Píldora de Estado) ──────────────────────
function openRowContextMenu(x, y, orderId) {
  state.contextMenuOrderId = orderId;
  const menu = document.getElementById('row-context-menu');
  const hdr = document.getElementById('ctx-menu-order-id');
  if (!menu || !hdr) return;

  hdr.textContent = `Pedido: ${orderId}`;
  menu.classList.remove('hidden');

  const rect = menu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 12;
  const maxY = window.innerHeight - rect.height - 12;
  menu.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
}

function closeRowContextMenu() {
  document.getElementById('row-context-menu')?.classList.add('hidden');
  state.contextMenuOrderId = null;
}

// ── Atajos de Periodo en el Panel ────────────────────────────────────────────
function applyPeriodPreset(preset) {
  state.periodPreset = preset;
  document.querySelectorAll('[data-period-preset]').forEach((b) => {
    b.classList.toggle('active', b.dataset.periodPreset === preset);
  });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const inputFrom = document.getElementById('filter-date-from');
  const inputTo = document.getElementById('filter-date-to');

  if (preset === 'all') {
    const dates = state.orders.map((o) => o.fecha).filter(Boolean).sort();
    inputFrom.value = dates[0] || '2020-01-01';
    inputTo.value = dates[dates.length - 1] > todayIso() ? dates[dates.length - 1] : todayIso();
  } else if (preset === 'year') {
    inputFrom.value = `${now.getFullYear()}-01-01`;
    inputTo.value = todayIso();
  } else if (preset === 'month') {
    inputFrom.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    inputTo.value = todayIso();
  } else if (preset === '30d') {
    const d30 = new Date(now.getTime() - 30 * 86400000);
    inputFrom.value = toIso(d30);
    inputTo.value = todayIso();
  }
  applyFiltersAndRender();
}

// ── Registro de Eventos DOM ──────────────────────────────────────────────────
function bindDomEvents() {
  // Navegación lateral
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Interruptor de Tema Claro / Oscuro
  document.getElementById('btn-theme-toggle')?.addEventListener('click', async () => {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    await api.saveSettings({ theme: next });
  });

  // Búsqueda global en la barra superior (sincronizada con la búsqueda de la tabla)
  const globalSearch = document.getElementById('global-search-input');
  const tableSearch = document.getElementById('filter-search');

  globalSearch?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value || '';
    if (tableSearch) tableSearch.value = state.searchQuery;
    if (state.currentView !== 'panel') switchView('panel');
    applyFiltersAndRender();
  });

  // Modo de vista del Dashboard (Resumen + Tabla vs Solo Tabla)
  const btnModeFull = document.getElementById('btn-viewmode-full');
  const btnModeTable = document.getElementById('btn-viewmode-table');
  btnModeFull?.addEventListener('click', () => {
    state.dashboardLayout = 'full';
    btnModeFull.classList.add('active');
    btnModeFull.setAttribute('aria-pressed', 'true');
    btnModeTable?.classList.remove('active');
    btnModeTable?.setAttribute('aria-pressed', 'false');
    renderOverviewDashboard(state.periodOrders);
  });
  btnModeTable?.addEventListener('click', () => {
    state.dashboardLayout = 'table';
    btnModeTable.classList.add('active');
    btnModeTable.setAttribute('aria-pressed', 'true');
    btnModeFull?.classList.remove('active');
    btnModeFull?.setAttribute('aria-pressed', 'false');
    renderOverviewDashboard(state.periodOrders);
  });

  // Selectores de métrica y agrupación de la gráfica del Dashboard
  document.querySelectorAll('[data-ov-metric]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.ovChartMetric = btn.dataset.ovMetric;
      document.querySelectorAll('[data-ov-metric]').forEach((b) => {
        const act = b.dataset.ovMetric === state.ovChartMetric;
        b.classList.toggle('active', act);
        b.setAttribute('aria-pressed', act ? 'true' : 'false');
      });
      renderOverviewMainChart(state.periodOrders);
    });
  });

  document.querySelectorAll('[data-ov-group]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.ovChartGroup = btn.dataset.ovGroup;
      document.querySelectorAll('[data-ov-group]').forEach((b) => {
        const act = b.dataset.ovGroup === state.ovChartGroup;
        b.classList.toggle('active', act);
        b.setAttribute('aria-pressed', act ? 'true' : 'false');
      });
      renderOverviewMainChart(state.periodOrders);
    });
  });

  document.querySelectorAll('[data-ov-side]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.ovSideTab = btn.dataset.ovSide;
      document.querySelectorAll('[data-ov-side]').forEach((b) => {
        const act = b.dataset.ovSide === state.ovSideTab;
        b.classList.toggle('active', act);
        b.setAttribute('aria-pressed', act ? 'true' : 'false');
      });
      renderOverviewSidePanel(state.periodOrders);
    });
  });

  // Atajos de periodo
  document.querySelectorAll('[data-period-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyPeriodPreset(btn.dataset.periodPreset);
    });
  });

  // Botones superiores
  document.getElementById('btn-quick-migrate')?.addEventListener('click', () => {
    switchView('system');
  });

  document.getElementById('btn-topbar-excel')?.addEventListener('click', () => {
    triggerExport('excel', state.filteredOrders, state.dateFrom, state.dateTo);
  });

  document.getElementById('btn-topbar-pdf')?.addEventListener('click', () => {
    triggerExport('pdf', state.filteredOrders, state.dateFrom, state.dateTo);
  });

  document.getElementById('btn-close-migration-banner')?.addEventListener('click', () => {
    document.getElementById('migration-banner')?.classList.add('hidden');
  });

  // Tarjetas de filtro rápido por estado en la banda de KPIs
  document.querySelectorAll('.metric-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const f = tile.dataset.stateFilter || 'ALL';
      state.stateFilter = f;
      const sel = document.getElementById('filter-state-select');
      if (sel) sel.value = f;
      applyFiltersAndRender();
    });
  });

  // Controles de filtro en Panel
  document.getElementById('btn-apply-dates')?.addEventListener('click', () => {
    document.querySelectorAll('[data-period-preset]').forEach((b) => b.classList.remove('active'));
    applyFiltersAndRender();
  });

  document.getElementById('btn-quick-month-go')?.addEventListener('click', () => {
    const m = Number(document.getElementById('filter-quick-month')?.value || 1);
    const y = Number(document.getElementById('filter-quick-year')?.value || new Date().getFullYear());
    const lastDay = new Date(y, m, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    document.getElementById('filter-date-from').value = `${y}-${pad(m)}-01`;
    document.getElementById('filter-date-to').value = `${y}-${pad(m)}-${pad(lastDay)}`;
    document.querySelectorAll('[data-period-preset]').forEach((b) => b.classList.remove('active'));
    applyFiltersAndRender();
  });

  tableSearch?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value || '';
    if (globalSearch) globalSearch.value = state.searchQuery;
    applyFiltersAndRender();
  });

  document.getElementById('filter-state-select')?.addEventListener('change', (e) => {
    state.stateFilter = e.target.value || 'ALL';
    applyFiltersAndRender();
  });

  // Ordenamiento de columnas
  document.querySelectorAll('.sort-header-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const col = btn.dataset.sort;
      if (state.sortCol === col) {
        state.sortDesc = !state.sortDesc;
      } else {
        state.sortCol = col;
        state.sortDesc = col === 'fecha' || col === 'monto';
      }
      applyFiltersAndRender();
    });
  });

  // Selección masiva en tabla
  document.getElementById('chk-select-all')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.filteredOrders.forEach((o) => state.selectedIds.add(o.id));
    } else {
      state.filteredOrders.forEach((o) => state.selectedIds.delete(o.id));
    }
    renderOrdersTable();
  });

  // Eventos delegados en tbody
  const tbody = document.getElementById('orders-tbody');
  tbody?.addEventListener('change', (e) => {
    const chk = e.target.closest('.row-select-chk');
    if (!chk) return;
    const id = chk.dataset.orderId;
    if (chk.checked) state.selectedIds.add(id);
    else state.selectedIds.delete(id);
    renderOrdersTable();
  });

  tbody?.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.btn-copy-order-id');
    if (copyBtn) {
      const id = copyBtn.dataset.orderId;
      await api.copyToClipboard(id);
      showToast(`Referencia ${id} copiada al portapapeles.`);
      return;
    }

    const statePill = e.target.closest('.btn-row-state-pill');
    if (statePill) {
      const rect = statePill.getBoundingClientRect();
      openRowContextMenu(rect.left, rect.bottom + 4, statePill.dataset.orderId);
      return;
    }

    const inspectBtn = e.target.closest('.btn-row-inspect');
    if (inspectBtn) {
      openOrderDrawer(inspectBtn.dataset.orderId);
      return;
    }

    const editBtn = e.target.closest('.btn-row-edit');
    if (editBtn) {
      const order = state.orders.find((o) => o.id === editBtn.dataset.orderId);
      if (order) openOrderModal(order);
      return;
    }

    const delBtn = e.target.closest('.btn-row-delete');
    if (delBtn) {
      openConfirmDeleteModal([delBtn.dataset.orderId]);
    }
  });

  tbody?.addEventListener('dblclick', (e) => {
    if (e.target.closest('button, input')) return;
    const tr = e.target.closest('tr[data-order-id]');
    if (!tr) return;
    openOrderDrawer(tr.dataset.orderId);
  });

  tbody?.addEventListener('contextmenu', (e) => {
    const tr = e.target.closest('tr[data-order-id]');
    if (!tr) return;
    e.preventDefault();
    openRowContextMenu(e.clientX, e.clientY, tr.dataset.orderId);
  });

  // Eventos del Drawer de Detalle
  document.getElementById('btn-close-drawer')?.addEventListener('click', closeOrderDrawer);
  document.getElementById('order-drawer-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'order-drawer-backdrop') closeOrderDrawer();
  });

  document.getElementById('drawer-state-grid')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.state-quick-btn');
    if (!btn || !state.inspectingOrderId) return;
    const newState = btn.dataset.drawerState;
    const res = await api.changeOrdersState([state.inspectingOrderId], newState);
    if (res.ok) {
      state.orders = res.orders;
      applyFiltersAndRender();
      openOrderDrawer(state.inspectingOrderId);
      showToast(`Estado actualizado a "${newState}".`);
    }
  });

  document.getElementById('btn-drawer-copy')?.addEventListener('click', async () => {
    const order = state.orders.find((o) => o.id === state.inspectingOrderId);
    if (!order) return;
    const receipt = [
      "Café Pa'l Monte · Comprobante de Pedido",
      `Referencia: #${order.id}`,
      `Cliente: ${order.cliente}`,
      `Producto(s): ${order.producto}`,
      `Monto: ${formatMoney(order.monto)}`,
      `Fecha: ${order.fecha}`,
      `Estado: ${order.estado}`,
    ].join('\n');
    await api.copyToClipboard(receipt);
    showToast('Resumen del pedido copiado al portapapeles.');
  });

  document.getElementById('btn-drawer-receipt-pdf')?.addEventListener('click', async () => {
    const order = state.orders.find((o) => o.id === state.inspectingOrderId);
    if (!order) return;
    const cliStats = state.clientSummaryMap.get(order.cliente) || { count: 1, paidRevenue: order.monto };
    setStatusText(`Generando remisión oficial PDF para #${order.id}...`);
    const res = await api.exportOrderReceipt({
      order,
      clientStats: cliStats,
      openAfter: true,
    });
    if (res && res.ok) {
      if (res.reports) state.reports = res.reports;
      renderReportsList();
      showToast(`Remisión PDF #${order.id} generada y abierta.`);
      setStatusText(`Remisión guardada: ${res.filePath || ''}`);
    } else {
      showToast((res && res.message) || 'No se pudo generar la remisión PDF.');
    }
  });

  document.querySelectorAll('[data-wa-template]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const order = state.orders.find((o) => o.id === state.inspectingOrderId);
      if (!order) return;
      const tpl = btn.dataset.waTemplate;
      let msg = '';
      if (tpl === 'confirm') {
        msg = [
          `Hola *${order.cliente}*, te saludamos de *Café Pa'l Monte* (San Antonio, Jamundí).`,
          `Confirmamos la recepción de tu pedido *#${order.id}*:`,
          `• Producto(s): ${order.producto}`,
          `• Valor total: *${formatMoney(order.monto)}*`,
          `• Estado actual: *${order.estado}*`,
          `Gracias por preferir nuestro café especial de origen.`,
        ].join('\n');
      } else if (tpl === 'shipped') {
        msg = [
          `Hola *${order.cliente}*, ¡tu café va en camino!`,
          `Tu pedido *#${order.id}* (${order.producto}) de *Café Pa'l Monte* ya fue despachado.`,
          `Valor: *${formatMoney(order.monto)}*. Quedamos atentos a que lo recibas en perfecto estado.`,
        ].join('\n');
      } else if (tpl === 'payment') {
        msg = [
          `Hola *${order.cliente}*, te escribimos de *Café Pa'l Monte*.`,
          `Te recordamos amablemente el saldo pendiente de tu pedido *#${order.id}* del ${order.fecha}:`,
          `• Detalle: ${order.producto}`,
          `• Total por pagar: *${formatMoney(order.monto)}*`,
          `Apenas realices la transferencia envíanos el soporte por este chat para actualizar tu estado de cuenta. ¡Muchas gracias!`,
        ].join('\n');
      }
      await api.copyToClipboard(msg);
      showToast('Mensaje de WhatsApp copiado al portapapeles.');
    });
  });

  document.getElementById('btn-drawer-edit')?.addEventListener('click', () => {
    const order = state.orders.find((o) => o.id === state.inspectingOrderId);
    if (order) {
      closeOrderDrawer();
      openOrderModal(order);
    }
  });

  document.getElementById('btn-drawer-delete')?.addEventListener('click', () => {
    if (state.inspectingOrderId) {
      openConfirmDeleteModal([state.inspectingOrderId]);
    }
  });

  // Acciones en lote
  document.getElementById('btn-bulk-apply-state')?.addEventListener('click', async () => {
    const newState = document.getElementById('bulk-state-select')?.value;
    if (!newState) {
      showToast('Selecciona primero el estado que deseas aplicar.');
      return;
    }
    const ids = Array.from(state.selectedIds);
    const res = await api.changeOrdersState(ids, newState);
    if (res.ok) {
      state.orders = res.orders;
      state.stats = res.stats || state.stats;
      applyFiltersAndRender();
      showToast(`Estado actualizado a "${newState}" en ${res.updatedCount} pedido(s).`);
    }
  });

  document.getElementById('btn-bulk-delete')?.addEventListener('click', () => {
    openConfirmDeleteModal(Array.from(state.selectedIds));
  });

  // Estado vacío acciones rápidas
  document.getElementById('btn-empty-show-all')?.addEventListener('click', () => {
    state.stateFilter = 'ALL';
    state.searchQuery = '';
    if (tableSearch) tableSearch.value = '';
    if (globalSearch) globalSearch.value = '';
    const sel = document.getElementById('filter-state-select');
    if (sel) sel.value = 'ALL';
    applyPeriodPreset('all');
  });
  document.getElementById('btn-empty-add-manual')?.addEventListener('click', () => {
    openOrderModal(null);
  });
  document.getElementById('btn-empty-migrate')?.addEventListener('click', () => {
    switchView('system');
  });

  // Agregar / Editar Pedido Modal
  document.getElementById('btn-add-order')?.addEventListener('click', () => openOrderModal(null));
  document.getElementById('btn-close-order-modal')?.addEventListener('click', closeOrderModal);
  document.getElementById('btn-cancel-order-modal')?.addEventListener('click', closeOrderModal);
  document.getElementById('btn-generate-order-id')?.addEventListener('click', () => {
    document.getElementById('order-input-id').value = generateOrderId();
  });

  document.getElementById('btn-clear-catalog-items')?.addEventListener('click', () => {
    const inputProd = document.getElementById('order-input-product');
    const inputAmount = document.getElementById('order-input-amount');
    if (inputProd) inputProd.value = '';
    if (inputAmount) inputAmount.value = '';
  });

  document.getElementById('order-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('order-form-error');
    const id = document.getElementById('order-input-id').value.trim();
    const cliente = document.getElementById('order-input-client').value.trim();
    const producto = document.getElementById('order-input-product').value.trim();
    const montoRaw = document.getElementById('order-input-amount').value.trim();
    const fecha = document.getElementById('order-input-date').value.trim();
    const estado = document.getElementById('order-input-state').value;

    const showErr = (msg) => {
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
    };

    if (!id) return showErr('Ingresa un ID de referencia para el pedido.');
    if (!cliente) return showErr('Ingresa el nombre del cliente.');
    if (!producto) return showErr('Ingresa el detalle del producto.');
    const monto = Number(montoRaw);
    if (!Number.isFinite(monto) || monto < 0 || montoRaw === '') {
      return showErr('Ingresa un monto válido igual o mayor a 0.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return showErr('Selecciona una fecha válida (YYYY-MM-DD).');
    }

    const isEdit = Boolean(state.editingOrder);
    const res = await api.upsertOrder(
      {
        id,
        whatsapp_order_id: state.editingOrder?.whatsapp_order_id || null,
        cliente,
        producto,
        monto,
        fecha,
        estado,
      },
      isEdit
    );

    if (!res.ok) {
      return showErr(res.error || 'No se pudo guardar el pedido.');
    }

    state.orders = res.orders;
    state.stats = res.stats || state.stats;
    closeOrderModal();
    adjustDefaultDateRangeToOrders();
    applyFiltersAndRender();
    showToast(isEdit ? 'Pedido actualizado.' : 'Pedido registrado correctamente.');
  });

  // Modal Confirmación
  document.getElementById('btn-close-confirm-modal')?.addEventListener('click', closeConfirmModal);
  document.getElementById('btn-cancel-confirm')?.addEventListener('click', closeConfirmModal);
  document.getElementById('btn-accept-confirm')?.addEventListener('click', () => {
    if (state.confirmActionCallback) state.confirmActionCallback();
  });

  // Menú contextual de fila
  document.getElementById('row-context-menu')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.context-menu-item');
    if (!btn || !state.contextMenuOrderId) return;
    const targetId = state.contextMenuOrderId;
    closeRowContextMenu();

    if (btn.dataset.ctxAction === 'inspect') {
      openOrderDrawer(targetId);
    } else if (btn.dataset.ctxAction === 'edit') {
      const order = state.orders.find((o) => o.id === targetId);
      if (order) openOrderModal(order);
    } else if (btn.dataset.ctxAction === 'delete') {
      openConfirmDeleteModal([targetId]);
    } else if (btn.dataset.ctxState) {
      const newState = btn.dataset.ctxState;
      const res = await api.changeOrdersState([targetId], newState);
      if (res.ok) {
        state.orders = res.orders;
        applyFiltersAndRender();
        showToast(`Pedido ${targetId} marcado como "${newState}".`);
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#row-context-menu') && !e.target.closest('.btn-row-state-pill')) {
      closeRowContextMenu();
    }
  });

  // Atajos de teclado (/ para buscar, Escape para cerrar paneles)
  document.addEventListener('keydown', (e) => {
    if (
      e.key === '/' &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')
    ) {
      e.preventDefault();
      globalSearch?.focus();
      globalSearch?.select();
      return;
    }

    if (e.key === 'Escape') {
      closeRowContextMenu();
      closeOrderDrawer();
      closeOrderModal();
      closeConfirmModal();
      if (!document.getElementById('qr-modal-backdrop')?.classList.contains('hidden')) {
        document.getElementById('btn-cancel-qr')?.click();
      }
    }
  });

  // Conexión WhatsApp Business
  document.getElementById('btn-wa-connect')?.addEventListener('click', async () => {
    const visible = Boolean(document.getElementById('chk-wa-visible')?.checked);
    document.getElementById('qr-image')?.classList.add('hidden');
    document.getElementById('qr-placeholder')?.classList.remove('hidden');
    document.getElementById('qr-status-message').textContent =
      'Iniciando navegador seguro y cargando WhatsApp Business Web...';
    document.getElementById('qr-modal-backdrop')?.classList.remove('hidden');

    const res = await api.connectWhatsApp({ visible });
    if (!res.ok) {
      document.getElementById('qr-modal-backdrop')?.classList.add('hidden');
      showToast(res.error || 'No se pudo iniciar el navegador.');
    }
  });

  const cancelQrHandler = async () => {
    document.getElementById('qr-modal-backdrop')?.classList.add('hidden');
    await api.disconnectWhatsApp();
  };
  document.getElementById('btn-close-qr-modal')?.addEventListener('click', cancelQrHandler);
  document.getElementById('btn-cancel-qr')?.addEventListener('click', cancelQrHandler);

  document.getElementById('btn-wa-sync-manual')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-wa-sync-manual');
    btn.disabled = true;
    await api.syncManual();
    btn.disabled = false;
  });

  document.getElementById('btn-wa-sync-auto')?.addEventListener('click', async () => {
    const snap = await api.toggleAutoSync();
    updateConnectionUi(snap);
  });

  document.getElementById('btn-wa-disconnect')?.addEventListener('click', async () => {
    await api.disconnectWhatsApp();
  });

  // Controles de Analítica
  document.getElementById('btn-an-refresh')?.addEventListener('click', renderAnalytics);
  document.getElementById('an-year-select')?.addEventListener('change', renderAnalytics);
  document.getElementById('an-month-select')?.addEventListener('change', renderAnalytics);
  document.getElementById('an-top-limit')?.addEventListener('change', renderAnalytics);
  document.getElementById('an-hide-amounts')?.addEventListener('change', renderAnalytics);

  document.getElementById('btn-copy-customers')?.addEventListener('click', async () => {
    if (!state.topCustomersSnapshot.length) {
      showToast('No hay clientes en la lista para copiar.');
      return;
    }
    const text = state.topCustomersSnapshot.map((name, i) => `${i + 1}. ${name}`).join('\n');
    await api.copyToClipboard(text);
    showToast(`Listado de ${state.topCustomersSnapshot.length} clientes copiado al portapapeles.`);
  });

  // Controles de Reportes
  document.querySelectorAll('[data-quick-report]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handleQuickReport(btn.dataset.quickReport, btn.dataset.format);
    });
  });

  document.getElementById('btn-rep-custom-excel')?.addEventListener('click', () => {
    handleCustomReportExport('excel');
  });

  document.getElementById('btn-rep-custom-pdf')?.addEventListener('click', () => {
    handleCustomReportExport('pdf');
  });

  // Controles del módulo Clientes y Cartera (CRM)
  document.querySelectorAll('.crm-kpi-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      state.crmFilter = tile.dataset.crmFilter || 'all';
      renderClientsView();
    });
  });

  document.querySelectorAll('[data-crm-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.crmFilter = btn.dataset.crmTab || 'all';
      renderClientsView();
    });
  });

  document.getElementById('crm-search-input')?.addEventListener('input', (e) => {
    state.crmSearchQuery = e.target.value || '';
    renderClientsView();
  });

  document.getElementById('btn-crm-export-excel')?.addEventListener('click', () => {
    const pendingOrders = state.orders.filter((o) => o.estado === 'Pendiente');
    const targetOrders = pendingOrders.length ? pendingOrders : state.orders;
    const title = pendingOrders.length
      ? 'REPORTE DE CARTERA PENDIENTE POR COBRAR'
      : 'REPORTE GENERAL DE CLIENTES Y PEDIDOS';
    triggerExport('excel', targetOrders, state.dateFrom, state.dateTo, title);
  });

  document.getElementById('btn-crm-export-pdf')?.addEventListener('click', () => {
    const pendingOrders = state.orders.filter((o) => o.estado === 'Pendiente');
    const targetOrders = pendingOrders.length ? pendingOrders : state.orders;
    const title = pendingOrders.length
      ? 'REPORTE DE CARTERA PENDIENTE POR COBRAR'
      : 'REPORTE GENERAL DE CLIENTES Y PEDIDOS';
    triggerExport('pdf', targetOrders, state.dateFrom, state.dateTo, title);
  });

  document.getElementById('crm-tbody')?.addEventListener('click', async (e) => {
    const waBtn = e.target.closest('.btn-crm-wa');
    if (waBtn) {
      const cli = waBtn.dataset.client;
      const msg = buildClientWhatsAppMessage(cli);
      await api.copyToClipboard(msg);
      showToast(`Mensaje de WhatsApp para ${cli} copiado al portapapeles.`);
      return;
    }

    const pdfBtn = e.target.closest('.btn-crm-pdf');
    if (pdfBtn) {
      const cli = pdfBtn.dataset.client;
      const cliOrders = state.orders.filter((o) => o.cliente === cli);
      const dates = cliOrders.map((o) => o.fecha).filter(Boolean).sort();
      await triggerExport(
        'pdf',
        cliOrders,
        dates[0] || state.dateFrom,
        dates[dates.length - 1] || state.dateTo,
        `ESTADO DE CUENTA · ${cli.toUpperCase()}`
      );
      return;
    }

    const ordBtn = e.target.closest('.btn-crm-orders');
    if (ordBtn) {
      const cli = ordBtn.dataset.client;
      state.searchQuery = cli;
      const tableSearch = document.getElementById('filter-search');
      const globalSearch = document.getElementById('global-search-input');
      if (tableSearch) tableSearch.value = cli;
      if (globalSearch) globalSearch.value = cli;
      switchView('panel');
      applyPeriodPreset('all');
      showToast(`Filtrando pedidos de ${cli}.`);
    }
  });

  document.getElementById('btn-refresh-reports')?.addEventListener('click', async () => {
    state.reports = await api.listReports();
    renderReportsList();
    showToast('Historial de reportes actualizado.');
  });

  document.getElementById('reports-list-container')?.addEventListener('click', async (e) => {
    const openBtn = e.target.closest('.btn-report-open');
    if (openBtn) {
      await api.openFile(openBtn.dataset.path);
      return;
    }
    const folderBtn = e.target.closest('.btn-report-folder');
    if (folderBtn) {
      await api.showInFolder(folderBtn.dataset.path);
    }
  });

  // Controles de Sistema, Migración de BD y Actualización
  document.getElementById('btn-sys-backup')?.addEventListener('click', async () => {
    const res = await api.createBackup();
    if (res.ok) {
      showToast('Copia de seguridad creada con éxito.');
      setStatusText(`Respaldo guardado en: ${res.backupPath}`);
    } else {
      showToast(res.error || 'No se pudo crear el respaldo.');
    }
  });

  document.getElementById('btn-sys-open-folder')?.addEventListener('click', async () => {
    await api.openDataFolder();
  });

  document.getElementById('btn-seed-demo-data')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-seed-demo-data');
    if (btn) btn.disabled = true;
    setStatusText('Sembrando pedidos realistas hasta la hora actual y generando reportes PDF/Excel...');
    const res = await api.seedDemoData();
    if (btn) btn.disabled = false;
    if (res && res.ok) {
      state.orders = res.orders || state.orders;
      state.stats = res.stats || state.stats;
      state.reports = res.reports || state.reports;
      adjustDefaultDateRangeToOrders();
      applyPeriodPreset('all');
      renderSystemView();
      renderReportsList();
      showToast(`Se cargaron ${res.totalInDb} pedidos realistas hasta hoy (${res.latestDate}) y 3 reportes oficiales.`);
      setStatusText(`Datos de prueba actualizados hasta hoy (${res.totalInDb} pedidos).`);
    } else {
      showToast((res && res.error) || 'No se pudieron cargar los datos de prueba.');
    }
  });

  document.getElementById('btn-migrate-pick-folder')?.addEventListener('click', async () => {
    const res = await api.pickLegacySource('folder');
    if (!res.canceled) showMigrationPreview(res.inspection);
  });

  document.getElementById('btn-migrate-pick-file')?.addEventListener('click', async () => {
    const res = await api.pickLegacySource('file');
    if (!res.canceled) showMigrationPreview(res.inspection);
  });

  document.getElementById('btn-migration-confirm')?.addEventListener('click', async () => {
    if (state.pendingMigrationPath) {
      await executeMigration(state.pendingMigrationPath);
    }
  });

  document.getElementById('known-sources-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-import-known');
    if (!btn) return;
    await executeMigration(btn.dataset.sourcePath);
  });

  document.getElementById('btn-run-update-wizard')?.addEventListener('click', async () => {
    const res = await api.runUpdateWizardFile();
    if (res && res.ok) {
      showToast('Respaldo creado. Abriendo Wizard de actualización...');
    }
  });

  document.getElementById('btn-check-github-updates')?.addEventListener('click', async () => {
    const note = document.getElementById('updater-status-note');
    note.textContent = 'Consultando estado de versión...';
    note.classList.remove('hidden');
    const res = await api.checkForUpdates();
    note.textContent = res.message || `Versión instalada v${state.version} operativa.`;
  });

  document.getElementById('btn-open-setup-wizard')?.addEventListener('click', () => {
    openSetupWizardModal('install');
  });

  document.getElementById('btn-close-setup-wizard')?.addEventListener('click', () => {
    document.getElementById('setup-wizard-modal-backdrop')?.classList.add('hidden');
  });

  document.getElementById('btn-cancel-setup-wizard')?.addEventListener('click', () => {
    document.getElementById('setup-wizard-modal-backdrop')?.classList.add('hidden');
  });

  document.getElementById('btn-wizard-pick-dir')?.addEventListener('click', async () => {
    const res = await api.pickInstallFolder();
    if (res && !res.canceled && res.folderPath) {
      const dirInput = document.getElementById('wizard-target-dir');
      if (dirInput) dirInput.value = res.folderPath;
    }
  });

  document.getElementById('btn-wizard-install-now')?.addEventListener('click', async () => {
    const installBtn = document.getElementById('btn-wizard-install-now');
    const uninstBtn = document.getElementById('btn-wizard-uninstall-now');
    const progWrap = document.getElementById('wizard-progress-wrap');
    const progBar = document.getElementById('wizard-progress-bar');
    const progText = document.getElementById('wizard-progress-text');
    const progPct = document.getElementById('wizard-progress-pct');
    const resBox = document.getElementById('wizard-result-box');
    const resTitle = document.getElementById('wizard-result-title');
    const resDetails = document.getElementById('wizard-result-details');

    const targetDir = document.getElementById('wizard-target-dir')?.value || '';
    const createDesktopShortcut = document.getElementById('chk-wizard-desktop')?.checked !== false;
    const createStartMenuShortcut = document.getElementById('chk-wizard-startmenu')?.checked !== false;

    if (installBtn) installBtn.disabled = true;
    if (uninstBtn) uninstBtn.disabled = true;
    resBox?.classList.add('hidden');
    progWrap?.classList.remove('hidden');
    if (progBar) progBar.style.width = '10%';
    if (progPct) progPct.textContent = '10%';
    if (progText) progText.textContent = 'Iniciando instalación en Windows...';

    const res = await api.runSetupWizardInstall({
      targetDir,
      createDesktopShortcut,
      createStartMenuShortcut,
    });

    if (installBtn) installBtn.disabled = false;
    if (uninstBtn) uninstBtn.disabled = false;

    if (res && res.ok) {
      if (progBar) progBar.style.width = '100%';
      if (progPct) progPct.textContent = '100%';
      if (progText) progText.textContent = 'Instalación completada.';
      resBox?.classList.remove('hidden');
      if (resTitle) resTitle.textContent = 'Aplicación instalada y actualizada en este equipo';
      if (resDetails) {
        resDetails.textContent = `Instalada en: ${res.installDir}. Se crearon los accesos directos en tu Escritorio y Menú Inicio con el ícono de Café Pa'l Monte.`;
      }
      showToast('Instalación completada con éxito en tu equipo.');
    } else {
      showToast((res && res.error) || 'Error durante la instalación.');
    }
  });

  document.getElementById('btn-wizard-uninstall-now')?.addEventListener('click', () => {
    document.getElementById('setup-wizard-modal-backdrop')?.classList.add('hidden');
    triggerUninstallConfirmation();
  });

  document.getElementById('btn-run-uninstaller')?.addEventListener('click', () => {
    triggerUninstallConfirmation();
  });
}

async function openSetupWizardModal(mode = 'install') {
  const backdrop = document.getElementById('setup-wizard-modal-backdrop');
  const dirInput = document.getElementById('wizard-target-dir');
  const progWrap = document.getElementById('wizard-progress-wrap');
  const resBox = document.getElementById('wizard-result-box');
  progWrap?.classList.add('hidden');
  resBox?.classList.add('hidden');

  const st = await api.getInstallStatus();
  if (dirInput && st && st.installDir) {
    dirInput.value = st.installDir;
  }
  backdrop?.classList.remove('hidden');
  if (mode === 'uninstall') {
    document.getElementById('btn-wizard-uninstall-now')?.focus();
  } else {
    document.getElementById('btn-wizard-install-now')?.focus();
  }
}

function triggerUninstallConfirmation() {
  const backdrop = document.getElementById('confirm-modal-backdrop');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const confirmBtn = document.getElementById('btn-accept-confirm');
  if (titleEl) titleEl.textContent = 'Confirmar desinstalación del sistema';
  if (msgEl) {
    msgEl.textContent =
      "¿Deseas desinstalar Café Pa'l Monte de este equipo? El Wizard creará un respaldo automático de orders.db, eliminará los accesos directos del Escritorio y Menú Inicio y borrará la carpeta del programa, conservando intactos tus pedidos y reportes en tu carpeta de usuario.";
  }
  if (confirmBtn) confirmBtn.textContent = 'Sí, desinstalar aplicación';

  state.confirmActionCallback = async () => {
    const targetDir = document.getElementById('wizard-target-dir')?.value || undefined;
    closeConfirmModal();
    showToast('Creando respaldo de orders.db y desinstalando aplicación...');
    await api.runUninstallerWizard({ targetDir });
  };
  backdrop?.classList.remove('hidden');
}

// ── Suscripción a Eventos en Tiempo Real del Proceso Principal ───────────────
function bindIpcStreams() {
  api.onStatus((msg) => {
    setStatusText(msg);
  });

  api.onConnectionState((payload) => {
    updateConnectionUi(payload);
  });

  api.onQrUpdate((qrData) => {
    const img = document.getElementById('qr-image');
    const ph = document.getElementById('qr-placeholder');
    const msg = document.getElementById('qr-status-message');
    if (!qrData) return;

    if (qrData.linked) {
      document.getElementById('qr-modal-backdrop')?.classList.add('hidden');
      showToast('WhatsApp Business vinculado con éxito.');
      return;
    }

    if (qrData.qrDataUrl && img && ph) {
      img.src = qrData.qrDataUrl;
      img.classList.remove('hidden');
      ph.classList.add('hidden');
    } else if (msg) {
      msg.textContent = qrData.statusText || 'Preparando código QR...';
    }
  });

  api.onWizardProgress((data) => {
    if (!data) return;
    const progWrap = document.getElementById('wizard-progress-wrap');
    const progBar = document.getElementById('wizard-progress-bar');
    const progText = document.getElementById('wizard-progress-text');
    const progPct = document.getElementById('wizard-progress-pct');
    progWrap?.classList.remove('hidden');
    if (progBar) progBar.style.width = `${data.percent || 0}%`;
    if (progPct) progPct.textContent = `${data.percent || 0}%`;
    if (progText && data.stepText) progText.textContent = data.stepText;
  });

  api.onOrdersUpdated((data) => {
    if (data && Array.isArray(data.orders)) {
      state.orders = data.orders;
      state.stats = data.stats || state.stats;
      adjustDefaultDateRangeToOrders();
      applyFiltersAndRender();
      if (state.currentView === 'analytics') renderAnalytics();
      if (state.currentView === 'system') renderSystemView();
    }
  });
}

// ── Arranque de la Aplicación ────────────────────────────────────────────────
async function bootstrap() {
  initDateControls();
  bindDomEvents();
  bindIpcStreams();

  const init = await api.getInitialState();
  state.version = init.version || '2.0.0';
  state.orders = init.orders || [];
  state.stats = init.stats || state.stats;
  state.reports = init.reports || [];
  state.dataDir = init.dataDir || '';
  state.dbPath = init.dbPath || '';
  state.reportsDir = init.reportsDir || '';
  state.knownLegacySources = init.knownLegacySources || [];
  state.catalogProducts = init.catalogProducts || [];
  if (init.settings?.monthlyGoal) {
    state.monthlyGoal = Number(init.settings.monthlyGoal) || 2500000;
  }

  if (init.logoDataUrl) {
    const logoImg = document.getElementById('brand-logo');
    if (logoImg) logoImg.src = init.logoDataUrl;
  }

  document.getElementById('app-version-label').textContent = `v${state.version} · Escritorio`;

  applyTheme(init.settings?.theme || 'light');
  updateConnectionUi(init.connection || { connected: false });

  if (
    init.autoMigration &&
    init.autoMigration.ran &&
    (init.autoMigration.importedOrders > 0 || init.autoMigration.copiedReports > 0)
  ) {
    const banner = document.getElementById('migration-banner');
    const bannerTxt = document.getElementById('migration-banner-text');
    if (banner && bannerTxt) {
      bannerTxt.textContent =
        `Migración automática completada: se importaron ${init.autoMigration.importedOrders} pedido(s) y ` +
        `${init.autoMigration.copiedReports} reporte(s) desde tu instalación anterior a la nueva base de datos segura.`;
      banner.classList.remove('hidden');
    }
  }

  adjustDefaultDateRangeToOrders();
  applyFiltersAndRender();

  if (init.launchMode === 'install-wizard') {
    switchView('system');
    openSetupWizardModal('install');
  } else if (init.launchMode === 'uninstall-wizard') {
    switchView('system');
    triggerUninstallConfirmation();
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
