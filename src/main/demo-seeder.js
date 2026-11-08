const fs = require('node:fs');
const path = require('node:path');

const CATALOG_PRODUCTS = [
  {
    code: 'CPM-G500',
    name: "Café Especial Pa'l Monte Grano 500g",
    unitPrice: 32000,
    category: 'Línea Origen 500g',
  },
  {
    code: 'CPM-M500',
    name: "Café Especial San Antonio Molido 500g",
    unitPrice: 32000,
    category: 'Línea Origen 500g',
  },
  {
    code: 'CPM-ORG500',
    name: 'Café Orgánico Sierra de Jamundí 500g',
    unitPrice: 35000,
    category: 'Línea Orgánica',
  },
  {
    code: 'CPM-BR340',
    name: 'Café Bourbón Rosado Reserva 340g',
    unitPrice: 42000,
    category: 'Microlotes Especiales',
  },
  {
    code: 'CPM-M250',
    name: "Café Especial Tostión Media 250g",
    unitPrice: 18500,
    category: 'Presentación 250g',
  },
  {
    code: 'CPM-KIT3',
    name: "Kit Degustación Pa'l Monte (3x250g)",
    unitPrice: 56000,
    category: 'Estuches y Regalos',
  },
  {
    code: 'CPM-MAY25',
    name: 'Bulto Mayorista Café Excelso 2.5kg',
    unitPrice: 145000,
    category: ' institucional / HORECA',
  },
  {
    code: 'CPM-CAJA6',
    name: 'Caja Cafetería 6x500g Tostión Media',
    unitPrice: 180000,
    category: 'Institucional / HORECA',
  },
];

