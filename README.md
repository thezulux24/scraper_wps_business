# Café Pa'l Monte · Sistema de Gestión de Pedidos y Analítica (v2.0)

Aplicación nativa de escritorio para Windows diseñada para **Café Pa'l Monte** (San Antonio, Jamundí · NIT 6.559.455-1). Consolida pedidos de **WhatsApp Business Web** y pedidos manuales en una base de datos local **SQLite WAL**, gestiona cartera por cobrar (CRM), ofrece analítica comercial en tiempo real y exporta reportes ejecutivos y remisiones individuales en **PDF (membrete oficial)** y **Excel**.

---

## Módulos Principales

1. **Panel de Pedidos y Meta Mensual:**
   - KPIs contables en tiempo real: *Ingresos netos aprobados*, *Órdenes en periodo*, *Pagadas / En curso*, *Pendientes de cobro* y *Canceladas*.
   - Gráfico de pulso de facturación, desglose por estados/productos/clientes y **Meta Mensual de Ventas** configurable.
   - Registro de pedidos manuales con **Catálogo Rápido de Café Pa'l Monte** y autocompletado de clientes.
2. **Directorio de Clientes y Cartera (CRM):**
   - Control de saldos pendientes por cobrar, clientes recurrentes VIP (2+ compras), valor promedio LTV y clientes por reactivar (+30 días).
   - Generador de mensajes de WhatsApp (recordatorio de cobro o invitación de recompra) y **Estado de Cuenta PDF** individual por cliente.
3. **Inspector de Pedido, Remisión PDF y Plantillas WhatsApp:**
   - Descarga en 1 clic de la **Remisión y Comprobante de Pedido PDF** en formato membrete oficial.
   - Tres plantillas rápidas de WhatsApp listas para copiar: *Confirmar pedido*, *Aviso de despacho* y *Recordatorio de cobro*.
4. **Analítica Comercial y Centro de Reportes (PDF y Excel):**
   - Comparativa interanual, embudo de estados, Top 10 productos y Top 10 clientes VIP.
   - Exportación rápida o personalizada (por rango de fechas, estado y cliente) a PDF con membrete oficial y Excel de 2 hojas (*Órdenes Detalladas* + *Resumen Ejecutivo*).
5. **Base de Datos Segura, Migración y Wizard Nativo:**
   - Los datos viven en `%LOCALAPPDATA%\CafePalMonte\orders.db`, aislados del instalador para que ninguna actualización borre los registros.
   - Asistente integrado para migrar automáticamente bases de datos `orders.db` de la versión anterior sin duplicar pedidos.

---

## Estructura del Repositorio

```text
├── app/assets/                 # Icono oficial (.ico), logo y plantilla de membrete PDF
├── scripts/
│   ├── after-pack.js           # Incrusta icono oficial de Café Pa'l Monte en el .exe
│   ├── build-installer.js      # Compila el instalador CafePalMonte_Setup_v2.0.0.exe
│   ├── installer.nsh           # Script NSIS de actualización limpia y desinstalación
│   └── seed-demo-data.js       # Poblador de órdenes de prueba hasta la fecha/hora actual
├── src/
│   ├── main/                   # Proceso principal Electron, SQLite WAL, Scraper y Exporter
│   └── renderer/               # Interfaz gráfica (Warm Coffee Parchment & Espresso Dark)
└── package.json
```

---

## Comandos de Desarrollo y Compilación

Requisitos: **Node.js 20+** y **Windows 10/11 (x64)**.

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm start

# Poblar datos de prueba realistas hasta la fecha y hora actual
npm run seed:demo

# Ejecutar pruebas automáticas de base de datos, migración y reportes
npm run test:db

# Compilar aplicación e instalador oficial en dist/CafePalMonte_Setup_v2.0.0.exe
npm run dist
```
