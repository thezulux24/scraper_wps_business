# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# config.py
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""Constantes globales: paleta de colores y datos de muestra."""

import os


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")

import sys
def resource_path(relative_path):
    """ Obtiene la ruta absoluta al recurso, funciona en dev y con PyInstaller """
    try:
        # PyInstaller crea una carpeta temporal y guarda la ruta en _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

# ── Scraper: historial de pedidos ────────────────────────────────────────────
# Máximo de rondas de scroll incremental para intentar cargar historial.
HISTORY_MAX_ROUNDS = 20
# Máximo de rondas consecutivas sin crecimiento antes de detenerse.
HISTORY_MAX_STAGNANT_ROUNDS = 3
# Máximo de pedidos visibles a cargar (tope de seguridad configurable).
HISTORY_MAX_VISIBLE_ORDERS = 500
# Pausa entre scroll y lectura en cada ronda.
HISTORY_SCROLL_PAUSE_SECONDS = 0.45
# Reintentos por ronda para manejar stale elements / cambios dinámicos del DOM.
HISTORY_SCROLL_RETRIES_PER_ROUND = 3

# ── Scraper: depuración visual ───────────────────────────────────────────────
# DEBUG_VISUAL=true -> navegador visible (sin headless) + trazas detalladas + pausas.
DEBUG_VISUAL = _env_bool("DEBUG_VISUAL", default=_env_bool("DEBUG", default=False))
# Pausa breve entre pasos para observar flujo en vivo.
DEBUG_STEP_PAUSE_SECONDS = float(os.getenv("DEBUG_STEP_PAUSE_SECONDS", "0.6"))

# ── Paleta ────────────────────────────────────────────────────────────────────
C_GREEN  = "#4CAF50"
C_DARK   = "#2C1E16"
C_LIGHT  = "#E8F5E9"
C_BG     = "#F4EADC"
C_WHITE  = "#FFFFFF"
C_GRAY   = "#8D6E63"
C_RED    = "#EF4444"
C_ORANGE = "#F59E0B"

# ── Datos de muestra ──────────────────────────────────────────────────────────
SAMPLE_ORDERS = [
    {"id": "ORD-001", "cliente": "María González",  "producto": "Torta chocolate",  "monto": 45.00, "fecha": "2025-02-03", "estado": "Completado"},
    {"id": "ORD-002", "cliente": "Carlos Ruiz",      "producto": "Cupcakes x12",     "monto": 30.00, "fecha": "2025-02-10", "estado": "Completado"},
    {"id": "ORD-003", "cliente": "Luisa Pérez",      "producto": "Torta vainilla",   "monto": 40.00, "fecha": "2025-02-14", "estado": "Pendiente"},
    {"id": "ORD-004", "cliente": "Andrés Torres",    "producto": "Brownies x20",     "monto": 25.00, "fecha": "2025-02-20", "estado": "Completado"},
    {"id": "ORD-005", "cliente": "Sofía Díaz",       "producto": "Cheesecake",       "monto": 50.00, "fecha": "2025-03-01", "estado": "Cancelado"},
    {"id": "ORD-006", "cliente": "Pedro Lara",       "producto": "Torta Red Velvet", "monto": 55.00, "fecha": "2025-03-05", "estado": "Completado"},
    {"id": "ORD-007", "cliente": "Diana Mora",       "producto": "Donuts x10",       "monto": 20.00, "fecha": "2025-03-06", "estado": "Pendiente"},
    {"id": "ORD-008", "cliente": "Javier Núñez",     "producto": "Alfajores x15",    "monto": 18.00, "fecha": "2025-03-07", "estado": "Completado"},
]