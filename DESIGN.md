# DESIGN.md - Café Pa'l Monte (Desktop Workstation v2)

## 1. Dirección Visual y Arquetipo (`framed-sheet` · `Operate Mode`)
- **Producto:** Café Pa'l Monte · Gestión de Pedidos y Analítica para WhatsApp Business.
- **Origen:** Corregimiento San Antonio, Jamundí (Valle del Cauca, Colombia) · NIT 6.559.455-1.
- **Modo Impeccable:** `Operate` (precisión operativa, escaneabilidad inmediata, jerarquía tipográfica y numérica clara, cero decoración superflua).
- **Estilo (`design-taste-frontend`):** `framed-sheet` (seed `1834437333`).
  - **El movimiento estructural:** La barra lateral (`232px`) y la barra superior (`48px`) comparten un mismo plano en L teñido con el tono piedra/pergamino del café (`--ground: #F2ECE4` en claro, `#0D0B09` en oscuro) sin línea divisoria entre ellas. El área de trabajo descansa sobre una hoja blanca (`--surface: #FFFFFF` en claro, `#16120E` en oscuro) con margen interior de `8px` a la derecha y abajo, esquinas de `16px`, borde de `1px` (`--border`) y sin sombra.
  - **Presupuesto de color:** Menos del 3% de píxeles con croma. El color se reserva exclusivamente para los datos principales en las gráficas (`--chart-1: #1B5E20` verde cafeto en claro / `#3FC07A` en oscuro), las píldoras semánticas de estado y el logotipo oficial de Café Pa'l Monte. El botón primario utiliza tono espresso casi negro (`--primary: #1C1612` en claro / `#F5EFE8` invertido en oscuro).

## 2. Sistema de Tokens

### Tema Claro: "Pergamino Piedra" (`data-theme="light"`)
- `--ground`: `#F2ECE4` (Marco en L: barra lateral y barra superior de 48px)
- `--surface`: `#FFFFFF` (Hoja de trabajo principal y tarjetas)
- `--raised`: `#F7F3EE` (Pozos de datos secundarios, cabeceras sutiles, hover de controles)
- `--active`: `#E6DFD5` (Píldora neutra del ítem activo en navegación y fila seleccionada)
- `--border`: `#E5DEC9` / `#E4DDD3` (Bordes de paneles y hoja de trabajo, ~1.2:1 sobre blanco)
- `--rule`: `#EFEAE2` (Reglas horizontales de 1px entre filas de tabla y grilla de gráficas)
- `--control`: `#CFC6BA` (Bordes de inputs, selects y botones secundarios)
- `--text`: `#18130F` (Tinta principal, contraste 17.8:1 sobre `#FFFFFF`)
- `--muted`: `#5C5248` (Texto secundario y etiquetas, contraste 7.4:1 sobre `#FFFFFF`)
- `--faint`: `#6B6056` (Metadatos, ejes y placeholders, contraste 5.8:1 sobre `#FFFFFF`, cumple >= 4.5:1)
- `--primary`: `#1C1612` (Botón primario espresso profundo con texto `#FFFFFF`)
- `--accent`: `#1B5E20` (Verde cafeto oficial para series de datos principales, foco de teclado y línea activa de pestaña)
- `--accent-cherry`: `#B91C1C` (Rojo cereza del logo, reservado para acciones destructivas confirmadas y alertas críticas)
- `--positive`: `#1F6E43` · `--pill-positive-bg`: `#DCFCE7` · `--pill-positive-ink`: `#063F22`
- `--warning`: `#8A4B08` · `--pill-warning-bg`: `#FEF3C7` · `--pill-warning-ink`: `#78350F`
- `--negative`: `#B91C1C` · `--pill-negative-bg`: `#FEE2E2` · `--pill-negative-ink`: `#7F1D1D`

### Tema Oscuro: "Tueste Nocturno" (`data-theme="dark"`)
- `--ground`: `#0C0A08` (Marco en L neutro oscuro)
- `--surface`: `#15120F` (Hoja de trabajo elevada por luminosidad)
- `--raised`: `#1E1A15` (Superficie secundaria y controles)
- `--active`: `#26211B` (Píldora activa en navegación)
- `--border`: `#26211B` (Bordes de paneles)
- `--rule`: `#1F1A15` (Reglas de filas)
- `--control`: `#3D352D` (Bordes de controles interactivos)
- `--text`: `#F5F0EA` (Texto principal)
- `--muted`: `#B5ABA0` (Texto secundario, contraste >= 7.1:1)
- `--faint`: `#94897E` (Metadatos y placeholders, contraste >= 4.6:1)
- `--primary`: `#F5F0EA` (Botón primario invertido con texto `#15120F`)
- `--accent`: `#3FC07A` (Verde cafeto luminoso para series de datos en modo oscuro)
- `--positive`: `#3FC07A` · `--pill-positive-bg`: `#132A1E` · `--pill-positive-ink`: `#4ADE80`
- `--warning`: `#F59E0B` · `--pill-warning-bg`: `#2B2111` · `--pill-warning-ink`: `#FBBF24`
- `--negative`: `#F87171` · `--pill-negative-bg`: `#2C1618` · `--pill-negative-ink`: `#FCA5A5`

## 3. Tipografía y Jerarquía Numérica
- **Una familia grotesca principal (`--font`):** `'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif` para toda la interfaz, encabezados, tablas y ejes de gráficas.
- **Monospace con propósito único (`--font-mono`):** `'Cascadia Mono', 'Consolas', monospace` exclusivamente para IDs de referencia de WhatsApp (`4WN6PHHM503`) y rutas técnicas de archivos.
- **Escala fija de producto (`Operate`):**
  - Título de vista (`h1`): `22px` (`font-weight: 600`, `letter-spacing: -0.015em`, `line-height: 1.25`)
  - Valor KPI líder (respuesta principal de la vista): `28px` (`font-weight: 600`, `tabular-nums`)
  - Valores KPI hermanos: `22px` (`font-weight: 500`, `tabular-nums`)
  - Título de panel (`h2`): `15px` (`font-weight: 600`)
  - Cuerpo, celdas de tabla y navegación: `13.5px` (`line-height: 20px`)
  - Etiquetas, cabeceras de tabla y ejes: `12px` (`color: var(--muted)`, sentence case)
- **Alineación numérica estricta:** Todas las cifras usan `font-variant-numeric: tabular-nums` y las columnas de montos/conteos se alinean a la derecha (`text-align: right`).

## 4. Ingeniería de Interacción y Movimiento (`emil-design-eng`)
- **Curvas personalizadas:**
  - `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` para entradas e interacciones rápidas.
  - `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` para el panel lateral de detalle de pedido (Inspector Drawer).
- **Duraciones < 250ms:**
  - Feedback táctil de botones: `transform: scale(0.97)` en `:active` (`120ms var(--ease-out)`).
  - Modales y popovers: inician desde `scale(0.96)` y `opacity: 0` (`180ms var(--ease-out)`), nunca desde `scale(0)`.
  - Transiciones explícitas por propiedad (`background-color`, `border-color`, `color`, `transform`, `opacity`); prohibido `transition: all`.
  - Hover protegido con `@media (hover: hover) and (pointer: fine)` y respeto total a `@media (prefers-reduced-motion: reduce)`.
