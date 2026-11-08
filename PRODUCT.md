# PRODUCT.md - Café Pa'l Monte · Gestión de Pedidos y Analítica

## 1. Qué es este producto
Aplicación de escritorio nativa para Windows (Electron + SQLite WAL + Puppeteer Core) diseñada para **Café Pa'l Monte** (San Antonio, Jamundí, Valle del Cauca, Colombia · NIT 6.559.455-1). Permite extraer y sincronizar automáticamente los pedidos recibidos en **WhatsApp Business Web** (`model-storage` IndexedDB), consolidar la contabilidad de ventas aprobadas, hacer seguimiento a cobros pendientes y exportar reportes contables en Excel (`.xlsx`) y PDF (`.pdf`) con el membrete oficial de la marca.

## 2. Quién la usa y en qué contexto
- **Usuario:** Administrador u operador comercial de Café Pa'l Monte en su estación de trabajo Windows 11.
- **Frecuencia:** Uso diario durante la jornada operativa (revisión de pedidos entrantes de WhatsApp, confirmación de pagos, cambio de estados y cierre contable mensual/anual).
- **Tarea principal:** Sincronizar pedidos desde WhatsApp Business, verificar cuánto se ha facturado realmente en órdenes aprobadas frente a pendientes o canceladas, gestionar el estado de cada orden y generar reportes contables listos para auditoría.

## 3. Verdad de los datos y reglas de negocio
- **Ingresos Aprobados (Facturación Neta):** Suma únicamente pedidos en estado `Completado`, `Enviado`, `En preparación` y `Entregado`.
- **Pendientes de Cobro:** Pedidos en estado `Pendiente` (se muestran por separado para gestión de cobro y no inflan el ingreso aprobado).
- **Cancelados:** Pedidos en estado `Cancelado` (excluidos de la facturación neta y auditados por separado).
- **Persistencia segura:** Base de datos SQLite en modo `WAL` ubicada en `%LOCALAPPDATA%\CafePalMonte\orders.db`, aislada de la carpeta del ejecutable para que las actualizaciones nunca sobrescriban los registros históricos.
