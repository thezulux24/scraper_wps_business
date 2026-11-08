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
  Entregado: 'D1FAE5',
  Enviado: 'DBEAFE',
  'Envío en preparación': 'E0E7FF',
  Pendiente: 'FEF3C7',
  Cancelado: 'FEE2E2',
};

const ESTADO_TEXT_COLORS = {
  Completado: '#14532D',
  Entregado: '#14532D',
  Enviado: '#1E3A8A',
  'Envío en preparación': '#312E81',
  Pendiente: '#78350F',
  Cancelado: '#7F1D1D',
};

function cleanPdfText(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOrders(orders = []) {
  const todayIso = new Date().toISOString().slice(0, 10);
  return orders.map((o) => {
    const monto = Number(o.monto || 0);
    return {
      id: cleanPdfText(o.id || ''),
      cliente: cleanPdfText(o.cliente || 'Cliente sin nombre') || 'Cliente sin nombre',
      producto: cleanPdfText(o.producto || 'Sin descripción') || 'Sin descripción',
      fecha: cleanPdfText(o.fecha || todayIso),
      monto: Number.isFinite(monto) ? monto : 0,
      estado: cleanPdfText(o.estado || 'Pendiente') || 'Pendiente',
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
  return (
    '$' +
    Number(num || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function resolveSystemFonts() {
  const winFonts = process.env.WINDIR
    ? path.join(process.env.WINDIR, 'Fonts')
    : 'C:\\Windows\\Fonts';
  const regCandidates = [
    path.join(winFonts, 'segoeui.ttf'),
    path.join(winFonts, 'arial.ttf'),
  ];
  const boldCandidates = [
    path.join(winFonts, 'segoeuib.ttf'),
    path.join(winFonts, 'arialbd.ttf'),
  ];
  const regPath = regCandidates.find((p) => fs.existsSync(p)) || null;
  const boldPath = boldCandidates.find((p) => fs.existsSync(p)) || null;
  return { regPath, boldPath };
}

class ReportExporter {
  constructor(reportsDir = REPORTS_DIR) {
    ensureDataDirs();
    this.reportsDir = reportsDir;
  }

  async toExcel(rawOrders = [], dateFrom = '', dateTo = '', customTitle = '') {
    const orders = normalizeOrders(rawOrders);
    if (!orders.length) {
      return { ok: false, message: 'No hay órdenes en el periodo seleccionado para exportar.' };
    }

    ensureDataDirs();
    const ts = formatTimestampForFilename();
    const prefix = customTitle ? 'estado_cuenta_' : 'reporte_';
    const filePath = path.join(this.reportsDir, `${prefix}${ts}.xlsx`);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Café Pa'l Monte · NIT 6.559.455-1";
    wb.created = new Date();

    const paidOrders = orders.filter((o) => PAID_STATES.has(o.estado));
    const pendingOrders = orders.filter((o) => o.estado === 'Pendiente');
    const cancelledOrders = orders.filter((o) => o.estado === 'Cancelado');

    const totalRevenue = paidOrders.reduce((acc, o) => acc + o.monto, 0);
    const pendingAmount = pendingOrders.reduce((acc, o) => acc + o.monto, 0);
    const cancelledAmount = cancelledOrders.reduce((acc, o) => acc + o.monto, 0);
    const avgTicket = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

    // ── Hoja 1: Órdenes Detalladas ──────────────────────────────────────────
    const ws = wb.addWorksheet('Órdenes Detalladas', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });

    ws.columns = [
      { key: 'id', width: 18 },
      { key: 'fecha', width: 14 },
      { key: 'cliente', width: 28 },
      { key: 'producto', width: 42 },
      { key: 'monto', width: 16 },
      { key: 'estado', width: 22 },
      { key: 'contable', width: 18 },
    ];

    // Banner corporativo superior
    ws.mergeCells('A1:G1');
    const titleCell = ws.getCell('A1');
    titleCell.value = customTitle || "CAFÉ PA'L MONTE · REPORTE CONTABLE DE PEDIDOS";
    titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D2E' } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 28;

    ws.mergeCells('A2:G2');
    const subCell = ws.getCell('A2');
    subCell.value = `San Antonio, Jamundí · NIT 6.559.455-1   |   Período: ${dateFrom || 'Histórico'} a ${dateTo || 'Hoy'}   |   Generado: ${formatDateTimeHuman()}   |   Ingresos aprobados: ${formatCurrency(totalRevenue)}`;
    subCell.font = { size: 9.5, color: { argb: 'FF374151' }, italic: true };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3EFEA' } };
    subCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(2).height = 20;

    ws.getRow(3).height = 8;

    const headers = [
      'ID Referencia',
      'Fecha',
      'Cliente',
      'Productos Solicitados',
      'Monto ($)',
      'Estado Operativo',
      'Cierre Contable',
    ];
    const headerRow = ws.getRow(4);
    headerRow.values = headers;
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1612' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      };
    });

    ws.autoFilter = 'A4:G4';

    for (const o of orders) {
      const isPaid = PAID_STATES.has(o.estado);
      const contableLabel = isPaid
        ? 'Aprobado (Suma)'
        : o.estado === 'Pendiente'
          ? 'Por cobrar'
          : 'Excluido';
      const row = ws.addRow({
        id: o.id,
        fecha: o.fecha,
        cliente: o.cliente,
        producto: o.producto,
        monto: o.monto,
        estado: o.estado,
        contable: contableLabel,
      });
      row.height = 21;
      const bgHex = ESTADO_COLORS[o.estado] || 'FFFFFF';
      row.eachCell((cell, colNumber) => {
        const useStatusBg = colNumber >= 6;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: useStatusBg ? `FF${bgHex}` : 'FFFFFFFF' },
        };
        cell.alignment = {
          horizontal:
            colNumber === 5
              ? 'right'
              : colNumber === 3 || colNumber === 4
                ? 'left'
                : 'center',
          vertical: 'middle',
          wrapText: colNumber === 3 || colNumber === 4,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
        if (colNumber === 5) {
          cell.numFmt = '$#,##0.00';
          cell.font = { bold: isPaid, color: { argb: o.estado === 'Cancelado' ? 'FF9CA3AF' : 'FF111827' } };
        }
      });
    }

    // Filas de cierre contable
    const addSummaryFooterRow = (label, amount, fgArgb, bgArgb) => {
      const r = ws.addRow({
        id: '',
        fecha: '',
        cliente: '',
        producto: label,
        monto: amount,
        estado: '',
        contable: '',
      });
      r.height = 22;
      r.getCell(4).font = { bold: true, size: 10, color: { argb: fgArgb } };
      r.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(5).font = { bold: true, size: 10.5, color: { argb: fgArgb } };
      r.getCell(5).numFmt = '$#,##0.00';
      r.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
      r.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
    };

    ws.addRow({});
    addSummaryFooterRow('TOTAL INGRESOS APROBADOS (CIERRE NETO)', totalRevenue, 'FF14532D', 'FFD1FAE5');
    addSummaryFooterRow('TOTAL PENDIENTE POR COBRAR (CARTERA)', pendingAmount, 'FF78350F', 'FFFEF3C7');
    if (cancelledAmount > 0) {
      addSummaryFooterRow('TOTAL PEDIDOS CANCELADOS (EXCLUIDO)', cancelledAmount, 'FF7F1D1D', 'FFFEE2E2');
    }

    // ── Hoja 2: Resumen Ejecutivo y Analítica ───────────────────────────────
    const wsSummary = wb.addWorksheet('Resumen Ejecutivo');
    wsSummary.getColumn(1).width = 30;
    wsSummary.getColumn(2).width = 20;
    wsSummary.getColumn(3).width = 6;
    wsSummary.getColumn(4).width = 34;
    wsSummary.getColumn(5).width = 16;
    wsSummary.getColumn(6).width = 18;

    wsSummary.getCell('A1').value = "Café Pa'l Monte · Resumen Ejecutivo";
    wsSummary.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1B4D2E' } };
    wsSummary.getCell('A2').value = `Período analizado: ${dateFrom || 'Inicio'} a ${dateTo || 'Hoy'}`;
    wsSummary.getCell('A2').font = { italic: true, size: 10 };
    wsSummary.getCell('A3').value = `Generado: ${formatDateTimeHuman()}`;
    wsSummary.getCell('A3').font = { italic: true, size: 10 };

    const kpis = [
      ['Indicador Contable', 'Resultado'],
      ['Total órdenes registradas', orders.length],
      ['Órdenes aprobadas / en curso', paidOrders.length],
      ['Órdenes pendientes de cobro', pendingOrders.length],
      ['Órdenes canceladas', cancelledOrders.length],
      ['Ingresos netos aprobados ($)', totalRevenue],
      ['Cartera pendiente por cobrar ($)', pendingAmount],
      ['Monto cancelado excluido ($)', cancelledAmount],
      ['Ticket promedio aprobado ($)', avgTicket],
    ];

    kpis.forEach(([label, val], idx) => {
      const r = 5 + idx;
      const cA = wsSummary.getCell(r, 1);
      const cB = wsSummary.getCell(r, 2);
      cA.value = label;
      cB.value = val;
      if (idx === 0) {
        cA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D2E' } };
        cB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D2E' } };
        cA.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cB.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      } else {
        cA.font = { size: 10 };
        cB.font = { bold: true, size: 10, color: { argb: 'FF111827' } };
        if (label.includes('($)')) {
          cB.numFmt = '$#,##0.00';
        }
      }
    });

    // Top Clientes en columnas D-F
    const cliMap = new Map();
    for (const o of paidOrders) {
      const cur = cliMap.get(o.cliente) || { count: 0, rev: 0 };
      cur.count += 1;
      cur.rev += o.monto;
      cliMap.set(o.cliente, cur);
    }
    const topClients = Array.from(cliMap.entries())
      .sort((a, b) => b[1].rev - a[1].rev)
      .slice(0, 10);

    wsSummary.getCell(5, 4).value = 'Top Clientes (Aprobado)';
    wsSummary.getCell(5, 5).value = 'Pedidos';
    wsSummary.getCell(5, 6).value = 'Facturación';
    [4, 5, 6].forEach((col) => {
      const cell = wsSummary.getCell(5, col);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1612' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });

    topClients.forEach(([cli, d], idx) => {
      const r = 6 + idx;
      wsSummary.getCell(r, 4).value = cli;
      wsSummary.getCell(r, 5).value = d.count;
      const revCell = wsSummary.getCell(r, 6);
      revCell.value = d.rev;
      revCell.numFmt = '$#,##0.00';
      revCell.font = { bold: true };
    });

    const logoPath = getAssetPath('logo.jpg');
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        const imgId = wb.addImage({ filename: logoPath, extension: 'jpeg' });
        wsSummary.addImage(imgId, {
          tl: { col: 0, row: 15 },
          ext: { width: 110, height: 110 },
        });
      } catch (_) {}
    }

    await wb.xlsx.writeFile(filePath);
    return { ok: true, filePath, message: `Reporte Excel guardado en:\n${filePath}` };
  }

  async toPdf(rawOrders = [], dateFrom = '', dateTo = '', customTitle = '') {
    const orders = normalizeOrders(rawOrders);
    if (!orders.length) {
      return { ok: false, message: 'No hay órdenes en el periodo seleccionado para exportar.' };
    }

    ensureDataDirs();
    const ts = formatTimestampForFilename();
    const prefix = customTitle ? 'estado_cuenta_' : 'reporte_';
    const filePath = path.join(this.reportsDir, `${prefix}${ts}.pdf`);
    const bgImgPath = getAssetPath('image.png');
    const hasBg = bgImgPath && fs.existsSync(bgImgPath);
    const { regPath, boldPath } = resolveSystemFonts();

    const paidOrders = orders.filter((o) => PAID_STATES.has(o.estado));
    const pendingOrders = orders.filter((o) => o.estado === 'Pendiente');
    const cancelledOrders = orders.filter((o) => o.estado === 'Cancelado');

    const totalRevenue = paidOrders.reduce((acc, o) => acc + o.monto, 0);
    const pendingAmount = pendingOrders.reduce((acc, o) => acc + o.monto, 0);
    const cancelledAmount = cancelledOrders.reduce((acc, o) => acc + o.monto, 0);
    const avgTicket = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;
    const generatedStr = formatDateTimeHuman();

    // Calcular top producto y top cliente para la banda ejecutiva
    const prodMap = new Map();
    const cliMap = new Map();
    for (const o of paidOrders) {
      prodMap.set(o.producto, (prodMap.get(o.producto) || 0) + o.monto);
      cliMap.set(o.cliente, (cliMap.get(o.cliente) || 0) + o.monto);
    }
    const bestProd = Array.from(prodMap.entries()).sort((a, b) => b[1] - a[1])[0];
    const bestCli = Array.from(cliMap.entries()).sort((a, b) => b[1] - a[1])[0];

    return new Promise((resolve, reject) => {
      // IMPORTANTE: margin: 0 evita que PDFKit dispare saltos de página automáticos
      // cuando dibujamos textos en el encabezado o pie de página.
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        bufferPages: true,
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const fontRegular = regPath ? 'BodyReg' : 'Helvetica';
      const fontBold = boldPath ? 'BodyBold' : 'Helvetica-Bold';
      if (regPath) doc.registerFont('BodyReg', regPath);
      if (boldPath) doc.registerFont('BodyBold', boldPath);

      const pageW = doc.page.width; // 595.28
      const pageH = doc.page.height; // 841.89
      const marginL = 36;
      const contentW = pageW - marginL * 2; // 523.28

      const drawLetterheadPage = (isFirstPage) => {
        if (hasBg) {
          try {
            doc.image(bgImgPath, 0, 0, { width: pageW, height: pageH });
          } catch (_) {}
        }

        // Bloque superior derecho (a la derecha del logo de Café Pa'l Monte que ocupa x: 25..170, y: 20..190)
        const rightX = 182;
        const rightW = pageW - rightX - marginL;

        doc
          .font(fontBold)
          .fontSize(13.5)
          .fillColor('#1B4D2E')
          .text(
            customTitle || 'REPORTE CONTABLE Y OPERATIVO DE PEDIDOS',
            rightX,
            38,
            { width: rightW, align: 'right', lineBreak: false }
          );

        doc
          .font(fontRegular)
          .fontSize(8.5)
          .fillColor('#4B5563')
          .text(
            `Café Pa'l Monte · NIT 6.559.455-1 · San Antonio, Jamundí (Valle)`,
            rightX,
            56,
            { width: rightW, align: 'right', lineBreak: false }
          );

        doc
          .font(fontRegular)
          .fontSize(8.5)
          .fillColor('#6B7280')
          .text(
            `Período: ${dateFrom || 'Histórico'} a ${dateTo || 'Hoy'}   |   Generado: ${generatedStr}`,
            rightX,
            70,
            { width: rightW, align: 'right', lineBreak: false }
          );

        if (isFirstPage) {
          // Tarjetas KPI en el área libre superior derecha (x: 182..559, y: 92..176)
          const kpiCards = [
            {
              label: 'INGRESO NETO APROBADO',
              value: formatCurrency(totalRevenue),
              sub: `Ticket prom.: ${formatCurrency(avgTicket)}`,
              bg: '#ECFDF5',
              border: '#A7F3D0',
              ink: '#14532D',
            },
            {
              label: 'ÓRDENES EN PERIODO',
              value: `${orders.length} ped.`,
              sub: `${paidOrders.length} aprobadas / en curso`,
              bg: '#F8FAFC',
              border: '#E2E8F0',
              ink: '#1E293B',
            },
            {
              label: 'CARTERA POR COBRAR',
              value: formatCurrency(pendingAmount),
              sub: `${pendingOrders.length} pendiente(s) · ${cancelledOrders.length} canc.`,
              bg: '#FFFBEB',
              border: '#FDE68A',
              ink: '#78350F',
            },
          ];

          const gap = 8;
          const cardW = (rightW - gap * 2) / 3;
          const cardY = 92;
          const cardH = 56;

          kpiCards.forEach((c, idx) => {
            const cx = rightX + idx * (cardW + gap);
            doc
              .roundedRect(cx, cardY, cardW, cardH, 5)
              .lineWidth(0.8)
              .fillAndStroke(c.bg, c.border);

            doc
              .font(fontBold)
              .fontSize(7)
              .fillColor('#64748B')
              .text(c.label, cx + 8, cardY + 7, {
                width: cardW - 16,
                lineBreak: false,
              });

            doc
              .font(fontBold)
              .fontSize(11.5)
              .fillColor(c.ink)
              .text(c.value, cx + 8, cardY + 19, {
                width: cardW - 16,
                lineBreak: false,
              });

            doc
              .font(fontRegular)
              .fontSize(7.2)
              .fillColor('#475569')
              .text(c.sub, cx + 8, cardY + 37, {
                width: cardW - 16,
                lineBreak: false,
              });
          });

          // Línea de hallazgo ejecutivo bajo las tarjetas KPI
          const bestCliTxt = bestCli ? `${bestCli[0].slice(0, 22)} (${formatCurrency(bestCli[1])})` : 'N/A';
          const bestProdTxt = bestProd ? `${bestProd[0].slice(0, 22)} (${formatCurrency(bestProd[1])})` : 'N/A';
          const summaryLine = `Cliente líder: ${bestCliTxt}   ·   Top prod.: ${bestProdTxt}`;
          doc
            .font(fontRegular)
            .fontSize(7.3)
            .fillColor('#374151')
            .text(summaryLine, rightX, 155, {
              width: rightW,
              align: 'right',
              lineBreak: false,
            });
        }
      };

      // Dibujar primera página con membrete
      drawLetterheadPage(true);

      // Configuración de columnas de la tabla (suma = 523.28)
      const colWidths = [68, 54, 112, 149, 66, 74.28];
      const headers = ['ID Ref.', 'Fecha', 'Cliente', 'Producto(s)', 'Monto', 'Estado'];

      const drawTableHeader = (y) => {
        doc.roundedRect(marginL, y, contentW, 20, 3).fill('#1C1612');
        doc.font(fontBold).fontSize(8.2).fillColor('#FFFFFF');
        let x = marginL;
        headers.forEach((h, i) => {
          const align =
            i === 4 ? 'right' : i === 2 || i === 3 ? 'left' : 'center';
          doc.text(h, x + 5, y + 5.5, {
            width: colWidths[i] - 10,
            align,
            lineBreak: false,
          });
          x += colWidths[i];
        });
        return y + 21;
      };

      let curY = drawTableHeader(196);
      const maxTableY = pageH - 118; // Respeta la ola verde inferior del membrete

      orders.forEach((o, idx) => {
        const cliLines = Math.ceil(o.cliente.length / 22) || 1;
        const prodLines = Math.ceil(o.producto.length / 32) || 1;
        const maxLines = Math.min(3, Math.max(1, cliLines, prodLines));
        const rowH = 10 + maxLines * 9.5;

        if (curY + rowH > maxTableY) {
          doc.addPage({ size: 'A4', margin: 0 });
          drawLetterheadPage(false);
          curY = drawTableHeader(196);
        }

        const baseBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        doc.rect(marginL, curY, contentW, rowH).fill(baseBg);

        // Píldora de color en la columna Estado
        const stateHex = `#${ESTADO_COLORS[o.estado] || 'F3F4F6'}`;
        const stateInk = ESTADO_TEXT_COLORS[o.estado] || '#1F2937';
        const stateX =
          marginL +
          colWidths[0] +
          colWidths[1] +
          colWidths[2] +
          colWidths[3] +
          colWidths[4];
        doc
          .roundedRect(stateX + 4, curY + 3, colWidths[5] - 8, rowH - 6, 3)
          .fill(stateHex);

        // Línea divisoria inferior
        doc
          .moveTo(marginL, curY + rowH)
          .lineTo(marginL + contentW, curY + rowH)
          .lineWidth(0.4)
          .strokeColor('#E2E8F0')
          .stroke();

        const cells = [
          { val: o.id, align: 'left', bold: false, color: '#475569', size: 7.3 },
          { val: o.fecha, align: 'center', bold: false, color: '#334155', size: 7.6 },
          { val: o.cliente, align: 'left', bold: true, color: '#0F172A', size: 7.8 },
          { val: o.producto, align: 'left', bold: false, color: '#334155', size: 7.6 },
          {
            val: formatCurrency(o.monto),
            align: 'right',
            bold: PAID_STATES.has(o.estado),
            color: o.estado === 'Cancelado' ? '#94A3B8' : '#0F172A',
            size: 8.0,
          },
          { val: o.estado, align: 'center', bold: true, color: stateInk, size: 7.4 },
        ];

        let x = marginL;
        cells.forEach((c, i) => {
          doc
            .font(c.bold ? fontBold : fontRegular)
            .fontSize(c.size)
            .fillColor(c.color)
            .text(c.val, x + 5, curY + 4.5, {
              width: colWidths[i] - 10,
              height: rowH - 6,
              align: c.align,
              ellipsis: true,
            });
          x += colWidths[i];
        });

        curY += rowH;
      });

      // Bloque de Cierre Contable al final de la tabla
      if (curY + 54 > maxTableY) {
        doc.addPage({ size: 'A4', margin: 0 });
        drawLetterheadPage(false);
        curY = 196;
      }

      curY += 6;
      const summaryBoxW = 255;
      const summaryBoxX = marginL + contentW - summaryBoxW;

      doc
        .roundedRect(summaryBoxX, curY, summaryBoxW, 44, 4)
        .lineWidth(0.8)
        .fillAndStroke('#F8FAFC', '#CBD5E1');

      doc
        .font(fontRegular)
        .fontSize(8)
        .fillColor('#475569')
        .text('Pendiente por cobrar (Cartera):', summaryBoxX + 10, curY + 7, {
          width: 150,
          lineBreak: false,
        });
      doc
        .font(fontBold)
        .fontSize(8.2)
        .fillColor('#92400E')
        .text(formatCurrency(pendingAmount), summaryBoxX + 150, curY + 7, {
          width: summaryBoxW - 160,
          align: 'right',
          lineBreak: false,
        });

      doc
        .font(fontBold)
        .fontSize(9)
        .fillColor('#14532D')
        .text('TOTAL APROBADO (CIERRE NETO):', summaryBoxX + 10, curY + 24, {
          width: 155,
          lineBreak: false,
        });
      doc
        .font(fontBold)
        .fontSize(10)
        .fillColor('#14532D')
        .text(formatCurrency(totalRevenue), summaryBoxX + 155, curY + 23, {
          width: summaryBoxW - 165,
          align: 'right',
          lineBreak: false,
        });

      // Numeración final "Página X de Y" sin disparar saltos de página
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        doc
          .font(fontBold)
          .fontSize(8)
          .fillColor('#374151')
          .text(
            `Página ${i + 1} de ${range.count}`,
            marginL,
            pageH - 22,
            { width: 180, align: 'left', lineBreak: false }
          );
      }

      doc.end();
      stream.on('finish', () => {
        resolve({ ok: true, filePath, message: `Reporte PDF guardado en:\n${filePath}` });
      });
      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  async toOrderReceiptPdf(rawOrder = {}, clientStats = {}) {
    const [order] = normalizeOrders([rawOrder]);
    if (!order || !order.id) {
      return { ok: false, message: 'No se especificó un pedido válido para generar la remisión.' };
    }

    ensureDataDirs();
    const safeId = order.id.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(this.reportsDir, `remision_${safeId}_${formatTimestampForFilename()}.pdf`);
    const bgImgPath = getAssetPath('image.png');
    const hasBg = bgImgPath && fs.existsSync(bgImgPath);
    const { regPath, boldPath } = resolveSystemFonts();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        bufferPages: true,
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const fontRegular = regPath ? 'BodyReg' : 'Helvetica';
      const fontBold = boldPath ? 'BodyBold' : 'Helvetica-Bold';
      if (regPath) doc.registerFont('BodyReg', regPath);
      if (boldPath) doc.registerFont('BodyBold', boldPath);

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const marginL = 42;
      const contentW = pageW - marginL * 2;

      if (hasBg) {
        try {
          doc.image(bgImgPath, 0, 0, { width: pageW, height: pageH });
        } catch (_) {}
      }

      const rightX = 185;
      const rightW = pageW - rightX - marginL;

      doc
        .font(fontBold)
        .fontSize(15)
        .fillColor('#1B4D2E')
        .text('REMISIÓN Y COMPROBANTE DE PEDIDO', rightX, 44, {
          width: rightW,
          align: 'right',
          lineBreak: false,
        });

      doc
        .font(fontBold)
        .fontSize(11)
        .fillColor('#1C1612')
        .text(`Referencia Oficial: #${order.id}`, rightX, 66, {
          width: rightW,
          align: 'right',
          lineBreak: false,
        });

      doc
        .font(fontRegular)
        .fontSize(8.5)
        .fillColor('#4B5563')
        .text(`Fecha del pedido: ${order.fecha}   |   Emitido: ${formatDateTimeHuman()}`, rightX, 84, {
          width: rightW,
          align: 'right',
          lineBreak: false,
        });

      // Caja de datos del cliente y estado
      const boxY = 205;
      doc
        .roundedRect(marginL, boxY, contentW, 82, 6)
        .lineWidth(0.8)
        .fillAndStroke('#F8FAFC', '#CBD5E1');

      doc
        .font(fontBold)
        .fontSize(8)
        .fillColor('#64748B')
        .text('CLIENTE / DESTINATARIO', marginL + 16, boxY + 12, { lineBreak: false });

      doc
        .font(fontBold)
        .fontSize(13)
        .fillColor('#0F172A')
        .text(order.cliente, marginL + 16, boxY + 26, { width: 280, lineBreak: false });

      const totalHist = Number(clientStats.count || 1);
      const paidHist = Number(clientStats.paidRevenue || (PAID_STATES.has(order.estado) ? order.monto : 0));
      doc
        .font(fontRegular)
        .fontSize(8.5)
        .fillColor('#475569')
        .text(
          `Historial en Café Pa'l Monte: ${totalHist} pedido(s) registrado(s) · ${formatCurrency(paidHist)} aprobados`,
          marginL + 16,
          boxY + 48,
          { width: 320, lineBreak: false }
        );

      // Estado y monto destacado a la derecha
      doc
        .font(fontBold)
        .fontSize(8)
        .fillColor('#64748B')
        .text('ESTADO DEL PEDIDO', marginL + contentW - 160, boxY + 12, {
          width: 144,
          align: 'right',
          lineBreak: false,
        });

      const stateBg = `#${ESTADO_COLORS[order.estado] || 'E2E8F0'}`;
      const stateInk = ESTADO_TEXT_COLORS[order.estado] || '#1E293B';
      doc
        .roundedRect(marginL + contentW - 140, boxY + 26, 124, 22, 4)
        .fill(stateBg);
      doc
        .font(fontBold)
        .fontSize(9.5)
        .fillColor(stateInk)
        .text(order.estado.toUpperCase(), marginL + contentW - 136, boxY + 32, {
          width: 116,
          align: 'center',
          lineBreak: false,
        });

      // Desglose de productos del pedido
      const rawItems = order.producto
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const items = rawItems.length ? rawItems : [order.producto];

      let curY = 306;
      doc.roundedRect(marginL, curY, contentW, 22, 4).fill('#1C1612');
      doc
        .font(fontBold)
        .fontSize(8.5)
        .fillColor('#FFFFFF')
        .text('ÍTEM', marginL + 12, curY + 6, { width: 40, lineBreak: false })
        .text('DESCRIPCIÓN DEL PRODUCTO (CAFÉ ESPECIAL PA\'L MONTE)', marginL + 60, curY + 6, {
          width: 340,
          lineBreak: false,
        })
        .text('SUBTOTAL', marginL + contentW - 100, curY + 6, {
          width: 88,
          align: 'right',
          lineBreak: false,
        });
      curY += 24;

      items.forEach((line, idx) => {
        const rowH = 26;
        doc
          .rect(marginL, curY, contentW, rowH)
          .fill(idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC');
        doc
          .moveTo(marginL, curY + rowH)
          .lineTo(marginL + contentW, curY + rowH)
          .lineWidth(0.4)
          .strokeColor('#E2E8F0')
          .stroke();

        doc
          .font(fontBold)
          .fontSize(8.5)
          .fillColor('#64748B')
          .text(String(idx + 1), marginL + 12, curY + 8, { width: 40, lineBreak: false });

        doc
          .font(fontRegular)
          .fontSize(9.5)
          .fillColor('#0F172A')
          .text(line, marginL + 60, curY + 8, { width: 340, lineBreak: false });

        if (idx === 0) {
          doc
            .font(fontBold)
            .fontSize(9.5)
            .fillColor('#0F172A')
            .text(formatCurrency(order.monto), marginL + contentW - 100, curY + 8, {
              width: 88,
              align: 'right',
              lineBreak: false,
            });
        }
        curY += rowH;
      });

      curY += 16;
      doc
        .roundedRect(marginL + contentW - 245, curY, 245, 42, 5)
        .lineWidth(1)
        .fillAndStroke('#ECFDF5', '#A7F3D0');
      doc
        .font(fontBold)
        .fontSize(9.5)
        .fillColor('#14532D')
        .text('VALOR TOTAL PEDIDO:', marginL + contentW - 232, curY + 14, {
          width: 130,
          lineBreak: false,
        });
      doc
        .font(fontBold)
        .fontSize(13)
        .fillColor('#14532D')
        .text(formatCurrency(order.monto), marginL + contentW - 102, curY + 12, {
          width: 90,
          align: 'right',
          lineBreak: false,
        });

      curY += 64;
      doc
        .font(fontRegular)
        .fontSize(8.5)
        .fillColor('#475569')
        .text(
          "Gracias por apoyar la caficultura de origen de San Antonio, Jamundí. Café Pa'l Monte · NIT 6.559.455-1.",
          marginL,
          curY,
          { width: contentW, align: 'center', lineBreak: false }
        );

      doc.end();
      stream.on('finish', () => {
        resolve({ ok: true, filePath, message: `Remisión PDF guardada en:\n${filePath}` });
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
