# DESIGN.md - Café Pa'l Monte (Desktop Workstation v2)

## 1. Identidad del Producto y Dominio
- **Producto:** Café Pa'l Monte - Sistema de Gestión de Pedidos y Analítica para WhatsApp Business.
- **Origen:** Corregimiento San Antonio, Jamundí (Valle del Cauca, Colombia) · NIT 6.559.455-1.
- **Audiencia:** Operadores y administradores de Café Pa'l Monte que consolidan ventas diarias de WhatsApp Business, auditan pagos y exportan cierres contables a PDF y Excel.
- **Design Read:** Desktop Order Management & Financial Analytics Workstation for Café Pa'l Monte, warm Colombian coffee-house & editorial ledger style.
- **Dial:** `ENERGY 2 / RHYTHM 2 / MOTION 1`

## 2. Paleta de Color (2-3 Colores Base + 1 Acento Deliberado)
Todos los pares de texto y fondo cumplen contraste WCAG AA (>= 4.5:1 para texto normal, >= 3.0:1 para texto grande y bordes de controles).

### Tema Claro: "Pergamino Claro" (Predeterminado de marca)
- `--bg-canvas`: `#F4ECE0` (Pergamino cálido de fondo general)
- `--bg-surface`: `#FFFDF9` (Papel vellum para contenedores y tabla)
- `--bg-inset`: `#EBE1D3` (Campos de entrada ligeramente más oscuros que su contenedor para indicar recepción de datos)
- `--bg-sidebar`: `#22150E` (Tueste espresso profundo para la barra lateral)
- `--text-primary`: `#22150E` (Contraste 15.2:1 sobre `#FFFDF9`)
- `--text-secondary`: `#543B2E` (Contraste 8.6:1 sobre `#FFFDF9`)
- `--text-muted`: `#6E5243` (Contraste 5.8:1 sobre `#FFFDF9`)
- `--border-subtle`: `#D8C8B4`
- `--border-strong`: `#8C705F` (Contraste >= 3.1:1 para bordes de inputs y botones)
- `--brand-primary`: `#1B5E20` (Verde hoja de cafeto oficial del membrete, contraste 7.9:1 con texto `#FFFFFF`)
- `--brand-roast`: `#5D3624` (Tueste cacao para acciones secundarias, contraste 9.4:1 con texto `#FFFFFF`)
- `--accent-cherry`: `#B91C1C` (Rojo cereza madura del logotipo "Café Pa'l Monte", usado como acento focal único, contraste 6.4:1 con `#FFFFFF`)

### Tema Oscuro: "Tueste Nocturno"
- `--bg-canvas`: `#140D09`
- `--bg-surface`: `#1E140E`
- `--bg-inset`: `#110B07`
- `--bg-sidebar`: `#100A07`
- `--text-primary`: `#F7EFE6` (Contraste 15.4:1 sobre `#1E140E`)
- `--text-secondary`: `#D7C3B0` (Contraste 9.6:1 sobre `#1E140E`)
- `--text-muted`: `#B59B84` (Contraste 5.7:1 sobre `#1E140E`)
- `--border-subtle`: `#38271D`
- `--border-strong`: `#8C6D58`
- `--brand-primary`: `#2E7D32` (Verde cafeto luminoso con texto `#FFFFFF`, contraste 5.1:1)
- `--brand-roast`: `#8D5B41`
- `--accent-cherry`: `#DC2626`

## 3. Tipografía y Escala (Razón Documentada - R-06, R-31)
- **Encabezados de sección y montos principales (`--font-display`):** `'Georgia', 'Times New Roman', serif`. Elegida para reflejar la tradición cafetera editorial del membrete original de Café Pa'l Monte.
- **Cuerpo, controles y tablas (`--font-sans`):** `'Segoe UI', system-ui, -apple-system, sans-serif` con `font-variant-numeric: tabular-nums` en todas las cifras para alinear columnas de montos, fechas y conteos sin saltos visuales.
- **Códigos de referencia de pedido (`--font-mono`):** `'Consolas', 'Courier New', monospace` exclusivamente para IDs alfanuméricos de WhatsApp (`4WN6PHHM503`).

## 4. Decisiones Estructurales Documentadas (R-31)
1. **Color:** Extraído directamente del logotipo y papel membrete oficial de Café Pa'l Monte (verde hoja de cafeto `#1B5E20`, rojo cereza `#B91C1C`, crema pergamino `#F4ECE0` y café tostado `#22150E`).
2. **Layout (RHYTHM 2):** En lugar de 5 cajas KPI idénticas, la vista principal destaca una **Banda Contable Principal** para el *Total Facturado* (el dato decisivo del negocio) acompañada de desglose operativo compacto, barra de filtros de fecha/búsqueda y tabla de pedidos de alta densidad.
3. **Iconografía (R-04):** Iconos vectoriales SVG de trazo limpio y propósito específico (conexión, sincronización, exportación PDF/Excel, base de datos); cero emojis decorativos en botones o títulos.
4. ** Estados de UI (R-27):** Todas las vistas de datos cuentan con estado de carga explícito, estado vacío accionable (indicando cómo sincronizar WhatsApp o migrar una base de datos existente) y estado de error con causa y solución.
5. **Movimiento (MOTION 1 - R-19):** Transiciones de color y opacidad de 140ms (`cubic-bezier(0.23, 1, 0.32, 1)`) y feedback táctil `scale(0.98)` al presionar botones; sin pulsos infinitos y respetando `prefers-reduced-motion: reduce`.
