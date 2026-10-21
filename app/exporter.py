# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# exporter.py
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""Genera reportes en Excel (.xlsx) y PDF a partir de una lista de órdenes."""

import os
import logging
from datetime import date, datetime
from collections import Counter
from xml.sax.saxutils import escape

_REPORTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reportes")
logger = logging.getLogger(__name__)

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.chart import BarChart, Reference
    from openpyxl.drawing.image import Image
    EXCEL_OK = True
except ImportError:
    EXCEL_OK = False

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                     Paragraph, Spacer, HRFlowable, Image as RLImage)
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    PDF_OK = True
except ImportError:
    PDF_OK = False

# Colores de marca
_GREEN  = "075E54"
_LGREY  = "F3F4F6"
_WHITE  = "FFFFFF"
_COMP   = "D1FAE5"
_PEND   = "FEF3C7"
_CANC   = "FEE2E2"
_ENV    = "EFF6FF"
_PREP   = "F5F3FF"

_PAID_STATES = {"Completado", "Enviado", "Envío en preparación", "Entregado"}


class Exporter:
    """
    Responsabilidad única: serializar órdenes a Excel o PDF.
    Devuelve (ok: bool, mensaje: str) para que la UI decida cómo notificar.
    """

    HEADERS = ["ID", "Cliente", "Producto", "Fecha", "Monto", "Estado"]
    REPORTS_DIR = _REPORTS_DIR
    ESTADO_COLORS = {
        "Completado": _COMP,
        "Pendiente":  _PEND,
        "Cancelado":  _CANC,
        "Enviado":    _ENV,
        "Envío en preparación": _PREP,
        "Entregado":  _COMP,
    }

    @staticmethod
    def _normalize_orders(orders: list[dict]) -> list[dict]:
        """Normaliza registros para evitar fallos de render por claves o tipos inválidos."""
        normalized = []
        for o in orders:
            try:
                monto = float(o.get("monto", 0.0))
            except (TypeError, ValueError):
                monto = 0.0
            normalized.append({
                "id": o.get("id", ""),
                "cliente": o.get("cliente", "Desconocido"),
                "producto": o.get("producto", "Sin descripción"),
                "fecha": o.get("fecha", date.today().isoformat()),
                "monto": monto,
                "estado": o.get("estado", "Desconocido"),
            })
        return normalized

    @staticmethod
    def _pdf_text(value: object) -> str:
        """Escapa texto para ReportLab y evita que caracteres especiales rompan el PDF."""
        return escape("" if value is None else str(value))

    # ── Excel ─────────────────────────────────────────────────────────────────
    def to_excel(self, orders: list[dict],
                 date_from: str = "", date_to: str = "") -> tuple[bool, str]:
        if not EXCEL_OK:
            return False, "Instala openpyxl:\npip install openpyxl"
        if not orders:
            return False, "No hay órdenes para exportar."

        orders = self._normalize_orders(orders)
        logger.info("[EXPORT][Excel] Inicio exportación: orders=%s rango=%s..%s", len(orders), date_from, date_to)

        os.makedirs(self.REPORTS_DIR, exist_ok=True)
        ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        fname = os.path.join(self.REPORTS_DIR, f"reporte_{ts}.xlsx")
        wb = openpyxl.Workbook()

        self._build_orders_sheet(wb, orders)
        self._build_summary_sheet(wb, orders, date_from, date_to)

        wb.save(fname)
        logger.info("[EXPORT][Excel] Archivo generado: %s", fname)
        self._open_file(fname)
        return True, f"Archivo guardado:\n{fname}"

    def _build_orders_sheet(self, wb, orders: list[dict]):
        ws = wb.active
        ws.title = "Órdenes"

        # Estilo encabezado
        hdr_fill   = PatternFill("solid", fgColor=_GREEN)
        hdr_font   = Font(bold=True, color=_WHITE, size=10)
        hdr_align  = Alignment(horizontal="center", vertical="center")
        thin_side  = Side(style="thin", color="D1D5DB")
        thin_border = Border(left=thin_side, right=thin_side,
                             top=thin_side, bottom=thin_side)

        col_widths = [14, 22, 24, 12, 12, 14]
        for col, (h, w) in enumerate(zip(self.HEADERS, col_widths), 1):
            c = ws.cell(row=1, column=col, value=h)
            c.font      = hdr_font
            c.fill      = hdr_fill
            c.alignment = hdr_align
            c.border    = thin_border
            ws.column_dimensions[get_column_letter(col)].width = w

        ws.row_dimensions[1].height = 22

        # Filas de datos
        for row, o in enumerate(orders, 2):
            fill_color = self.ESTADO_COLORS.get(o["estado"], _WHITE)
            row_fill   = PatternFill("solid", fgColor=fill_color)
            vals = [o["id"], o["cliente"], o["producto"],
                    o["fecha"], o["monto"], o["estado"]]
            for col, v in enumerate(vals, 1):
                c = ws.cell(row=row, column=col, value=v)
                c.fill      = row_fill
                c.alignment = Alignment(horizontal="center", vertical="center",
                                        wrap_text=(col in (2, 3)))
                c.border    = thin_border
                if col == 5:  # Monto como número con formato
                    c.number_format = '#,##0.00'
            ws.row_dimensions[row].height = 20

        # Fila de totales
        last = len(orders) + 2
        ws.cell(row=last, column=4, value="TOTAL").font = Font(bold=True, size=10)
        tc = ws.cell(row=last, column=5,
                     value=sum(o["monto"] for o in orders if o.get("estado") in _PAID_STATES))
        tc.font          = Font(bold=True, size=10, color=_GREEN)
        tc.number_format = '#,##0.00'
        tc.alignment     = Alignment(horizontal="center")

        # Congelar fila de encabezado
        ws.freeze_panes = "A2"

    def _build_summary_sheet(self, wb, orders: list[dict],
                              date_from: str, date_to: str):
        ws = wb.create_sheet("Resumen")
        ws.column_dimensions["A"].width = 22
        ws.column_dimensions["B"].width = 16

        hdr_fill = PatternFill("solid", fgColor=_GREEN)
        hdr_font = Font(bold=True, color=_WHITE, size=11)

        # Título
        ws["A1"] = "Café Pa'l Monte - Reporte"
        ws["A1"].font = Font(bold=True, size=14, color=_GREEN)
        ws["A2"] = f"Período: {date_from} → {date_to}"
        ws["A2"].font = Font(italic=True, size=10)
        ws["A3"] = f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}"
        ws["A3"].font = Font(italic=True, size=10)

        image_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "image.png")
        if os.path.exists(image_path):
            try:
                img = Image(image_path)
                img.width = 150
                img.height = 150
                ws.add_image(img, "D1")
            except Exception as e:
                logger.warning(f"No se pudo cargar el logo en Excel: {e}")

        # KPIs
        total  = sum(o["monto"] for o in orders if o.get("estado") in _PAID_STATES)
        count  = len(orders)
        by_est = Counter(o["estado"] for o in orders)
        pagadas = sum(by_est.get(st, 0) for st in _PAID_STATES)

        kpi_items = [
            ("Métrica", "Valor"),
            ("Total órdenes", count),
            ("Total facturado", total),
            ("Pagadas", pagadas),
            ("Pendientes",  by_est.get("Pendiente",  0)),
            ("Canceladas",  by_est.get("Cancelado",  0)),
            ("Promedio/orden", total / count if count else 0),
        ]

        for i, (label, val) in enumerate(kpi_items, 5):
            a = ws.cell(row=i, column=1, value=label)
            b = ws.cell(row=i, column=2, value=val)
            if i == 5:
                a.fill = hdr_fill; a.font = hdr_font
                b.fill = hdr_fill; b.font = hdr_font
            else:
                a.font = Font(size=10)
                b.font = Font(bold=True, size=10, color=_GREEN)
                if label in ("Total facturado", "Promedio/orden"):
                    b.number_format = '#,##0.00'
            a.alignment = Alignment(vertical="center")
            b.alignment = Alignment(horizontal="center", vertical="center")
            ws.row_dimensions[i].height = 18

        # Mini gráfica de barras por estado
        chart_data = [["Estado", "Cantidad"]]
        for est, cnt in sorted(by_est.items()):
            chart_data.append([est, cnt])

        start_row = 14
        for r, row_vals in enumerate(chart_data, start_row):
            for c, v in enumerate(row_vals, 1):
                ws.cell(row=r, column=c, value=v)

        chart = BarChart()
        chart.type        = "col"
        chart.grouping    = "clustered"
        chart.title       = "Órdenes por Estado"
        chart.y_axis.title = "Cantidad"
        chart.x_axis.title = "Estado"
        chart.width  = 12
        chart.height = 8

        data_ref  = Reference(ws, min_col=2, min_row=start_row,
                               max_row=start_row + len(by_est))
        cats_ref  = Reference(ws, min_col=1, min_row=start_row + 1,
                               max_row=start_row + len(by_est))
        chart.add_data(data_ref, titles_from_data=True)
        chart.set_categories(cats_ref)
        ws.add_chart(chart, "D5")

    # ── PDF ───────────────────────────────────────────────────────────────────
    def to_pdf(self, orders: list[dict], date_from: str, date_to: str) -> tuple[bool, str]:
        if not PDF_OK:
            return False, "Instala reportlab:\npip install reportlab"
        if not orders:
            return False, "No hay órdenes para exportar."

        orders = self._normalize_orders(orders)
        logger.info("[EXPORT][PDF] Inicio exportación: orders=%s rango=%s..%s", len(orders), date_from, date_to)

        os.makedirs(self.REPORTS_DIR, exist_ok=True)
        ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        fname = os.path.join(self.REPORTS_DIR, f"reporte_{ts}.pdf")
        doc    = SimpleDocTemplate(
            fname, pagesize=A4,
            leftMargin=1.5*cm, rightMargin=1.5*cm,
            topMargin=5.5*cm,  bottomMargin=3.8*cm)

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "WBSTitle", parent=styles["Title"],
            textColor=colors.HexColor(f"#{_GREEN}"),
            fontSize=16, spaceAfter=4)
        sub_style = ParagraphStyle(
            "WBSSub", parent=styles["Normal"],
            textColor=colors.HexColor("#6B7280"),
            fontSize=9, spaceAfter=2)
        footer_style = ParagraphStyle(
            "WBSFooter", parent=styles["Normal"],
            textColor=colors.HexColor("#9CA3AF"),
            fontSize=8, alignment=TA_RIGHT)
        cell_text_style = ParagraphStyle(
            "WBSCell", parent=styles["Normal"],
            fontSize=7.6, leading=9,
            splitLongWords=True,
            wordWrap="CJK",
            textColor=colors.HexColor("#1F2937"))
        cell_num_style = ParagraphStyle(
            "WBSCellNum", parent=styles["Normal"],
            fontSize=7.6, leading=9,
            splitLongWords=True,
            wordWrap="CJK",
            alignment=TA_RIGHT,
            textColor=colors.HexColor("#1F2937"))

        elems = []

        # Encabezado
        elems.append(Paragraph("Café Pa'l Monte", title_style))
        elems.append(HRFlowable(width="100%", thickness=1,
                                 color=colors.HexColor(f"#{_GREEN}"),
                                 spaceAfter=10))

        # KPIs en fila
        total   = sum(o["monto"] for o in orders if o.get("estado") in _PAID_STATES)
        by_est  = Counter(o["estado"] for o in orders)
        pagadas = sum(by_est.get(st, 0) for st in _PAID_STATES)
        kpi_data = [[
            f"Total: ${total:,.2f}",
            f"Órdenes: {len(orders)}",
            f"Pagadas: {pagadas}",
            f"Pendientes: {by_est.get('Pendiente', 0)}",
        ]]
        kpi_tbl = Table(kpi_data, colWidths=[4*cm, 3.5*cm, 4*cm, 3.5*cm])
        kpi_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(f"#{_GREEN}")),
            ("TEXTCOLOR",  (0, 0), (-1, -1), colors.white),
            ("FONTNAME",   (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE",   (0, 0), (-1, -1), 9),
            ("ALIGN",      (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("ROUNDEDCORNERS", [4]),
        ]))
        elems.append(kpi_tbl)
        elems.append(Spacer(1, 14))

        # Tabla de órdenes
        # Mantener ancho total por debajo del área imprimible (~18cm con márgenes).
        col_widths_pdf = [2.3*cm, 3.8*cm, 5.1*cm, 2.0*cm, 1.9*cm, 2.5*cm]
        data = [self.HEADERS]
        for o in orders:
            data.append([
                Paragraph(self._pdf_text(o["id"]), cell_text_style),
                Paragraph(self._pdf_text(o["cliente"]), cell_text_style),
                Paragraph(self._pdf_text(o["producto"]), cell_text_style),
                Paragraph(self._pdf_text(o["fecha"]), cell_text_style),
                Paragraph(f"${o['monto']:,.2f}", cell_num_style),
                Paragraph(self._pdf_text(o["estado"]), cell_text_style),
            ])
        data.append([
            "", "", "",
            Paragraph("TOTAL", cell_text_style),
            Paragraph(f"${total:,.2f}", cell_num_style),
            "",
        ])

        tbl = Table(data, colWidths=col_widths_pdf, repeatRows=1, splitByRow=1)
        tbl.hAlign = "LEFT"

        tbl_style = [
            # Encabezado
            ("BACKGROUND", (0, 0),  (-1, 0),  colors.HexColor(f"#{_GREEN}")),
            ("TEXTCOLOR",  (0, 0),  (-1, 0),  colors.white),
            ("FONTNAME",   (0, 0),  (-1, 0),  "Helvetica-Bold"),
            ("FONTSIZE",   (0, 0),  (-1, 0),  9),
            ("ALIGN",      (0, 0),  (-1, 0), "CENTER"),
            ("ALIGN",      (0, 1),  (2, -1), "LEFT"),
            ("ALIGN",      (3, 1),  (3, -1), "CENTER"),
            ("ALIGN",      (4, 1),  (4, -1), "RIGHT"),
            ("ALIGN",      (5, 1),  (5, -1), "CENTER"),
            ("VALIGN",     (0, 0),  (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0),  (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            # Filas alternas
            ("ROWBACKGROUNDS", (0, 1), (-1, -2),
             [colors.white, colors.HexColor(f"#{_LGREY}")]),
            # Fila total
            ("FONTNAME",   (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E5E7EB")),
            # Bordes
            ("GRID",       (0, 0),  (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
            ("LINEBELOW",  (0, 0),  (-1, 0),  1,   colors.white),
        ]

        # Resaltar celda de estado por fila sin romper el zebra striping base.
        for row_idx, o in enumerate(orders, start=1):
            hex_col = self.ESTADO_COLORS.get(o["estado"], _WHITE)
            tbl_style.append((
                "BACKGROUND",
                (5, row_idx),
                (5, row_idx),
                colors.HexColor(f"#{hex_col}")
            ))

        tbl.setStyle(TableStyle(tbl_style))
        elems.append(tbl)

        elems.append(Spacer(1, 16))
        elems.append(HRFlowable(width="100%", thickness=0.5,
                                 color=colors.HexColor("#E5E7EB")))
        elems.append(Spacer(1, 4))
        elems.append(Paragraph(
            f"Café Pa'l Monte  ·  {datetime.now().strftime('%d/%m/%Y %H:%M')}",
            footer_style))

        def _draw_page(canvas, _doc):
            canvas.saveState()

            # --- Background Image ---
            bg_img = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "image.png")
            if os.path.exists(bg_img):
                canvas.drawImage(bg_img, 0, 0, width=A4[0], height=A4[1], preserveAspectRatio=False, mask="auto")

            # Top-right period/generado
            try:
                canvas.setFont("Helvetica", 9)
                canvas.setFillColor(colors.HexColor("#6B7280"))
                period_txt = f"Período: {date_from} → {date_to}  |  Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}"
                canvas.drawRightString(A4[0] - doc.rightMargin, A4[1] - 1.2 * cm, period_txt)
            except Exception:
                pass

            canvas.setFont("Helvetica", 8)
            canvas.setFillColor(colors.HexColor("#9CA3AF"))
            canvas.drawString(doc.leftMargin, 0.8 * cm,
                              "Café Pa'l Monte · Reporte de pedidos")
            canvas.drawRightString(
                A4[0] - doc.rightMargin,
                0.8 * cm,
                f"Página {canvas.getPageNumber()}"
            )
            canvas.restoreState()

        doc.build(elems, onFirstPage=_draw_page, onLaterPages=_draw_page)
        logger.info("[EXPORT][PDF] Archivo generado: %s", fname)
        self._open_file(fname)
        return True, f"Archivo guardado:\n{fname}"

    # ── Helper ────────────────────────────────────────────────────────────────
    @staticmethod
    def _open_file(path: str):
        if os.name == "nt":
            os.startfile(path)
        else:
            os.system(f'xdg-open "{path}" 2>/dev/null || open "{path}" 2>/dev/null &')