const DEMO_CLIENTS = [
  'Cafetería San Antonio Plaza',
  'Hotel Boutique Farallones',
  'Mercado Orgánico Ciudad Jardín',
  'Isabella Pacheco',
  'Bistró La Tertulia Cali',
  'Carlos Andrés Restrepo',
  'Valeria Gómez · Café Lab',
  'Restaurante El Mirador del Valle',
  'Tienda Gourmet Pance',
  'Juan Sebastián Domínguez',
  'Camila Torres',
  'Diego Fernando Vélez',
  'Sofía Rincón',
  'Andrés Felipe Lozano',
  'Coworking Distrito Granada',
  'Panadería Artesanal La Flora',
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIsoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toSqliteDateTime(d) {
  return `${toIsoDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * Genera un conjunto completo y realista de órdenes de Café Pa'l Monte
 * hasta la fecha y hora exacta actual (`now`).
 */
function buildRealisticOrdersUpToNow(now = new Date()) {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0..11
  const currentDay = now.getDate();

  const orders = [];
  let seq = 100;

  const makeOrder = ({ dateObj, clientIdx, combos, estado, hourOffset = 10 }) => {
    seq += 1;
    const yStr = String(dateObj.getFullYear()).slice(-2);
    const mStr = pad2(dateObj.getMonth() + 1);
    const dStr = pad2(dateObj.getDate());
    const id = `4W${yStr}${mStr}${dStr}${seq}`;
    const cliente = DEMO_CLIENTS[clientIdx % DEMO_CLIENTS.length];

    let monto = 0;
    const descParts = [];
    for (const { prodIdx, qty } of combos) {
      const p = CATALOG_PRODUCTS[prodIdx % CATALOG_PRODUCTS.length];
      monto += p.unitPrice * qty;
      descParts.push(`${qty}x ${p.name}`);
    }

    const syncDate = new Date(
      dateObj.getFullYear(),
      dateObj.getMonth(),
      dateObj.getDate(),
      Math.min(23, hourOffset),
      (seq * 7) % 60,
      (seq * 13) % 60
    );

    orders.push({
      id,
      whatsapp_order_id: id,
      cliente,
      producto: descParts.join(', '),
      monto,
      fecha: toIsoDate(dateObj),
      estado,
      synced_at: toSqliteDateTime(syncDate),
    });
  };

  // 1. Histórico 2024 y 2025 para comparativa plurianual (12 órdenes)
  const historicalSeeds = [
    { y: currentYear - 2, m: 3, d: 14, cli: 0, combos: [{ prodIdx: 6, qty: 2 }, { prodIdx: 0, qty: 3 }], estado: 'Completado' },
    { y: currentYear - 2, m: 7, d: 22, cli: 1, combos: [{ prodIdx: 7, qty: 2 }], estado: 'Entregado' },
    { y: currentYear - 2, m: 10, d: 18, cli: 2, combos: [{ prodIdx: 6, qty: 3 }], estado: 'Completado' },
    { y: currentYear - 2, m: 11, d: 29, cli: 4, combos: [{ prodIdx: 7, qty: 3 }, { prodIdx: 5, qty: 4 }], estado: 'Entregado' },

    { y: currentYear - 1, m: 1, d: 19, cli: 0, combos: [{ prodIdx: 6, qty: 2 }], estado: 'Completado' },
    { y: currentYear - 1, m: 3, d: 11, cli: 2, combos: [{ prodIdx: 7, qty: 2 }, { prodIdx: 2, qty: 4 }], estado: 'Entregado' },
    { y: currentYear - 1, m: 5, d: 24, cli: 1, combos: [{ prodIdx: 6, qty: 3 }, { prodIdx: 3, qty: 2 }], estado: 'Completado' },
    { y: currentYear - 1, m: 7, d: 15, cli: 4, combos: [{ prodIdx: 7, qty: 2 }, { prodIdx: 0, qty: 5 }], estado: 'Entregado' },
    { y: currentYear - 1, m: 9, d: 8, cli: 8, combos: [{ prodIdx: 6, qty: 2 }, { prodIdx: 5, qty: 3 }], estado: 'Completado' },
    { y: currentYear - 1, m: 10, d: 21, cli: 3, combos: [{ prodIdx: 3, qty: 4 }, { prodIdx: 1, qty: 3 }], estado: 'Completado' },
    { y: currentYear - 1, m: 11, d: 17, cli: 6, combos: [{ prodIdx: 7, qty: 3 }], estado: 'Entregado' },
    { y: currentYear - 1, m: 11, d: 28, cli: 7, combos: [{ prodIdx: 6, qty: 2 }, { prodIdx: 5, qty: 5 }], estado: 'Completado' },
  ];

  for (const h of historicalSeeds) {
    makeOrder({
      dateObj: new Date(h.y, h.m, h.d),
      clientIdx: h.cli,
      combos: h.combos,
      estado: h.estado,
      hourOffset: 14,
    });
  }

  // 2. Meses del año actual hasta el mes anterior al actual (con estacionalidad orgánica)
  const monthMults = [1, 1, 2, 1, 2, 3, 2, 3, 2, 4, 3, 4];
  for (let m = 0; m < currentMonth; m += 1) {
    const daysInMonth = new Date(currentYear, m + 1, 0).getDate();
    const mult = monthMults[m % monthMults.length];
    const monthlyTemplates = [
      { day: 4, cli: (m * 3) % DEMO_CLIENTS.length, combos: [{ prodIdx: 0, qty: 2 + (m % 3) }, { prodIdx: 4, qty: 2 }], estado: 'Completado' },
      { day: 9, cli: (m * 3 + 1) % DEMO_CLIENTS.length, combos: [{ prodIdx: 6, qty: 1 + (mult > 2 ? 1 : 0) }, { prodIdx: 2, qty: 1 + (m % 2) }], estado: 'Entregado' },
      { day: 15, cli: (m * 3 + 2) % DEMO_CLIENTS.length, combos: [{ prodIdx: 7, qty: 1 + (m % 2) }], estado: 'Completado' },
      { day: 21, cli: (m * 3 + 4) % DEMO_CLIENTS.length, combos: [{ prodIdx: 1, qty: 2 + mult }, { prodIdx: 3, qty: 1 + (m % 2) }], estado: 'Entregado' },
      { day: Math.min(26, daysInMonth), cli: (m * 3 + 5) % DEMO_CLIENTS.length, combos: [{ prodIdx: 5, qty: 1 + (m % 3) }, { prodIdx: 0, qty: mult }], estado: m >= currentMonth - 1 ? 'Enviado' : 'Completado' },
    ];
    if (mult >= 3) {
      monthlyTemplates.push({
        day: 12,
        cli: (m * 2 + 3) % DEMO_CLIENTS.length,
        combos: [{ prodIdx: 6, qty: 2 }, { prodIdx: 3, qty: 2 }],
        estado: 'Completado',
      });
    }

    // Agregar 1 cancelado en algunos meses para analítica de cancelaciones
    if (m % 2 === 1) {
      monthlyTemplates.push({
        day: 18,
        cli: (m + 9) % DEMO_CLIENTS.length,
        combos: [{ prodIdx: 1, qty: 2 }],
        estado: 'Cancelado',
      });
    }

    // En el mes inmediatamente anterior dejar también 1 orden pendiente de cobro
    if (m === currentMonth - 1) {
      monthlyTemplates.push({
        day: Math.min(28, daysInMonth),
        cli: 2,
        combos: [{ prodIdx: 7, qty: 2 }],
        estado: 'Pendiente',
      });
    }

    for (const tpl of monthlyTemplates) {
      makeOrder({
        dateObj: new Date(currentYear, m, tpl.day),
        clientIdx: tpl.cli,
        combos: tpl.combos,
        estado: tpl.estado,
        hourOffset: 11 + (tpl.day % 7),
      });
    }
  }

  // 3. Órdenes del mes actual hasta el día y hora actual (`now`)
  const recentOffsets = [
    { daysAgo: 6, cli: 0, combos: [{ prodIdx: 7, qty: 2 }, { prodIdx: 3, qty: 2 }], estado: 'Completado', hr: 9 },
    { daysAgo: 5, cli: 1, combos: [{ prodIdx: 6, qty: 2 }], estado: 'Entregado', hr: 11 },
    { daysAgo: 4, cli: 3, combos: [{ prodIdx: 0, qty: 4 }, { prodIdx: 5, qty: 1 }], estado: 'Completado', hr: 15 },
    { daysAgo: 3, cli: 4, combos: [{ prodIdx: 2, qty: 5 }], estado: 'Enviado', hr: 10 },
    { daysAgo: 2, cli: 6, combos: [{ prodIdx: 3, qty: 3 }, { prodIdx: 4, qty: 4 }], estado: 'Enviado', hr: 16 },
    { daysAgo: 2, cli: 10, combos: [{ prodIdx: 1, qty: 2 }], estado: 'Cancelado', hr: 18 },
    { daysAgo: 1, cli: 7, combos: [{ prodIdx: 6, qty: 1 }, { prodIdx: 0, qty: 3 }], estado: 'Envío en preparación', hr: 14 },
    { daysAgo: 1, cli: 8, combos: [{ prodIdx: 7, qty: 1 }, { prodIdx: 2, qty: 2 }], estado: 'Pendiente', hr: 17 },
    { daysAgo: 0, cli: 0, combos: [{ prodIdx: 6, qty: 2 }, { prodIdx: 3, qty: 3 }], estado: 'Completado', hr: Math.max(8, now.getHours() - 2) },
    { daysAgo: 0, cli: 3, combos: [{ prodIdx: 5, qty: 2 }, { prodIdx: 0, qty: 2 }], estado: 'Pendiente', hr: Math.max(9, now.getHours() - 1) },
    { daysAgo: 0, cli: 5, combos: [{ prodIdx: 1, qty: 3 }, { prodIdx: 4, qty: 2 }], estado: 'Envío en preparación', hr: now.getHours() },
  ];

  for (const r of recentOffsets) {
    const d = new Date(now.getFullYear(), now.getMonth(), currentDay - r.daysAgo);
    makeOrder({
      dateObj: d,
      clientIdx: r.cli,
      combos: r.combos,
      estado: r.estado,
      hourOffset: r.hr,
    });
  }

  return orders;
}

/**
 * Siembra la base de datos con los datos realistas hasta la fecha/hora actual
 * y regenera reportes limpios de ejemplo.
 */
async function seedDatabaseAndReports({ db, exporter, now = new Date(), cleanExisting = true }) {
  const backupPath = db.createBackup('pre_seed_demo');

  if (cleanExisting) {
    const conn = db._open();
    try {
      conn.exec('DELETE FROM orders;');
      conn.exec('DELETE FROM deleted_orders;');
    } finally {
      conn.close();
    }

    // Limpiar reportes viejos/corruptos de prueba para dejar reportes nuevos verificados
    if (exporter && exporter.reportsDir && fs.existsSync(exporter.reportsDir)) {
      for (const fname of fs.readdirSync(exporter.reportsDir)) {
        const lower = fname.toLowerCase();
        if (lower.endsWith('.pdf') || lower.endsWith('.xlsx')) {
          try {
            fs.unlinkSync(path.join(exporter.reportsDir, fname));
          } catch (_) {}
        }
      }
    }
  }

  const demoOrders = buildRealisticOrdersUpToNow(now);
  const upsertRes = db.upsertOrders(demoOrders);
  const allOrders = db.getAll();

  const currentYear = now.getFullYear();
  const ytdFrom = `${currentYear}-01-01`;
  const todayStr = toIsoDate(now);
  const ytdOrders = allOrders.filter((o) => o.fecha >= ytdFrom && o.fecha <= todayStr);

  const generatedFiles = [];
  if (exporter && ytdOrders.length > 0) {
    const pdfRes = await exporter.toPdf(ytdOrders, ytdFrom, todayStr);
    if (pdfRes && pdfRes.ok) generatedFiles.push(pdfRes.filePath);

    const xlsRes = await exporter.toExcel(ytdOrders, ytdFrom, todayStr);
    if (xlsRes && xlsRes.ok) generatedFiles.push(xlsRes.filePath);

    const latestOrder = ytdOrders[0];
    if (latestOrder) {
      const recRes = await exporter.toOrderReceiptPdf(latestOrder, {
        count: allOrders.filter((o) => o.cliente === latestOrder.cliente).length,
        paidRevenue: allOrders
          .filter((o) => o.cliente === latestOrder.cliente && o.estado !== 'Cancelado' && o.estado !== 'Pendiente')
          .reduce((a, b) => a + Number(b.monto || 0), 0),
      });
      if (recRes && recRes.ok) generatedFiles.push(recRes.filePath);
    }
  }

  return {
    ok: true,
    backupPath,
    seededCount: demoOrders.length,
    totalInDb: allOrders.length,
    generatedFiles,
    latestDate: todayStr,
    orders: allOrders,
    stats: db.getSyncStats(),
    reports: exporter ? exporter.listReports() : [],
  };
}

module.exports = {
  CATALOG_PRODUCTS,
  DEMO_CLIENTS,
  buildRealisticOrdersUpToNow,
  seedDatabaseAndReports,
};
