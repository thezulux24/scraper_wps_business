const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { REPORTS_DIR, ensureDataDirs, getAssetPath } = require('./paths');

const PAID_STATES = new Set([
  'Completado',
  'Enviado',
  'Envío en preparación',
  'Entregado',
]);

const ESTADO_COLORS = {
  Completado: 'D1FAE5',
  Pendiente: 'FEF3C7',
  Cancelado: 'FEE2E2',
  Enviado: 'EFF6FF',
  'Envío en preparación': 'F5F3FF',
  Entregado: 'D1FAE5',
};

function normalizeOrders(orders = []) {
  const todayIso = new Date().toISOString().slice(0, 10);
  return orders.map((o) => {
    const monto = Number(o.monto || 0);
    return {
      id: String(o.id || ''),
      cliente: String(o.cliente || 'Desconocido'),
      producto: String(o.producto || 'Sin descripción'),
      fecha: String(o.fecha || todayIso),
      monto: Number.isFinite(monto) ? monto : 0,
      estado: String(o.estado || 'Desconocido'),
    };
  });
}

function formatTimestampForFilename(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function formatDateTimeHuman(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatCurrency(num) {
  return '$' + Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

class ReportExporter {
  constructor(reportsDir = REPORTS_DIR) {
    ensureDataDirs();
    this.reportsDir = reportsDir;
  }

  async toExcel(rawOrders = [], dateFrom = '', dateTo = '') {
    const orders = normalizeOrders(rawOrders);
    if (!orders.length) {
      return { ok: false, message: 'No hay órdenes en el periodo seleccionado para exportar.' };
    }

    ensureDataDirs();
    const ts = formatTimestampForFilename();
    const filePath = path.join(this.reportsDir, `reporte_${ts}.xlsx`);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Café Pa'l Monte";
    wb.created = new Date();

    const ws = wb.addWorksheet('Órdenes', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = [
      { header: 'ID', key: 'id', width: 16 },
      { header: 'Cliente', key: 'cliente', width: 26 },
      { header: 'Producto', key: 'producto', width: 32 },
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Monto', key: 'monto', width: 16 },
      { header: 'Estado', key: 'estado', width: 18 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075E54' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      };
    });

    for (const o of orders) {
      const row = ws.addRow(o);
      row.height = 20;
      const bgHex = ESTADO_COLORS[o.estado] || 'FFFFFF';
      row.eachCell((cell, colNumber) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${bgHex}` } };
        cell.alignment = {
          horizontal: colNumber === 5 ? 'right' : colNumber === 2 || colNumber === 3 ? 'left' : 'center',
          vertical: 'middle',
          wrapText: colNumber === 2 || colNumber === 3,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
        if (colNumber === 5) {
          cell.numFmt = '$#,##0.00';
        }
      });
    }

    const totalRevenue = orders
      .filter((o) => PAID_STATES.has(o.estado))
      .reduce((acc, o) => acc + o.monto, 0);

    const totalRow = ws.addRow({
      id: '',
      cliente: '',
      producto: '',
      fecha: 'TOTAL',
      monto: totalRevenue,
      estado: '',
    });
    totalRow.height = 22;
    totalRow.getCell(4).font = { bold: true, size: 10 };
    totalRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    totalRow.getCell(5).font = { bold: true, size: 10, color: { argb: 'FF075E54' } };
    totalRow.getCell(5).numFmt = '$#,##0.00';
    totalRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };

    // Hoja 2: Resumen
    const wsSummary = wb.addWorksheet('Resumen');
    wsSummary.getColumn(1).width = 24;
    wsSummary.getColumn(2).width = 18;
    wsSummary.getColumn(4).width = 22;
    wsSummary.getColumn(5).width = 14;

    wsSummary.getCell('A1').value = "Café Pa'l Monte - Reporte";
    wsSummary.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF075E54' } };
    wsSummary.getCell('A2').value = `Período: ${dateFrom || 'Inicio'} a ${dateTo || 'Hoy'}`;
    wsSummary.getCell('A2').font = { italic: true, size: 10 };
    wsSummary.getCell('A3').value = `Generado: ${formatDateTimeHuman()}`;
    wsSummary.getCell('A3').font = { italic: true, size: 10 };

    const byEst = {};
    for (const o of orders) {
      byEst[o.estado] = (byEst[o.estado] || 0) + 1;
    }
    const pagadas = orders.filter((o) => PAID_STATES.has(o.estado)).length;

    const kpis = [
      ['Métrica', 'Valor'],
      ['Total órdenes', orders.length],
      ['Total facturado', totalRevenue],
      ['Pagadas', pagadas],
      ['Pendientes', byEst['Pendiente'] || 0],
      ['Canceladas', byEst['Cancelado'] || 0],
      ['Promedio/orden', pagadas ? totalRevenue / pagadas : 0],
    ];

    kpis.forEach(([label, val], idx) => {
      const r = 5 + idx;
      const cA = wsSummary.getCell(r, 1);
      const cB = wsSummary.getCell(r, 2);
      cA.value = label;
      cB.value = val;
      if (idx === 0) {
        cA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075E54' } };
        cB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075E54' } };
        cA.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cB.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      } else {
        cB.font = { bold: true, color: { argb: 'FF075E54' } };
        if (label === 'Total facturado' || label === 'Promedio/orden') {
          cB.numFmt = '$#,##0.00';
        }
      }
    });

    const logoPath = getAssetPath('logo.jpg');
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        const imgId = wb.addImage({ filename: logoPath, extension: 'jpeg' });
        wsSummary.addImage(imgId, {
          tl: { col: 3.2, row: 0.5 },
          ext: { width: 120, height: 120 },
        });
      } catch (_) {}
    }

    await wb.xlsx.writeFile(filePath);
    return { ok: true, filePath, message: `Reporte Excel guardado en:\n${filePath}` };
  }

  async toPdf(rawOrders = [], dateFrom = '', dateTo = '') {
    const orders = normalizeOrders(rawOrders);
    if (!orders.length) {
      return { ok: false, message: 'No hay órdenes en el periodo seleccionado para exportar.' };
    }

    ensureDataDirs();
    const ts = formatTimestampForFilename();
    const filePath = path.join(this.reportsDir, `reporte_${ts}.pdf`);
    const bgImgPath = getAssetPath('image.png');
    const hasBg = bgImgPath && fs.existsSync(bgImgPath);

    const totalRevenue = orders
      .filter((o) => PAID_STATES.has(o.estado))
      .reduce((acc, o) => acc + o.monto, 0);
    const pagadas = orders.filter((o) => PAID_STATES.has(o.estado)).length;
    const pendientes = orders.filter((o) => o.estado === 'Pendiente').length;
    const generatedStr = formatDateTimeHuman();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 145, bottom: 95, left: 42, right: 42 },
        bufferPages: true,
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const contentW = pageW - 84;

      const drawBackgroundAndChrome = (pageNum) => {
        doc.save();
        if (hasBg) {
          try {
            doc.image(bgImgPath, 0, 0, { width: pageW, height: pageH });
          } catch (_) {}
        }
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor('#6B7280')
          .text(
            `Período: ${dateFrom || 'Inicio'} a ${dateTo || 'Hoy'}   |   Generado: ${generatedStr}`,
            42,
            32,
            { width: contentW, align: 'right', lineBreak: false }
          );

        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#6B7280')
          .text("Café Pa'l Monte · Reporte de pedidos", 42, pageH - 28, {
            lineBreak: false,
          });
        doc.text(`Página ${pageNum}`, 42, pageH - 28, {
          width: contentW,
          align: 'right',
          lineBreak: false,
        });
        doc.restore();
      };

      let pageNumber = 1;
      drawBackgroundAndChrome(pageNumber);

      doc.on('pageAdded', () => {
        pageNumber += 1;
        drawBackgroundAndChrome(pageNumber);
      });

      // Encabezado principal
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#075E54')
        .text("Café Pa'l Monte", 42, 140, { width: contentW, align: 'center' });

      doc
        .moveTo(42, 163)
        .lineTo(pageW - 42, 163)
        .lineWidth(1)
        .strokeColor('#075E54')
        .stroke();

      // Barra de KPIs
      const kpiY = 172;
      doc.roundedRect(42, kpiY, contentW, 24, 4).fill('#075E54');
      const kpiTexts = [
        `Total: ${formatCurrency(totalRevenue)}`,
        `Órdenes: ${orders.length}`,
        `Pagadas: ${pagadas}`,
        `Pendientes: ${pendientes}`,
      ];
      const colKpiW = contentW / 4;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF');
      kpiTexts.forEach((txt, i) => {
        doc.text(txt, 42 + i * colKpiW, kpiY + 7, {
          width: colKpiW,
          align: 'center',
          lineBreak: false,
        });
      });

      // Tabla de órdenes
      const colWidths = [68, 108, 146, 58, 62, 69]; // suma = 511 (~contentW)
      const headers = ['ID', 'Cliente', 'Producto', 'Fecha', 'Monto', 'Estado'];

      const drawTableHeader = (y) => {
        doc.rect(42, y, contentW, 20).fill('#075E54');
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF');
        let x = 42;
        headers.forEach((h, i) => {
          doc.text(h, x + 4, y + 6, {
            width: colWidths[i] - 8,
            align: 'center',
            lineBreak: false,
          });
          x += colWidths[i];
        });
        return y + 20;
      };

      let curY = drawTableHeader(208);

      orders.forEach((o, idx) => {
        const clienteLines = Math.ceil(o.cliente.length / 22) || 1;
        const prodLines = Math.ceil(o.producto.length / 30) || 1;
        const maxLines = Math.min(3, Math.max(1, clienteLines, prodLines));
        const rowH = 12 + maxLines * 9;

        if (curY + rowH > pageH - 115) {
          doc.addPage();
          curY = drawTableHeader(145);
        }

        const baseBg = idx % 2 === 0 ? '#FFFFFF' : '#F3F4F6';
        doc.rect(42, curY, contentW, rowH).fill(baseBg);

        // Celda de estado coloreada
        const stateHex = `#${ESTADO_COLORS[o.estado] || 'FFFFFF'}`;
        const stateX = 42 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4];
        doc.rect(stateX, curY, colWidths[5], rowH).fill(stateHex);

        // Bordes sutiles
        doc
          .rect(42, curY, contentW, rowH)
          .lineWidth(0.3)
          .strokeColor('#E5E7EB')
          .stroke();

        doc.font('Helvetica').fontSize(7.6).fillColor('#1F2937');
        const cells = [
          { val: o.id, align: 'left' },
          { val: o.cliente, align: 'left' },
          { val: o.producto, align: 'left' },
          { val: o.fecha, align: 'center' },
          { val: formatCurrency(o.monto), align: 'right' },
          { val: o.estado, align: 'center' },
        ];

        let x = 42;
        cells.forEach((c, i) => {
          doc.text(c.val, x + 4, curY + 5, {
            width: colWidths[i] - 8,
            height: rowH - 6,
            align: c.align,
            ellipsis: true,
          });
          x += colWidths[i];
        });

        curY += rowH;
      });

      // Fila Total
      if (curY + 22 > pageH - 110) {
        doc.addPage();
        curY = 145;
      }
      doc.rect(42, curY, contentW, 20).fill('#E5E7EB');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1F2937');
      const totalLabelX = 42 + colWidths[0] + colWidths[1] + colWidths[2];
      doc.text('TOTAL', totalLabelX + 4, curY + 6, {
        width: colWidths[3] - 8,
        align: 'center',
        lineBreak: false,
      });
      doc.fillColor('#075E54').text(formatCurrency(totalRevenue), totalLabelX + colWidths[3] + 4, curY + 6, {
        width: colWidths[4] - 8,
        align: 'right',
        lineBreak: false,
      });

      doc.end();
      stream.on('finish', () => {
        resolve({ ok: true, filePath, message: `Reporte PDF guardado en:\n${filePath}` });
      });
      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  listReports() {
    ensureDataDirs();
    if (!fs.existsSync(this.reportsDir)) return [];
    const entries = fs.readdirSync(this.reportsDir);
    const items = [];
    for (const fname of entries) {
      const lower = fname.toLowerCase();
      if (!lower.endsWith('.pdf') && !lower.endsWith('.xlsx')) continue;
      const fullPath = path.join(this.reportsDir, fname);
      try {
        const st = fs.statSync(fullPath);
        if (!st.isFile()) continue;
        items.push({
          name: fname,
          path: fullPath,
          type: lower.endsWith('.pdf') ? 'pdf' : 'excel',
          sizeBytes: st.size,
          mtimeMs: st.mtimeMs,
          createdAt: new Date(st.mtimeMs).toLocaleString('es-CO'),
        });
      } catch (_) {}
    }
    items.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return items;
  }
}

module.exports = { ReportExporter, PAID_STATES };
