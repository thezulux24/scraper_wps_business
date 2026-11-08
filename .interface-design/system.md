# Sistema de Diseño de Interfaz · Café Pa'l Monte (Desktop v2)

## Dirección y Dominio
- **Dominio:** Operaciones cafeteras, consolidación contable de pedidos de WhatsApp Business y analítica comercial.
- **Persona de color:** **Pergamino Claro** (Light) y **Tueste Nocturno** (Dark), inspirada en el café pergamino secado al sol en San Antonio, Jamundí, el verde cafeto de montaña y el grano tostado oscuro.
- **Firma visual:** Banda contable superior con jerarquía clara (Total Facturado como héroe con borde izquierdo `#1B5E20` de `5px` y tiles de conteo interactivos por estado), navegación lateral en grano tostado (`264px`) con tarjeta de sincronización WhatsApp en vivo y tipografía serif (`Georgia`) para cifras y encabezados combinada con `Segoe UI` y `Consolas` (`tabular-nums`) para IDs y montos.

## Tokens de Superficie y Texto

### Tema Claro (`html[data-theme="light"]`)
- `--bg-canvas`: `#F4ECE0` (Pergamino cálido)
- `--bg-surface`: `#FFFDF9` (Crema papel)
- `--bg-surface-alt`: `#FAF4EB` (Pergamino suave)
- `--bg-inset`: `#EBE1D3` (Campos de entrada y controles)
- `--bg-sidebar`: `#22150E` (Grano tostado intenso)
- `--text-primary`: `#22150E` (Contraste `15.49:1` sobre `--bg-surface`)
- `--text-secondary`: `#543B2E` (Contraste `8.72:1` sobre `--bg-surface`)
- `--text-muted`: `#6E5243` (Contraste `5.97:1` sobre `--bg-surface`)
- `--border-subtle`: `#D8C8B4`
- `--border-strong`: `#7D6252` (Contraste `4.4:1` para controles interactivos)

### Tema Oscuro (`html[data-theme="dark"]`)
- `--bg-canvas`: `#140D09` (Noche cafetera)
- `--bg-surface`: `#1E140E` (Superficie de tarjeta espresso)
- `--bg-surface-alt`: `#271B13` (Superficie secundaria)
- `--bg-inset`: `#110B07` (Controles e inputs)
- `--bg-sidebar`: `#100A07` (Barra lateral nocturna)
- `--text-primary`: `#F7EFE6` (Contraste `15.56:1` sobre `--bg-surface`)
- `--text-secondary`: `#D7C3B0` (Contraste `9.96:1` sobre `--bg-surface`)
- `--text-muted`: `#B89E87` (Contraste `6.57:1` sobre `--bg-surface`)
- `--border-subtle`: `#3A291E`
- `--border-strong`: `#967761` (Contraste `4.26:1` para controles interactivos)

## Tokens de Acento y Estados Contables
- `--brand-cafeto`: `#1B5E20` (Light) / `#2E7D32` (Dark)
- `--brand-roast`: `#5D3624` (Light) / `#7A4932` (Dark)
- `--accent-cherry`: `#B91C1C` (Light) / `#DC2626` (Dark)
- **Badges de estado (WCAG AA >= 4.5:1 con texto + borde + fondo):**
  - Pagado (`Completado` / `Entregado`): `--state-paid-bg`, `--state-paid-text`, `--state-paid-border`
  - En tránsito (`Enviado`): `--state-shipped-bg`, `--state-shipped-text`, `--state-shipped-border`
  - En preparación (`Envío en preparación`): `--state-prep-bg`, `--state-prep-text`, `--state-prep-border`
  - Pendiente (`Pendiente`): `--state-pending-bg`, `--state-pending-text`, `--state-pending-border`
  - Cancelado (`Cancelado`): `--state-cancelled-bg`, `--state-cancelled-text`, `--state-cancelled-border`

## Escala de Espaciado y Layout
- Base `4px` (`4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`).
- Estructura fija de escritorio: `.app-shell` con columna izquierda de `264px` (`.sidebar`) y `.workspace-area` (`topbar` + `main-content` + `statusbar`).
- Bordes sutiles (`1px solid var(--border-subtle)`) y `box-shadow: var(--shadow-card)` con radios `7px` (controles), `10px` (sub-bloques) y `12px` (tarjetas principales).
