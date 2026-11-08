/* ==========================================================================
   Café Pa'l Monte · Lógica de Interfaz de Escritorio (Renderer)
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
  orders: [],
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
  contextMenuOrderId: null,
  confirmActionCallback: null,
  topCustomersSnapshot: [],
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
  listReports: async () => [],
  openFile: async () => ({ ok: true }),
  showInFolder: async () => ({ ok: true }),
  pickLegacySource: async () => ({ canceled: true }),
  migrateFromPath: async () => ({ ok: true, importedOrders: 0, updatedOrders: 0, orders: state.orders }),
  createBackup: async () => ({ ok: true, backupPath: 'backup.db' }),
  openDataFolder: async () => ({ ok: true }),
  checkForUpdates: async () => ({ ok: true, updateAvailable: false, message: 'Versión v2.0.0 al día.' }),
  runUpdateWizardFile: async () => ({ canceled: true }),
  runUninstallerWizard: async () => ({ ok: true }),
  onStatus: () => {},
  onConnectionState: () => {},
  onQrUpdate: () => {},
  onOrdersUpdated: () => {},
};

// ── Utilidades de formato ────────────────────────────────────────────────────
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
  const num = Number(value || 0);
  return (
    '$' +
    num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3800);
}

function setStatusText(text) {
  const statusEl = document.getElementById('statusbar-text');
  const waSub = document.getElementById('wa-status-sub');
  if (statusEl) statusEl.textContent = text;
  if (waSub) waSub.textContent = text;
}

// ── Tema Claro / Oscuro (R-21, R-34) ─────────────────────────────────────────
function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  state.theme = next;
  document.documentElement.setAttribute('data-theme', next);
  const lbl = document.getElementById('theme-toggle-label');
  if (lbl) {
    lbl.textContent = next === 'dark' ? 'Tema: Tueste Nocturno' : 'Tema: Pergamino Claro';
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

  // Por defecto: mostrar desde el inicio del año o el pedido más antiguo para no ocultar nada
  state.dateFrom = `${curYear}-01-01`;
  state.dateTo = todayIso();

  const inputFrom = document.getElementById('filter-date-from');
  const inputTo = document.getElementById('filter-date-to');
  if (inputFrom) inputFrom.value = state.dateFrom;
  if (inputTo) inputTo.value = state.dateTo;

  const topbarDate = document.getElementById('topbar-date');
  if (topbarDate) {
    topbarDate.textContent = now.toLocaleDateString('es-CO', {
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

  const titleEl = document.getElementById('topbar-title');
  const subEl = document.getElementById('topbar-subtitle');

  const meta = {
    panel: {
      title: 'Panel de Pedidos',
      sub: 'Consolidación contable de órdenes de WhatsApp Business',
    },
    analytics: {
      title: 'Analítica Comercial',
      sub: 'Métricas financieras, productos de mayor ingreso y clientes principales',
    },
    reports: {
      title: 'Reportes Oficiales PDF y Excel',
      sub: "Generación e historial de cierres con papel membrete de Café Pa'l Monte",
    },
    system: {
      title: 'Base de Datos, Migración y Actualizaciones',
      sub: 'Gestión de SQLite local, importación de versiones anteriores y Wizard de actualización',
    },
  }[viewName];

  if (meta && titleEl && subEl) {
    titleEl.textContent = meta.title;
    subEl.textContent = meta.sub;
  }

  if (viewName === 'analytics') {
    renderAnalytics();
  } else if (viewName === 'reports') {
    renderReportsList();
  } else if (viewName === 'system') {
    renderSystemView();
  }
}

// ── Filtrado, Ordenamiento y Renderizado del Panel ───────────────────────────
function applyFiltersAndRender() {
  const fromVal = document.getElementById('filter-date-from')?.value || '0000-01-01';
  const toVal = document.getElementById('filter-date-to')?.value || '9999-12-31';
  state.dateFrom = fromVal;
  state.dateTo = toVal;

  const query = state.searchQuery.trim().toLowerCase();

  // 1) Filtrar por rango de fecha y búsqueda para KPIs del periodo
  const periodOrders = state.orders.filter((o) => {
    const inDate = o.fecha >= fromVal && o.fecha <= toVal;
    if (!inDate) return false;
    if (query) {
      const hay = `${o.id} ${o.cliente} ${o.producto} ${o.estado}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  updatePanelKpis(periodOrders);

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

  // Limpiar selecciones que ya no estén visibles
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

  const statusRight = document.getElementById('statusbar-db-summary');
  if (statusRight) {
    statusRight.textContent = `${state.orders.length} pedidos en SQLite WAL`;
  }
}

function updatePanelKpis(periodOrders) {
  const paidOrders = periodOrders.filter((o) => PAID_STATES.has(o.estado));
  const totalRevenue = paidOrders.reduce((acc, o) => acc + Number(o.monto || 0), 0);
  const avgTicket = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;
  const pendingCount = periodOrders.filter((o) => o.estado === 'Pendiente').length;
  const cancelledCount = periodOrders.filter((o) => o.estado === 'Cancelado').length;

  document.getElementById('kpi-total-revenue').textContent = formatMoney(totalRevenue);
  document.getElementById('kpi-ticket-avg').textContent = `Ticket promedio: ${formatMoney(avgTicket)}`;
  document.getElementById('kpi-count-total').textContent = String(periodOrders.length);
  document.getElementById('kpi-count-paid').textContent = String(paidOrders.length);
  document.getElementById('kpi-count-pending').textContent = String(pendingCount);
  document.getElementById('kpi-count-cancelled').textContent = String(cancelledCount);

  document.querySelectorAll('.metric-tile').forEach((tile) => {
    tile.classList.toggle('active', tile.dataset.stateFilter === state.stateFilter);
  });
}

function renderOrdersTable() {
  const tbody = document.getElementById('orders-tbody');
  const emptyState = document.getElementById('orders-empty-state');
  const countSummary = document.getElementById('table-count-summary');
  const chkAll = document.getElementById('chk-select-all');

  if (countSummary) {
    countSummary.textContent = `${state.filteredOrders.length} resultado(s) en vista · ${state.orders.length} total en base de datos`;
  }

  // Actualizar indicadores de ordenamiento
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
      const checked = state.selectedIds.has(o.id) ? 'checked' : '';
      const badgeCls = getBadgeClass(o.estado);
      return `
        <tr data-order-id="${escapeHtml(o.id)}">
          <td class="col-check">
            <input
              type="checkbox"
              class="row-select-chk"
              data-order-id="${escapeHtml(o.id)}"
              aria-label="Seleccionar pedido ${escapeHtml(o.id)}"
              ${checked}
            />
          </td>
          <td class="col-id">${escapeHtml(o.id)}</td>
          <td class="col-client">${escapeHtml(o.cliente)}</td>
          <td class="col-product">${escapeHtml(o.producto)}</td>
          <td class="col-date">${escapeHtml(o.fecha)}</td>
          <td class="col-amount">${formatMoney(o.monto)}</td>
          <td class="col-state">
            <span class="badge-pill ${badgeCls}">${escapeHtml(o.estado)}</span>
          </td>
          <td class="col-actions">
            <div class="row-actions-group">
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

// ── Analítica Comercial (6 Gráficos + KPIs) ──────────────────────────────────
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

function renderAnalytics() {
  const { year, orders } = getAnalyticsOrders();
  const paidOrders = orders.filter((o) => PAID_STATES.has(o.estado));
  const totalRev = paidOrders.reduce((acc, o) => acc + Number(o.monto || 0), 0);
  const avgTicket = paidOrders.length > 0 ? totalRev / paidOrders.length : 0;
  const paidRate = orders.length > 0 ? (paidOrders.length / orders.length) * 100 : 0;

  document.getElementById('an-scope-summary').textContent =
    `${orders.length} órdenes analizadas · ${formatMoney(totalRev)} facturados`;

  document.getElementById('an-kpi-ticket').textContent = formatMoney(avgTicket);
  document.getElementById('an-kpi-rate').textContent = `${paidRate.toFixed(1)}%`;

  // Producto estrella y mejor cliente
  const prodRev = new Map();
  const cliRev = new Map();
  for (const o of paidOrders) {
    prodRev.set(o.producto, (prodRev.get(o.producto) || 0) + Number(o.monto || 0));
    cliRev.set(o.cliente, (cliRev.get(o.cliente) || 0) + Number(o.monto || 0));
  }

  const bestProd = Array.from(prodRev.entries()).sort((a, b) => b[1] - a[1])[0];
  const bestCli = Array.from(cliRev.entries()).sort((a, b) => b[1] - a[1])[0];

  document.getElementById('an-kpi-product').textContent = bestProd ? bestProd[0] : 'Sin registros';
  document.getElementById('an-kpi-product-sub').textContent = bestProd
    ? `${formatMoney(bestProd[1])} generados`
    : 'Según ventas pagadas del periodo';

  document.getElementById('an-kpi-customer').textContent = bestCli ? bestCli[0] : 'Sin registros';
  document.getElementById('an-kpi-customer-sub').textContent = bestCli
    ? `${formatMoney(bestCli[1])} acumulados`
    : 'Mayor facturación acumulada';

  renderMonthlyChart(orders, year);
  renderAnnualChart(year);
  renderCancelledChart(orders, year);
  renderStatusBreakdownChart(orders);
  renderTopProductsChart(paidOrders);
  renderTopCustomersChart(paidOrders);
}

function renderMonthlyChart(orders, year) {
  const monthly = new Array(12).fill(0);
  for (const o of orders) {
    if (String(o.fecha || '').startsWith(String(year)) && PAID_STATES.has(o.estado)) {
      const m = Number(String(o.fecha).slice(5, 7)) - 1;
      if (m >= 0 && m < 12) monthly[m] += Number(o.monto || 0);
    }
  }
  const totalYear = monthly.reduce((a, b) => a + b, 0);
  document.getElementById('chart-monthly-sub').textContent =
    `Año ${year} · Total facturado: ${formatMoney(totalYear)}`;

  const maxVal = Math.max(...monthly, 1);
  const container = document.getElementById('chart-monthly-container');
  container.innerHTML = `
    <div class="vbar-chart">
      ${monthly
        .map((val, idx) => {
          const pct = val > 0 ? Math.max(4, Math.round((val / maxVal) * 100)) : 2;
          return `
            <div class="vbar-col">
              <span class="vbar-val">${val > 0 ? formatMoneyCompact(val) : '$0'}</span>
              <div class="vbar-track">
                <div class="vbar-fill" style="height: ${pct}%"></div>
              </div>
              <span class="vbar-label">${MESES_CORTOS[idx]}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
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
    `Acumulado histórico: ${formatMoney(totalAll)}`;

  const maxRev = Math.max(...entries.map(([, d]) => d.revenue), 1);
  const container = document.getElementById('chart-annual-container');
  container.innerHTML = `
    <div class="vbar-chart">
      ${entries
        .map(([yr, d]) => {
          const pct = d.revenue > 0 ? Math.max(5, Math.round((d.revenue / maxRev) * 100)) : 2;
          const cls = yr === currentYear ? 'vbar-fill fill-cafeto' : 'vbar-fill';
          return `
            <div class="vbar-col">
              <span class="vbar-val">${formatMoneyCompact(d.revenue)}<br/><small>(${d.count} ord.)</small></span>
              <div class="vbar-track">
                <div class="${cls}" style="height: ${pct}%"></div>
              </div>
              <span class="vbar-label">${yr}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderCancelledChart(orders, year) {
  const counts = new Array(12).fill(0);
  for (const o of orders) {
    if (String(o.fecha || '').startsWith(String(year)) && o.estado === 'Cancelado') {
      const m = Number(String(o.fecha).slice(5, 7)) - 1;
      if (m >= 0 && m < 12) counts[m] += 1;
    }
  }
  const totalCanc = counts.reduce((a, b) => a + b, 0);
  document.getElementById('chart-cancelled-sub').textContent =
    `Año ${year} · Total canceladas: ${totalCanc}`;

  const maxC = Math.max(...counts, 1);
  const container = document.getElementById('chart-cancelled-container');
  container.innerHTML = `
    <div class="vbar-chart">
      ${counts
        .map((c, idx) => {
          const pct = c > 0 ? Math.max(6, Math.round((c / maxC) * 100)) : 2;
          return `
            <div class="vbar-col">
              <span class="vbar-val">${c}</span>
              <div class="vbar-track">
                <div class="vbar-fill fill-danger" style="height: ${pct}%"></div>
              </div>
              <span class="vbar-label">${MESES_CORTOS[idx]}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderStatusBreakdownChart(orders) {
  const container = document.getElementById('chart-status-container');
  if (!orders.length) {
    container.innerHTML = `<p class="chart-subtitle">No hay órdenes en este periodo para calcular distribución.</p>`;
    return;
  }
  const counts = new Map();
  for (const o of orders) {
    const st = o.estado || 'Desconocido';
    counts.set(st, (counts.get(st) || 0) + 1);
  }
  const list = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  container.innerHTML = `
    <div class="hbar-list">
      ${list
        .map(([st, cnt]) => {
          const pct = ((cnt / orders.length) * 100).toFixed(1);
          return `
            <div class="hbar-item">
              <div class="hbar-top">
                <span class="hbar-name">${escapeHtml(st)}</span>
                <span class="hbar-metric">${cnt} órdenes (${pct}%)</span>
              </div>
              <div class="hbar-track">
                <div class="hbar-fill" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderTopProductsChart(paidOrders) {
  const container = document.getElementById('chart-products-container');
  if (!paidOrders.length) {
    container.innerHTML = `<p class="chart-subtitle">No hay ventas pagadas en el periodo seleccionado.</p>`;
    return;
  }
  const map = new Map();
  for (const o of paidOrders) {
    map.set(o.producto, (map.get(o.producto) || 0) + Number(o.monto || 0));
  }
  const top5 = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxVal = Math.max(...top5.map(([, v]) => v), 1);

  container.innerHTML = `
    <div class="hbar-list">
      ${top5
        .map(([prod, val]) => {
          const pct = Math.max(4, Math.round((val / maxVal) * 100));
          return `
            <div class="hbar-item">
              <div class="hbar-top">
                <span class="hbar-name">${escapeHtml(prod)}</span>
                <span class="hbar-metric">${formatMoney(val)}</span>
              </div>
              <div class="hbar-track">
                <div class="hbar-fill" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderTopCustomersChart(paidOrders) {
  const container = document.getElementById('chart-customers-container');
  const limit = Number(document.getElementById('an-top-limit')?.value || 10);
  const hideAmounts = Boolean(document.getElementById('an-hide-amounts')?.checked);

  if (!paidOrders.length) {
    state.topCustomersSnapshot = [];
    container.innerHTML = `<p class="chart-subtitle">No hay clientes con órdenes pagadas en este periodo.</p>`;
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
  const maxVal = Math.max(...topList.map(([, d]) => d.revenue), 1);

  container.innerHTML = `
    <div class="hbar-list">
      ${topList
        .map(([cli, d], idx) => {
          const pct = Math.max(4, Math.round((d.revenue / maxVal) * 100));
          const metricLabel = hideAmounts
            ? `${d.count} pedido(s)`
            : `${formatMoney(d.revenue)} · ${d.count} pedido(s)`;
          return `
            <div class="hbar-item">
              <div class="hbar-top">
                <span class="hbar-name">${idx + 1}. ${escapeHtml(cli)}</span>
                <span class="hbar-metric">${metricLabel}</span>
              </div>
              <div class="hbar-track">
                <div class="hbar-fill" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
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
            <button type="button" class="btn btn-sm btn-roast btn-report-open" data-path="${escapeHtml(r.path)}">
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

async function triggerExport(format, ordersToExport, dateFrom, dateTo) {
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

// ── Vista Sistema, Migración de BD y Actualizaciones ─────────────────────────
function renderSystemView() {
  document.getElementById('sys-db-path').textContent = state.dbPath || '';
  document.getElementById('sys-reports-path').textContent = state.reportsDir || '';
  document.getElementById('sys-sync-stats').textContent =
    `${state.orders.length} pedidos totales (${state.stats.with_whatsapp_id || 0} con ID oficial de WhatsApp Business)`;
  document.getElementById('sys-version-pill').textContent = `Versión instalada: v${state.version}`;

  const knownContainer = document.getElementById('known-sources-list');
  if (!state.knownLegacySources.length) {
    knownContainer.innerHTML = `<p class="system-desc">No se detectaron otras carpetas pendientes por migrar. Puedes seleccionar cualquier carpeta o archivo <code>orders.db</code> manualmente.</p>`;
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
        <button type="button" class="btn btn-sm btn-cafeto btn-import-known" data-source-path="${escapeHtml(src.sourceLabel)}">
          Importar y Fusionar
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

  backdrop.classList.remove('hidden');
  setTimeout(() => {
    (orderToEdit ? inputClient : inputId).focus();
  }, 30);
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
  const confirmBtn = document.getElementById('btn-confirm-action');
  if (titleEl) titleEl.textContent = 'Confirmar eliminación';
  if (confirmBtn) confirmBtn.textContent = 'Eliminar';
  msg.textContent = `¿Confirmas que deseas eliminar ${orderIds.length} pedido(s)? Quedarán marcados como descartados para que la sincronización de WhatsApp no los vuelva a importar.`;

  state.confirmActionCallback = async () => {
    const res = await api.deleteOrders(orderIds);
    if (res.ok) {
      state.orders = res.orders;
      state.stats = res.stats || state.stats;
      orderIds.forEach((id) => state.selectedIds.delete(id));
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
        ? 'Sincronización Automática: Activa'
        : 'Activar Sincronización Automática';
      autoBtn.classList.toggle('paused', !autoSyncActive);
    }
  } else {
    discActions.classList.remove('hidden');
    connActions.classList.add('hidden');
  }
}

// ── Menú Contextual (Click Derecho en fila de la tabla) ──────────────────────
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

  // Tarjetas de filtro rápido por estado
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
    applyFiltersAndRender();
  });

  document.getElementById('btn-all-dates')?.addEventListener('click', () => {
    const dates = state.orders.map((o) => o.fecha).filter(Boolean).sort();
    const minD = dates[0] || '2020-01-01';
    const maxD = dates[dates.length - 1] || todayIso();
    document.getElementById('filter-date-from').value = minD;
    document.getElementById('filter-date-to').value = maxD > todayIso() ? maxD : todayIso();
    state.stateFilter = 'ALL';
    state.searchQuery = '';
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-state-select').value = 'ALL';
    applyFiltersAndRender();
  });

  document.getElementById('btn-quick-month-go')?.addEventListener('click', () => {
    const m = Number(document.getElementById('filter-quick-month')?.value || 1);
    const y = Number(document.getElementById('filter-quick-year')?.value || new Date().getFullYear());
    const lastDay = new Date(y, m, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    document.getElementById('filter-date-from').value = `${y}-${pad(m)}-01`;
    document.getElementById('filter-date-to').value = `${y}-${pad(m)}-${pad(lastDay)}`;
    applyFiltersAndRender();
  });

  document.getElementById('filter-search')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value || '';
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
    updateBulkBar();
  });

  tbody?.addEventListener('click', (e) => {
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
    const order = state.orders.find((o) => o.id === tr.dataset.orderId);
    if (order) openOrderModal(order);
  });

  tbody?.addEventListener('contextmenu', (e) => {
    const tr = e.target.closest('tr[data-order-id]');
    if (!tr) return;
    e.preventDefault();
    openRowContextMenu(e.clientX, e.clientY, tr.dataset.orderId);
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
    document.getElementById('btn-all-dates')?.click();
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
      Boolean(state.editingOrder)
    );

    if (!res.ok) {
      return showErr(res.error || 'No se pudo guardar el pedido.');
    }

    state.orders = res.orders;
    state.stats = res.stats || state.stats;
    closeOrderModal();
    adjustDefaultDateRangeToOrders();
    applyFiltersAndRender();
    showToast(state.editingOrder ? 'Pedido actualizado.' : 'Pedido registrado correctamente.');
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

    if (btn.dataset.ctxAction === 'edit') {
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
    if (!e.target.closest('#row-context-menu')) {
      closeRowContextMenu();
    }
  });

  // Cerrar modales y menú con tecla Escape (R-26, R-32)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeRowContextMenu();
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

  document.getElementById('btn-run-uninstaller')?.addEventListener('click', () => {
    const backdrop = document.getElementById('confirm-modal-backdrop');
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const confirmBtn = document.getElementById('btn-confirm-action');
    if (titleEl) titleEl.textContent = 'Confirmar desinstalación';
    if (msgEl) {
      msgEl.textContent =
        "¿Deseas abrir el Wizard de desinstalación de Café Pa'l Monte? El sistema creará un respaldo automático de orders.db y conservará tus pedidos en tu carpeta de datos de usuario.";
    }
    if (confirmBtn) confirmBtn.textContent = 'Abrir Wizard de Desinstalación';

    state.confirmActionCallback = async () => {
      closeConfirmModal();
      const res = await api.runUninstallerWizard();
      if (res && res.openedSettings) {
        const note = document.getElementById('updater-status-note');
        if (note) {
          note.textContent = res.message;
          note.classList.remove('hidden');
        }
      } else {
        showToast('Respaldo creado. Iniciando Wizard de desinstalación...');
      }
    };
    backdrop?.classList.remove('hidden');
  });
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

  if (init.logoDataUrl) {
    const logoImg = document.getElementById('brand-logo');
    if (logoImg) logoImg.src = init.logoDataUrl;
  }

  document.getElementById('app-version-label').textContent =
    `v${state.version} · Edición Escritorio`;

  applyTheme(init.settings?.theme || 'light');
  updateConnectionUi(init.connection || { connected: false });

  // Si la migración automática inicial importó pedidos o reportes, mostrar banner informativo
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
}

document.addEventListener('DOMContentLoaded', bootstrap);
