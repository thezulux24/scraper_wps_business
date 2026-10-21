# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# scraper.py
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""Navega WhatsApp Business Web y extrae las órdenes de la sección Orders."""

import re
import time
import logging
import hashlib
from datetime import date, datetime, timedelta
from typing import Callable

from config import (
    HISTORY_MAX_ROUNDS,
    HISTORY_MAX_STAGNANT_ROUNDS,
    HISTORY_MAX_VISIBLE_ORDERS,
    HISTORY_SCROLL_PAUSE_SECONDS,
    HISTORY_SCROLL_RETRIES_PER_ROUND,
    DEBUG_VISUAL,
    DEBUG_STEP_PAUSE_SECONDS,
)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    StaleElementReferenceException,
    ElementClickInterceptedException,
)

logger = logging.getLogger(__name__)

ESTADO_MAP = {
    'payment requested': 'Pendiente',
    'pago solicitado':   'Pendiente',
    'pending':           'Pendiente',
    'pendiente':         'Pendiente',
    'completed':         'Completado',
    'completado':        'Completado',
    'delivered':         'Completado',
    'entregado':         'Completado',
    'cancelled':         'Cancelado',
    'cancelado':         'Cancelado',
    'enviado':           'Enviado',
    'shipped':           'Enviado',
    'sent':              'Enviado',
    'envío en preparación':        'Envío en preparación',
    'envio en preparacion':        'Envío en preparación',
    'preparing shipment':          'Envío en preparación',
    'shipment in preparation':     'Envío en preparación',
}

# Nombres de meses en español e inglés para parseo de fechas
MESES_ES = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
    'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
    'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12,
    'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4,
    'may': 5, 'jun': 6, 'jul': 7, 'ago': 8,
    'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12,
}


class OrderScraper:
    """
    Responsabilidad única: extraer órdenes de WhatsApp Business Web.
    Recibe un driver activo y un callback de estado para actualizar la UI.
    """

    def __init__(self, driver, on_status: Callable[[str], None] = None):
        self.driver = driver
        self._status = on_status or (lambda msg: None)
        self._wait   = WebDriverWait(driver, 15)
        self.last_run_diagnostics: dict = {}
        self._debug_visual = DEBUG_VISUAL
        self._debug_step_pause = max(0.0, DEBUG_STEP_PAUSE_SECONDS)
        # TODO: Si tras múltiples scrolls no aparecen fechas antiguas, puede ser
        # una limitación real de WhatsApp Business Web para esa cuenta/sesión.
        self._history_note_emitted = False

    def _trace_step(self, step: str, detail: str):
        logger.info("[DEBUG][STEP] %s -> %s", step, detail)
        if self._debug_visual:
            self._status(f"🐞 {step}: {detail}")

    def _debug_pause(self, step: str):
        if not self._debug_visual:
            return
        logger.info("[DEBUG][PAUSE] step=%s seconds=%.2f", step, self._debug_step_pause)
        time.sleep(self._debug_step_pause)

    # ── Punto de entrada público ──────────────────────────────────────────────
    def fetch(self) -> list[dict]:
        self.last_run_diagnostics = {"status": "started"}
        self._trace_step("fetch", "inicio extracción")
        self._debug_pause("fetch:start")
        
        # Verificar y esperar si hay una sincronización profunda en curso (Ajustes)
        self._check_and_wait_for_full_sync()
        
        if self._is_orders_view_open():
            logger.info("[NAVIGATION] Vista Pedidos abierta")
            self._trace_step("navigation", "pedidos ya estaba abierto")
            self._debug_pause("orders_already_open")
            return self._read_order_list()

        if not self._open_business_tools():
            logger.error("[SESSION] No se pudo abrir Herramientas / Herramientas de empresa. Posible sesión inválida o UI no compatible.")
            self.last_run_diagnostics = {"status": "session_error", "step": "open_business_tools"}
            self._trace_step("navigation", "fallo abriendo herramientas")
            return []
        self._trace_step("navigation", "herramientas abierto")
        self._debug_pause("tools_opened")

        if not self._open_orders():
            logger.error("[NAVIGATION] No se pudo abrir la sección de pedidos. Posible restricción de cuenta o cambio de UI.")
            self.last_run_diagnostics = {"status": "navigation_error", "step": "open_orders"}
            self._trace_step("navigation", "fallo abriendo pedidos")
            return []
        self._trace_step("navigation", "pedidos abierto")
        self._debug_pause("orders_opened")
        return self._read_order_list()

    def _check_and_wait_for_full_sync(self):
        """
        Abre la configuración, verifica si hay una sincronización de mensajes en curso,
        y espera a que termine antes de continuar.
        """
        self._status("🔍 Verificando estado de sincronización profunda...")
        return # [CORRECCIÓN] Saltamos esta verificación para que nunca se quede atascado
        try:
            from selenium.webdriver.common.keys import Keys
            from selenium.webdriver.common.action_chains import ActionChains
            
            # Enviar Ctrl+Alt+, para abrir Ajustes
            ActionChains(self.driver).key_down(Keys.CONTROL).key_down(Keys.ALT).send_keys(',').key_up(Keys.ALT).key_up(Keys.CONTROL).perform()
            time.sleep(2.0)
            
            # Buscar el texto "sincronizando" o un progress bar
            sync_xpath = '//*[contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜ", "abcdefghijklmnopqrstuvwxyzáéíóúü"), "sincronizando") or contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "syncing")]'
            
            start_time = time.time()
            is_syncing = False
            
            # Revisar si aparece el texto en el panel
            try:
                els = self.driver.find_elements(By.XPATH, sync_xpath)
                for el in els:
                    if el.is_displayed():
                        is_syncing = True
                        break
            except Exception:
                pass
                
            if is_syncing:
                logger.info("[SYNC] Sincronización detectada en Ajustes. Esperando a que termine...")
                # Esperar como máximo 60 segundos para no bloquear la app
                while time.time() - start_time < 60:
                    still_syncing = False
                    try:
                        els = self.driver.find_elements(By.XPATH, sync_xpath)
                        for el in els:
                            if el.is_displayed():
                                still_syncing = True
                                text = el.text
                                import re
                                match = re.search(r'(\d+)\s*%', text)
                                if match:
                                    self._status(f"⏳ Sincronizando historial completo... {match.group(1)}%")
                                else:
                                    self._status("⏳ Sincronizando historial completo...")
                                break
                    except Exception:
                        pass
                        
                    if still_syncing:
                        time.sleep(5)
                    else:
                        logger.info("[SYNC] Sincronización en Ajustes finalizada.")
                        break
            else:
                logger.info("[SYNC] No se detectó sincronización profunda en curso.")
                
            # Cerrar Ajustes (ESC)
            ActionChains(self.driver).send_keys(Keys.ESCAPE).perform()
            time.sleep(1)
            
        except Exception as e:
            logger.warning(f"[SYNC] Error verificando sincronización en Ajustes: {e}")

    # ── Paso 1: abrir Business Tools ─────────────────────────────────────────
    def _open_business_tools(self) -> bool:
        if self._is_orders_view_open():
            logger.info("[NAVIGATION] Vista Pedidos abierta")
            return True

        self._status("Buscando Herramientas…")
        logger.info("[NAVIGATION][tools] Buscando Herramientas")

        candidates = [
            # 1) aria-label (Más preciso)
            (By.CSS_SELECTOR, '[aria-label="Herramientas"]', 'aria:Herramientas'),
            (By.CSS_SELECTOR, '[aria-label="Herramientas de empresa"]', 'aria:Herramientas de empresa'),
            (By.CSS_SELECTOR, '[aria-label*="Herramient"]', 'aria:*Herramient*'),
            # 2) title
            (By.CSS_SELECTOR, '[title="Herramientas"]', 'title:Herramientas'),
            (By.CSS_SELECTOR, '[title="Herramientas de empresa"]', 'title:Herramientas de empresa'),
            (By.CSS_SELECTOR, '[title*="Herramient"]', 'title:*Herramient*'),
            # 3) texto visible exacto (español)
            (By.XPATH, '//*[normalize-space(text())="Herramientas"]', 'exact:Herramientas'),
            (By.XPATH, '//*[normalize-space(text())="Herramientas de empresa"]', 'exact:Herramientas de empresa'),
            # 4) texto visible contains
            (By.XPATH, '//*[contains(translate(normalize-space(text()), "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜ", "abcdefghijklmnopqrstuvwxyzáéíóúü"), "herramient")]', 'contains:herramient'),
            # Fallback inglés
            (By.CSS_SELECTOR, '[aria-label="Business tools"]', 'aria:Business tools'),
            (By.CSS_SELECTOR, '[aria-label*="business"]', 'aria:*business*'),
            (By.CSS_SELECTOR, '[title="Business tools"]', 'title:Business tools'),
            (By.CSS_SELECTOR, '[title*="business"]', 'title:*business*'),
            (By.XPATH, '//*[normalize-space(text())="Business tools"]', 'exact:Business tools'),
            (By.XPATH, '//*[contains(translate(normalize-space(text()), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "business tool")]', 'contains:business tool'),
        ]

        clicked = self._try_click_candidates(candidates, step='tools', retries=2, wait_seconds=2)
        if clicked:
            logger.info("[NAVIGATION] Encontrado: Herramientas")
            time.sleep(1.5)
            return True

        logger.error("[NAVIGATION][tools] No se encontró ninguna variante válida de Herramientas/Herramientas de empresa tras reintentos.")
        self._status("⚠️  No se pudo abrir Herramientas / Herramientas de empresa. Verifica que tu cuenta tenga Business Tools habilitado.")
        return False

    # ── Paso 2: abrir Orders ──────────────────────────────────────────────────
    def _open_orders(self) -> bool:
        if self._is_orders_view_open():
            logger.info("[NAVIGATION] Vista Pedidos abierta")
            return True

        self._status("Abriendo sección de Pedidos…")
        logger.info("[NAVIGATION] Entrando a Pedidos")

        candidates = [
            # 1) aria-label (Más seguro)
            (By.CSS_SELECTOR, '[aria-label="Pedidos"]', 'aria:Pedidos'),
            (By.CSS_SELECTOR, '[aria-label*="Pedido"]', 'aria:*Pedido*'),
            # 2) title
            (By.CSS_SELECTOR, '[title="Pedidos"]', 'title:Pedidos'),
            (By.CSS_SELECTOR, '[title*="Pedido"]', 'title:*Pedido*'),
            # 3) texto visible exacto (español)
            (By.XPATH, '//*[normalize-space(text())="Pedidos"]', 'exact:Pedidos'),
            # 4) texto visible contains
            (By.XPATH, '//*[contains(translate(normalize-space(text()), "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜ", "abcdefghijklmnopqrstuvwxyzáéíóúü"), "pedido")]', 'contains:pedido'),
            # Fallback inglés
            (By.CSS_SELECTOR, '[aria-label="Orders"]', 'aria:Orders'),
            (By.CSS_SELECTOR, '[aria-label*="Order"]', 'aria:*Order*'),
            (By.CSS_SELECTOR, '[title="Orders"]', 'title:Orders'),
            (By.CSS_SELECTOR, '[title*="Order"]', 'title:*Order*'),
            (By.XPATH, '//*[normalize-space(text())="Orders"]', 'exact:Orders'),
            (By.XPATH, '//*[contains(translate(normalize-space(text()), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "order")]', 'contains:order'),
        ]

        clicked = self._try_click_candidates(candidates, step='orders', retries=2, wait_seconds=2)
        if clicked:
            time.sleep(1.0)
            self._wait_spinners(timeout_seconds=60)
            if self._is_orders_view_open():
                logger.info("[NAVIGATION] Vista Pedidos abierta")
                return True
            
            logger.warning("[NAVIGATION][orders] Se hizo click, pero la vista de pedidos no se confirmó al 100%. Continuamos.")
            return True

        logger.error("[NAVIGATION][orders] No se encontró la sección Pedidos/Orders tras todos los intentos.")
        self._status("⚠️  No se encontró la sección de Pedidos. Recuerda que necesitas tener WhatsApp Business para tener activados los pedidos.")
        return False

    def _is_orders_view_open(self) -> bool:
        """Detecta si la vista de Pedidos ya está abierta para evitar navegar de más."""
        container = self._find_orders_container()
        if container is None:
            return False
        try:
            buttons = len(self._find_order_buttons(container))
            raw_text = (container.text or '').lower()
            text_hint = ('pedido' in raw_text) or ('order' in raw_text)
            order_markers = len(container.find_elements(
                By.CSS_SELECTOR,
                '[data-testid*="order" i], [aria-label*="pedido" i], [aria-label*="order" i]'))
            is_open = buttons > 0 or (text_hint and order_markers > 0)
            logger.info("[NAVIGATION][detect-orders-open] container=1 buttons=%s text_hint=%s open=%s", buttons, text_hint, is_open)
            return is_open
        except Exception as exc:
            logger.warning("[NAVIGATION][detect-orders-open] Error al detectar vista abierta: %s", exc)
            return False

    def _try_click_candidates(self, candidates: list[tuple], step: str, retries: int = 3, wait_seconds: int = 5) -> bool:
        """Prueba múltiples selectores con reintentos, scroll y click JS fallback."""
        for attempt in range(1, retries + 1):
            logger.info("[NAVIGATION][%s] intento=%s/%s", step, attempt, retries)
            for by, selector, label in candidates:
                logger.info("[NAVIGATION][%s] probando selector=%s by=%s", step, label, by)
                elements = []
                try:
                    elements = self.driver.find_elements(by, selector)
                    if not elements:
                        WebDriverWait(self.driver, wait_seconds).until(
                            EC.presence_of_element_located((by, selector)))
                        elements = self.driver.find_elements(by, selector)
                except TimeoutException:
                    if self._debug_visual:
                        logger.info("[NAVIGATION][%s] selector FALLÓ (timeout): %s", step, label)
                    else:
                        logger.debug("[NAVIGATION][%s] selector sin resultados: %s", step, label)
                    continue
                except Exception as exc:
                    if self._debug_visual:
                        logger.info("[NAVIGATION][%s] selector FALLÓ (error): %s err=%s", step, label, exc)
                    else:
                        logger.debug("[NAVIGATION][%s] error buscando selector=%s err=%s", step, label, exc)
                    continue

                logger.info("[NAVIGATION][%s] selector encontrado=%s elementos=%s", step, label, len(elements))
                for idx, el in enumerate(elements):
                    try:
                        if not el.is_displayed():
                            logger.debug("[NAVIGATION][%s] omitiendo elemento oculto selector=%s idx=%s", step, label, idx)
                            continue
                    except Exception:
                        pass
                        
                    target = self._find_clickable_target(el)
                    if target is None:
                        logger.debug("[NAVIGATION][%s] elemento sin target clickeable selector=%s idx=%s", step, label, idx)
                        continue
                    if self._safe_click(target, f"{step}:{label}:idx={idx}"):
                        logger.info("[NAVIGATION][%s] click exitoso selector=%s idx=%s", step, label, idx)
                        self._debug_pause(f"click:{step}:{label}")
                        return True

            # Scroll global y pequeña espera antes de reintentar todo el set
            try:
                self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(0.35)
                self.driver.execute_script("window.scrollTo(0, 0);")
            except Exception as exc:
                logger.debug("[NAVIGATION][%s] scroll global de reintento falló: %s", step, exc)
            time.sleep(0.35)
        return False

    def _find_clickable_target(self, element):
        """Resuelve target clickeable: elemento o ancestro role/button."""
        try:
            tag = (element.tag_name or '').lower()
            role = (element.get_attribute('role') or '').lower()
            if tag == 'button' or role == 'button':
                return element
            anc = element.find_elements(
                By.XPATH,
                './ancestor::*[self::button or @role="button" or @tabindex][1]')
            return anc[0] if anc else element
        except Exception:
            return element

    def _safe_click(self, element, label: str) -> bool:
        """Intenta click normal y, si falla, click JavaScript con scroll previo."""
        try:
            self.driver.execute_script("arguments[0].scrollIntoView({block:'center', inline:'center'});", element)
            time.sleep(0.12)
        except Exception as exc:
            logger.debug("[NAVIGATION] scrollIntoView falló label=%s err=%s", label, exc)

        try:
            element.click()
            return True
        except ElementClickInterceptedException as exc:
            logger.debug("[NAVIGATION] click interceptado label=%s. Intentando ESC err=%s", label, exc)
            try:
                ActionChains(self.driver).send_keys(Keys.ESCAPE).perform()
                time.sleep(0.3)
            except Exception:
                pass
        except (StaleElementReferenceException, TimeoutException, Exception) as exc:
            logger.debug("[NAVIGATION] click normal falló label=%s err=%s", label, exc)

        try:
            self.driver.execute_script("arguments[0].click();", element)
            return True
        except Exception as exc:
            logger.debug("[NAVIGATION] click JS falló label=%s err=%s", label, exc)
            return False

    def _debug_nav_surface(self, step: str):
        """Loguea candidatos visibles de navegación para diagnóstico real de UI."""
        script = """
            const nodes = Array.from(document.querySelectorAll('nav *, aside *, header *'));
            const pick = nodes.filter(el => {
                const role = (el.getAttribute('role') || '').toLowerCase();
                const tag = (el.tagName || '').toLowerCase();
                const txt = (el.innerText || '').trim();
                return tag === 'button' || role === 'button' || el.hasAttribute('tabindex') || txt;
            }).slice(0, 120);
            return pick.map(el => ({
                tag: (el.tagName || '').toLowerCase(),
                role: el.getAttribute('role') || '',
                aria: el.getAttribute('aria-label') || '',
                title: el.getAttribute('title') || '',
                text: (el.innerText || '').trim().slice(0, 80)
            }));
        """
        try:
            items = self.driver.execute_script(script) or []
            logger.info("[NAVIGATION][%s] debug-nav-items=%s", step, len(items))
            for i, it in enumerate(items[:40]):
                logger.info(
                    "[NAVIGATION][%s] nav-item[%s] tag=%s role=%s aria=%s title=%s text=%s",
                    step, i, it.get('tag'), it.get('role'), it.get('aria'), it.get('title'), it.get('text'))
        except Exception as exc:
            logger.debug("[NAVIGATION][%s] debug nav surface falló: %s", step, exc)

    def _click_nav_keyword_fallback(self, keywords: list[str], step: str) -> bool:
        """Busca y clickea por keywords en aria/title/text dentro de nav/aside/header."""
        kw = [k.lower() for k in keywords]
        logger.info("[NAVIGATION][%s] keywords=%s", step, kw)

        # Primer intento con XPath dinámico y ancestro clickeable.
        predicates = " or ".join([
            f"contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜ', 'abcdefghijklmnopqrstuvwxyzáéíóúü'), '{k}')"
            for k in kw
        ] + [
            f"contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜ', 'abcdefghijklmnopqrstuvwxyzáéíóúü'), '{k}')"
            for k in kw
        ] + [
            f"contains(translate(@title, 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜ', 'abcdefghijklmnopqrstuvwxyzáéíóúü'), '{k}')"
            for k in kw
        ])
        xpath = f"//*[({predicates}) and (ancestor::nav or ancestor::aside or ancestor::header)]"
        logger.info("[NAVIGATION][%s] fallback-xpath=%s", step, xpath)

        try:
            els = self.driver.find_elements(By.XPATH, xpath)
            logger.info("[NAVIGATION][%s] fallback-xpath-found=%s", step, len(els))
            for idx, el in enumerate(els):
                tgt = self._find_clickable_target(el)
                if self._safe_click(tgt, f"{step}:xpath-fallback:{idx}"):
                    logger.info("[NAVIGATION][%s] fallback click xpath exitoso idx=%s", step, idx)
                    return True
        except Exception as exc:
            logger.debug("[NAVIGATION][%s] fallback XPath error: %s", step, exc)

        # Segundo intento con JS score sobre nodos de navegación.
        try:
            script = """
                const keywords = arguments[0];
                const pool = Array.from(document.querySelectorAll('nav *, aside *, header *'));
                const score = (el) => {
                    const txt = ((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
                    let s = 0;
                    for (const k of keywords) if (txt.includes(k)) s += 10;
                    if ((el.getAttribute('role') || '').toLowerCase() === 'button') s += 4;
                    if ((el.tagName || '').toLowerCase() === 'button') s += 4;
                    if (el.hasAttribute('tabindex')) s += 2;
                    return s;
                };
                let best = null;
                let bestScore = 0;
                for (const el of pool) {
                    const s = score(el);
                    if (s > bestScore) {
                        bestScore = s;
                        best = el;
                    }
                }
                if (!best || bestScore < 10) return {ok:false, score:bestScore};
                best.scrollIntoView({block:'center', inline:'center'});
                best.click();
                return {ok:true, score:bestScore, text:(best.innerText || '').trim().slice(0,80), aria:(best.getAttribute('aria-label') || ''), title:(best.getAttribute('title') || '')};
            """
            result = self.driver.execute_script(script, kw)
            logger.info("[NAVIGATION][%s] js-fallback-result=%s", step, result)
            return bool(result and result.get("ok"))
        except Exception as exc:
            logger.debug("[NAVIGATION][%s] fallback JS error: %s", step, exc)
            return False

    # ── Paso 3: leer la lista de órdenes ─────────────────────────────────────
    def _read_order_list(self) -> list[dict]:
        self._status("⏳ Esperando panel de pedidos…")
        panel_ready = self._wait_orders_panel()
        if not panel_ready:
            self._status("⚠️  Panel de pedidos no cargó (timeout).")
            logger.error("[TIMEOUT] Panel de pedidos no disponible tras espera explícita.")
            self.last_run_diagnostics = {"status": "timeout", "step": "wait_orders_panel"}
            return []

        # Esperar indeterminadamente a que desaparezcan los spinners de sincronización
        self._wait_spinners(timeout_seconds=3600)

        time.sleep(0.8)
        self._status("📦 Leyendo lista de pedidos…")

        orders   = []
        today    = date.today()

        container = self._find_orders_container()
        if container is None:
            self._status("⚠️  Contenedor de órdenes no encontrado.")
            logger.error("[SCRAPER] Contenedor de órdenes ausente en DOM.")
            self.last_run_diagnostics = {"status": "scraper_error", "step": "find_orders_container"}
            return []
        self._trace_step("scraper", "contenedor detectado")
        self._debug_pause("container_detected")

        history_info = self._load_order_history(container)
        if history_info["status"] == "session_error":
            self._status("⚠️  Sesión inestable durante carga de historial.")
            logger.error("[SESSION] Fallo durante scroll de historial: %s", history_info)

        # Re-localizar contenedor luego del scroll incremental
        container = self._find_orders_container()
        if container is None:
            self._status("⚠️  El contenedor desapareció tras cargar historial.")
            logger.error("[SCRAPER] Contenedor perdido después de cargar historial.")
            self.last_run_diagnostics = {"status": "scraper_error", "step": "container_lost_after_history", "history": history_info}
            return []

        rows_data = self._collect_rows_incremental(today, history_info)
        self._trace_step("scraper", f"filas detectadas={len(rows_data)}")
        self._debug_pause("rows_detected")
        logger.info(
            "[HISTORY] Lectura incremental completada: rounds=%s inicial=%s final=%s historicos=%s estado=%s stop_reason=%s",
            history_info.get("rounds"),
            history_info.get("buttons_initial"),
            history_info.get("buttons_final"),
            history_info.get("historical_orders_found"),
            history_info.get("status"),
            history_info.get("stop_reason"),
        )

        if not rows_data:
            logger.warning("[SCRAPER] No se detectaron filas de órdenes luego de cargar historial.")
            self._status("⚠️  No se encontraron pedidos visibles.")
            self.last_run_diagnostics = {"status": "no_rows", "history": history_info}
            return []

        # Segunda pasada: navegar a cada orden para obtener el ID real
        fallback_seen: dict[str, dict] = {}
        order_count = 0
        last_extracted_id = None
        for i, (rtype, data) in enumerate(rows_data):
            if rtype != 'order':
                continue

            order = data
            # Re-localizar el botón en el DOM actual
            btn = self._find_order_button(order_count, container)
            wa_id = None
            detail_text = ""
            
            if btn is not None:
                self._trace_step("order", f"abriendo pedido idx={order_count}")
                self._debug_pause("open_order")
                wa_id, detail_text = self._fetch_order_id(btn, order_count, last_extracted_id)
                last_extracted_id = wa_id if (wa_id and wa_id != '__ORDER_REQUEST__') else last_extracted_id
                # Después de volver, re-localizar el container
                try:
                    container = self.driver.find_element(
                        By.CSS_SELECTOR,
                        'div.x1280gxy.x94v8gs.xw2csxc.x1odjw0f.x1n2onr6')
                except NoSuchElementException:
                    pass
            
            # Si se obtuvo el ID de WhatsApp, usarlo como ID principal
            # Si no, se descarta el pedido a petición del usuario.
            if wa_id == '__ORDER_REQUEST__':
                # Es una solicitud de pedido (no confirmado), descartar silenciosamente
                logger.info(
                    "[Sync] Orden %s descartada: Solicitud de pedido (no confirmado) cliente='%s'",
                    order_count,
                    order.get('cliente'),
                )
                self._trace_step("order", f"solicitud de pedido idx={order_count} -> descartado")
            elif wa_id:
                order['whatsapp_order_id'] = wa_id
                order['id'] = wa_id
                logger.info(f"[Sync] Orden {order_count}: whatsapp_order_id='{wa_id}' cliente='{order.get('cliente')}' monto={order.get('monto')}")
                self._trace_step("order", f"id extraído idx={order_count} id={wa_id}")
                orders.append(order)
            else:
                logger.warning(
                    "[Sync] Orden %s ignorada: ID no obtenido (campos=%s)",
                    order_count,
                    order.get('cliente')
                )
                self._trace_step("order", f"id no extraído idx={order_count} -> ignorado")
            
            order_count += 1
            self._status(f"📦 {len(orders)} orden(es) válida(s) extraída(s)…")

        self._status(f"✅ {len(orders)} pedido(s) importados · {datetime.now().strftime('%H:%M')}")
        if not orders:
            logger.warning("[SCRAPER] Flujo completado sin órdenes válidas. Posible falta de historial o parseo fallido.")
            self.last_run_diagnostics = {"status": "no_valid_orders", "history": history_info}
        else:
            initial_visible = int(history_info.get("new_orders_visible_initial", 0) or 0)
            historical_found = int(history_info.get("historical_orders_found", 0) or 0)
            logger.info(
                "[SYNC] Resumen extracción: total=%s visibles_iniciales=%s historicos_cargados=%s rounds=%s",
                len(orders),
                initial_visible,
                historical_found,
                history_info.get("rounds", 0),
            )
            self.last_run_diagnostics = {
                "status": "ok",
                "orders_count": len(orders),
                "history": history_info,
            }
        return orders

    def _build_fallback_id(self, order: dict, idx: int, detail_text: str) -> tuple[str, dict]:
        """Construye fallback robusto por pedido evitando usar el índice o textos relativos que causan duplicados."""
        raw_text = str(order.get('_row_text', '')).strip()
        product = str(order.get('producto', '')).strip()
        payload = {
            'fields_used': [
                'cliente', 'producto', 'monto', 'fecha'
            ],
            'cliente': str(order.get('cliente', '')).strip(),
            'producto': product,
            'monto': str(order.get('monto', 0.0)),
            'fecha': str(order.get('fecha', '')),
            'row_text': raw_text,
            'row_fingerprint': str(order.get('_row_fingerprint', '')),
            'row_slot': str(order.get('_row_slot', '')),
            'idx': str(idx),
            'detail_text': (detail_text or '').strip(),
        }
        material = "||".join([
            payload['cliente'],
            payload['producto'],
            payload['monto'],
            payload['fecha'],
        ])
        hash_id = hashlib.md5(material.encode()).hexdigest()[:14].upper()
        fallback_id = f"WA-{hash_id}"
        payload['raw_preview'] = payload['row_text'][:120]
        payload['detail_preview'] = payload['detail_text'][:120]
        logger.info(
            "[Sync] fallback invariante generado idx=%s fallback_id=%s source_row_slot=%s",
            idx,
            fallback_id,
            payload['row_slot'],
        )
        return fallback_id, payload

    def _wait_orders_panel(self) -> bool:
        selectors = [
            '[aria-label="Lista de pedidos"]',
            '[aria-label="Order list"]',
            'div.x1280gxy.x94v8gs.xw2csxc.x1odjw0f.x1n2onr6',
            'div[data-testid="orders-list"]',
        ]
        combined_sel = ", ".join(selectors)
        try:
            self._wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, combined_sel)))
            return True
        except TimeoutException:
            return False

    def _wait_spinners(self, timeout_seconds: int = 3600):
        """
        Espera indeterminadamente hasta que desaparezcan las esferas de carga (spinners).
        Garantiza que WhatsApp Web haya sincronizado completamente los mensajes y pedidos.
        """
        logger.info("[SYNC] Verificando si hay esferas de carga en curso...")
        start = time.time()
        selectors = [
            '[role="progressbar"]',
            'svg[viewBox="0 0 50 50"]',
            'circle[stroke-dasharray]',
            'div[title="Cargando"]',
            'div[title="Loading"]',
            '[data-testid="msg-loading"]',
            '[data-testid="status-v3-spin"]',
            '[data-testid="circular-progress"]'
        ]
        
        sync_xpath = '//*[contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜ", "abcdefghijklmnopqrstuvwxyzáéíóúü"), "sincronizando") or contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "syncing")]'
        
        while time.time() - start < timeout_seconds:
            spinners_active = False
            for sel in selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, sel)
                    for el in elements:
                        if el.is_displayed():
                            spinners_active = True
                            break
                except Exception:
                    pass
                if spinners_active:
                    break
            
            if not spinners_active:
                try:
                    elements = self.driver.find_elements(By.XPATH, sync_xpath)
                    for el in elements:
                        if el.is_displayed():
                            spinners_active = True
                            break
                except Exception:
                    pass
            
            if spinners_active:
                self._status("⏳ Sincronizando (esfera/texto de carga detectado)...")
                time.sleep(3)
            else:
                break

    def _find_orders_container(self):
        selectors = [
            'div[data-testid="orders-list"]',
            'div.x1280gxy.x94v8gs.xw2csxc.x1odjw0f.x1n2onr6',
            'div[role="region"]',
            'div[aria-label*="order" i]',
            'div[aria-label*="pedido" i]',
            'section',
        ]

        candidates = []
        for sel in selectors:
            try:
                candidates.extend(self.driver.find_elements(By.CSS_SELECTOR, sel))
            except Exception:
                continue

        # Elegir el contenedor que más parece lista de pedidos, no solo el primer match.
        best = None
        best_score = -1
        seen_ids = set()
        for el in candidates:
            try:
                rid = el.id
            except Exception:
                rid = id(el)
            if rid in seen_ids:
                continue
            seen_ids.add(rid)

            try:
                order_like_buttons = len(self._find_order_buttons(el))
                txt = (el.text or '').lower()
                hint = int(('pedido' in txt) or ('order' in txt))
                metrics = self.driver.execute_script(
                    "return {client: arguments[0].clientHeight||0, scroll: arguments[0].scrollHeight||0};",
                    el,
                ) or {"client": 0, "scroll": 0}
                max_top = max(0, int(metrics.get("scroll", 0)) - int(metrics.get("client", 0)))
                scroll_bonus = 8 if max_top > 0 else 0
                density_bonus = 4 if order_like_buttons >= 3 else 0
                score = order_like_buttons * 10 + hint + scroll_bonus + density_bonus
                if score > best_score:
                    best_score = score
                    best = el
            except Exception:
                continue

        if best is not None:
            try:
                metrics = self.driver.execute_script(
                    "return {client: arguments[0].clientHeight||0, scroll: arguments[0].scrollHeight||0};",
                    best,
                ) or {"client": 0, "scroll": 0}
                max_top = max(0, int(metrics.get("scroll", 0)) - int(metrics.get("client", 0)))
            except Exception:
                max_top = -1
            logger.info("[SCRAPER] Contenedor de pedidos seleccionado con score=%s maxTop=%s", best_score, max_top)
            return best
        return None

    def _find_order_buttons(self, container):
        """Devuelve filas clickeables de pedido (button o role=button), incluyendo estructura anidada."""
        candidates = []
        xpaths = [
            './/button[.//span[@dir="auto" or @title]]',
            './/*[@role="button"][.//span[@dir="auto" or @title]]',
            './/div[@tabindex and .//span[@dir="auto" or @title]]',
            './/button[.//span[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "cop") or contains(normalize-space(.), "$")]]',
            './/*[@role="button"][.//span[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "cop") or contains(normalize-space(.), "$")]]',
            './/button[.//*[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "pedido") or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "order")]]',
            './/*[@role="button"][.//*[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "pedido") or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "order")]]',
            './/button',
            './/*[@role="button"]',
        ]

        seen = set()
        for xp in xpaths:
            try:
                found = container.find_elements(By.XPATH, xp)
            except Exception:
                found = []
            for btn in found:
                try:
                    bid = btn.id
                except Exception:
                    bid = id(btn)
                if bid in seen:
                    continue
                seen.add(bid)
                candidates.append(btn)
            if candidates:
                break
        return candidates

    def _resolve_scroll_target(self, container):
        """Resuelve un target scrolleable (contenedor o descendiente) para listas virtualizadas."""
        script = """
            const root = arguments[0];
            const nodes = [root, ...Array.from(root.querySelectorAll('div,section,main,article,ul'))];
            let best = root;
            let bestDelta = Math.max(0, (root.scrollHeight || 0) - (root.clientHeight || 0));
            for (const n of nodes) {
                const delta = Math.max(0, (n.scrollHeight || 0) - (n.clientHeight || 0));
                if (delta > bestDelta) {
                    best = n;
                    bestDelta = delta;
                }
            }
            return best;
        """
        try:
            return self.driver.execute_script(script, container) or container
        except Exception:
            return container

    def _extract_rows_from_container(self, container, today: date) -> list[tuple[str, dict | date]]:
        rows_data = []
        buttons = self._find_order_buttons(container)
        logger.info("[SCRAPER] Filas detectadas en contenedor: botones_candidatos=%s", len(buttons))
        if self._debug_visual:
            self._trace_step("scraper", f"botones candidatos={len(buttons)}")

        script = """
            const container = arguments[0];
            const buttons = arguments[1];
            const result = [];
            
            // Recolectar posibles encabezados de fecha
            const elements = Array.from(container.querySelectorAll('div, span'));
            const headerElements = [];
            for (const el of elements) {
                if (el.childElementCount === 0) {
                    const txt = (el.innerText || el.textContent || "").trim();
                    if (txt.length > 0 && txt.length < 30) {
                        const isDate = /^HOY$/i.test(txt) || 
                                     /^AYER$/i.test(txt) || 
                                     /^\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}$/.test(txt) || 
                                     /^\\d{1,2}\\s+(de\\s+)?[a-zA-Záéíóúüñ]+\\s*(de\\s*\\d{4})?$/i.test(txt) ||
                                     /^[a-zA-Záéíóúüñ]+\\s+\\d{1,2}$/i.test(txt);
                        if (isDate) {
                            headerElements.push({node: el, text: txt});
                        }
                    }
                }
            }
            
            for (const btn of buttons) {
                let bestDateText = "";
                for (const h of headerElements) {
                    // Verificar si el encabezado está antes del botón en el documento
                    if (btn.compareDocumentPosition(h.node) & Node.DOCUMENT_POSITION_PRECEDING) {
                        bestDateText = h.text;
                    } else {
                        break; // Como headerElements está en orden, podemos detenernos
                    }
                }
                result.push(bestDateText);
            }
            return result;
        """
        
        try:
            date_texts = self.driver.execute_script(script, container, buttons)
        except Exception as e:
            error_msg = str(e).split('\n')[0]
            logger.debug(f"[SCRAPER] Error extrayendo fechas via JS (ignorado por recarga de DOM): {error_msg}")
            date_texts = [""] * len(buttons)

        for order_idx, btn in enumerate(buttons):
            dt_text = date_texts[order_idx] if order_idx < len(date_texts) else ""
            cur_date = self._parse_date_header(dt_text, today) if dt_text else today
            
            order = self._parse_order_row(btn, cur_date, order_idx)
            if order:
                rows_data.append(('order', order))
        return rows_data

    @staticmethod
    def _order_signature(order: dict) -> str:
        """Firma estable para deduplicar pedidos visibles entre rondas de lectura."""
        fp = str(order.get('_row_fingerprint', '')).strip()
        slot = order.get('_row_slot')
        if fp:
            return f"fp:{fp}|slot:{slot}"
        return "|".join([
            str(order.get('cliente', '')).strip().lower(),
            str(order.get('producto', '')).strip().lower(),
            str(order.get('monto', 0.0)),
            str(order.get('fecha', '')),
            str(order.get('estado', '')).strip().lower(),
        ])

    @staticmethod
    def _parse_amount_token(raw: str) -> float | None:
        """Parsea montos con separadores ES/EN (ej: $10.000, 10,000.50, 10.000,50)."""
        if not raw:
            return None

        txt = raw.strip()
        m = re.search(r'([-+]?\d[\d\.,]*)', txt)
        if not m:
            return None
        token = m.group(1)

        # Caso miles con puntos (10.000 o 1.234.567)
        if re.fullmatch(r'\d{1,3}(?:\.\d{3})+', token):
            token = token.replace('.', '')
            return float(token)

        # Caso miles con comas (10,000 o 1,234,567)
        if re.fullmatch(r'\d{1,3}(?:,\d{3})+', token):
            token = token.replace(',', '')
            return float(token)

        if ',' in token and '.' in token:
            if token.rfind(',') > token.rfind('.'):
                # 1.234,56 -> 1234.56
                token = token.replace('.', '').replace(',', '.')
            else:
                # 1,234.56 -> 1234.56
                token = token.replace(',', '')
        elif ',' in token:
            parts = token.split(',')
            # Si termina con 1-2 dígitos, tratar como decimal; si no, como miles.
            if len(parts[-1]) in (1, 2):
                token = ''.join(parts[:-1]) + '.' + parts[-1]
            else:
                token = token.replace(',', '')

        try:
            return float(token)
        except ValueError:
            return None

    @staticmethod
    def _is_reliable_order_id(candidate: str, source_text: str) -> tuple[bool, str]:
        cand = (candidate or '').strip().upper().lstrip('#')
        if not cand:
            return False, "vacío"
        if len(cand) < 8:
            return False, "demasiado corto (mínimo 8 caracteres)"

        label_ctx = bool(re.search(
            r'(order\s*id|id\s*de\s*pedido|id\s*pedido|identificador|pedido\s*id|\bid\b)',
            source_text or '',
            re.I,
        ))

        if re.fullmatch(r'\d+', cand):
            if len(cand) <= 2:
                return False, "numérico ambiguo muy corto"
            if len(cand) <= 4 and not label_ctx:
                return False, "numérico ambiguo sin contexto"
            if len(cand) <= 1:
                return False, "numérico inválido"

        if not re.fullmatch(r'[A-Z0-9\-]+', cand):
            return False, "formato inválido"

        return True, "ok"

    def _scroll_orders_container(self, container, round_no: int):
        """Scroll incremental alternando dirección para UIs con virtualización."""
        target = self._resolve_scroll_target(container)
        script = """
            const el = arguments[0];
            const roundNo = arguments[1];
            const step = Math.max(120, Math.floor(el.clientHeight * 0.85));
            const before = el.scrollTop;
            const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
            let direction = 'down';

            if (roundNo % 2 === 0) {
                el.scrollTop = Math.max(0, before - step);
                direction = 'up';
            } else {
                el.scrollTop = Math.min(maxTop, before + step);
                direction = 'down';
            }

            el.dispatchEvent(new Event('scroll', { bubbles: true }));
            return { before, after: el.scrollTop, maxTop, direction };
        """
        try:
            move = self.driver.execute_script(script, target, round_no)
            logger.info("[HISTORY] scroll round=%s move=%s", round_no, move)
            if move and int(move.get('maxTop', 0) or 0) == 0:
                # Fallback cuando no hay contenedor interno scrolleable visible.
                self.driver.execute_script("window.scrollBy(0, 450);")
                time.sleep(0.12)
                self.driver.execute_script("window.scrollBy(0, -200);")
        except Exception as exc:
            logger.debug("[HISTORY] scroll incremental falló round=%s err=%s", round_no, exc)

    def _collect_rows_incremental(self, today: date, history_info: dict | None = None) -> list[tuple[str, dict | date]]:
        """
        Recorre por rondas y acumula pedidos únicos visibles.
        Esto evita perder pedidos cuando el número de botones no crece en el DOM.
        """
        unique_orders: dict[str, dict] = {}
        rounds_from_history = max(1, int((history_info or {}).get("rounds", 0) or 0))
        max_scan_rounds = min(
            max(rounds_from_history + 2, HISTORY_MAX_STAGNANT_ROUNDS + 2),
            HISTORY_MAX_ROUNDS,
        )
        stagnation = 0

        for round_no in range(1, max_scan_rounds + 1):
            container = self._find_orders_container()
            if container is None:
                logger.warning("[HISTORY][SCAN] Contenedor no disponible en round=%s", round_no)
                break

            rows_snapshot = self._extract_rows_from_container(container, today)
            added = 0
            for rtype, data in rows_snapshot:
                if rtype != 'order':
                    continue
                sig = self._order_signature(data)
                if sig not in unique_orders:
                    unique_orders[sig] = data
                    added += 1

            logger.info("[HISTORY][SCAN] round=%s agregados=%s acumulado=%s", round_no, added, len(unique_orders))

            if len(unique_orders) >= HISTORY_MAX_VISIBLE_ORDERS:
                logger.info(
                    "[HISTORY][SCAN] Límite configurable alcanzado: acumulado=%s limite=%s",
                    len(unique_orders),
                    HISTORY_MAX_VISIBLE_ORDERS,
                )
                break

            if added == 0:
                stagnation += 1
            else:
                stagnation = 0

            if stagnation >= HISTORY_MAX_STAGNANT_ROUNDS:
                logger.info(
                    "[HISTORY][SCAN] Sin crecimiento por %s ronda(s), fin de lectura incremental.",
                    stagnation,
                )
                break

            self._scroll_orders_container(container, round_no)
            time.sleep(HISTORY_SCROLL_PAUSE_SECONDS)

        return [('order', order) for order in unique_orders.values()]

    def _load_order_history(
        self,
        container,
        max_rounds: int = HISTORY_MAX_ROUNDS,
        max_stagnant_rounds: int = HISTORY_MAX_STAGNANT_ROUNDS,
        max_visible_orders: int = HISTORY_MAX_VISIBLE_ORDERS,
        pause_seconds: float = HISTORY_SCROLL_PAUSE_SECONDS,
        retries_per_round: int = HISTORY_SCROLL_RETRIES_PER_ROUND,
    ) -> dict:
        """
        Carga incremental del historial con scroll y reintentos.
        Retorna diagnóstico para diferenciar falta de historial vs falla técnica.
        """
        result = {
            "status": "ok",
            "rounds": 0,
            "buttons_initial": 0,
            "buttons_final": 0,
            "historical_orders_found": 0,
            "new_orders_visible_initial": 0,
            "growth_rounds": 0,
            "stagnation_rounds": 0,
            "stop_reason": "completed",
            "platform_limit_suspected": False,
            "limits": {
                "max_rounds": max_rounds,
                "max_stagnant_rounds": max_stagnant_rounds,
                "max_visible_orders": max_visible_orders,
            },
        }

        def _button_count() -> int:
            try:
                return len(self._find_order_buttons(container))
            except StaleElementReferenceException:
                fresh = self._find_orders_container()
                if fresh is None:
                    return 0
                return len(self._find_order_buttons(fresh))

        def _visible_signatures() -> set[str]:
            sigs: set[str] = set()
            try:
                rows = self._extract_rows_from_container(container, date.today())
                for rtype, data in rows:
                    if rtype == 'order':
                        sigs.add(self._order_signature(data))
            except Exception:
                return sigs
            return sigs

        initial = _button_count()
        initial_sigs = _visible_signatures()
        result["buttons_initial"] = initial
        result["new_orders_visible_initial"] = len(initial_sigs) if initial_sigs else initial
        self._status("📚 Cargando historial de pedidos…")
        logger.info(
            "[HISTORY] Inicio carga histórica: botones_iniciales=%s visibles_unicos_iniciales=%s max_rounds=%s max_stagnant=%s max_visible=%s",
            initial,
            len(initial_sigs),
            max_rounds,
            max_stagnant_rounds,
            max_visible_orders,
        )

        if initial == 0:
            logger.warning("[HISTORY] Lista de pedidos visible pero sin botones. Posible cuenta sin pedidos o sesión incompleta.")

        stagnation = 0
        prev_count = initial
        seen_sigs = set(initial_sigs)
        prev_unique_visible = len(initial_sigs)

        for round_no in range(1, max_rounds + 1):
            result["rounds"] = round_no
            for attempt in range(1, retries_per_round + 1):
                try:
                    self._scroll_orders_container(container, round_no)
                    break
                except StaleElementReferenceException:
                    fresh = self._find_orders_container()
                    if fresh is None:
                        result["status"] = "session_error"
                        result["stop_reason"] = "container_not_relocatable"
                        logger.error("[SESSION] Contenedor no re-localizable durante scroll (round=%s, attempt=%s)", round_no, attempt)
                        return result
                    container = fresh
                    time.sleep(0.2)
                except Exception as exc:
                    logger.warning("[SCRAPER] Scroll falló (round=%s, attempt=%s): %s", round_no, attempt, exc)
                    time.sleep(0.2)

            # Esperar a que la esfera de carga desaparezca tras el scroll
            self._wait_spinners(timeout_seconds=3600)
            time.sleep(pause_seconds)
            current = _button_count()
            current_sigs = _visible_signatures()
            current_unique_visible = len(current_sigs)
            seen_sigs.update(current_sigs)

            logger.info(
                "[HISTORY] round=%s botones=%s prev_botones=%s visibles_unicos=%s prev_unicos=%s vistos_acumulados=%s",
                round_no,
                current,
                prev_count,
                current_unique_visible,
                prev_unique_visible,
                len(seen_sigs),
            )

            grew = (current > prev_count) or (current_unique_visible > prev_unique_visible) or (len(seen_sigs) > prev_unique_visible)
            if grew:
                stagnation = 0
                result["growth_rounds"] += 1
                prev_count = current
                prev_unique_visible = max(prev_unique_visible, current_unique_visible, len(seen_sigs))
                self._status(f"📚 Historial cargando… {current} pedido(s) detectado(s)")
            else:
                stagnation += 1
                result["stagnation_rounds"] = stagnation

            if max(current, len(seen_sigs)) >= max_visible_orders:
                result["status"] = "history_limit_reached"
                result["stop_reason"] = "max_visible_orders"
                logger.info(
                    "[HISTORY] Detenido por límite configurable: visibles=%s vistos_unicos=%s limite=%s",
                    current,
                    len(seen_sigs),
                    max_visible_orders,
                )
                break

            if stagnation >= max_stagnant_rounds:
                result["stop_reason"] = "stagnation"
                break

            if round_no >= max_rounds:
                result["status"] = "history_limit_reached"
                result["stop_reason"] = "max_rounds"

        result["buttons_final"] = prev_count
        result["historical_orders_found"] = max(0, len(seen_sigs) - result["new_orders_visible_initial"])

        if prev_count == 0:
            result["status"] = "no_orders_or_access"
            result["stop_reason"] = "no_visible_orders"
            logger.warning("[HISTORY] No hay órdenes visibles tras reintentos. Puede ser ausencia real o restricción de acceso.")
        elif result["historical_orders_found"] == 0 and result["status"] == "ok":
            result["status"] = "no_more_history"
            logger.info("[HISTORY] No se detectó crecimiento del historial tras scroll/reintentos.")
            if not self._history_note_emitted:
                logger.info("[HISTORY] Posible limitación externa: WhatsApp Business podría no exponer historial anterior en esta sesión.")
                self._history_note_emitted = True
            result["platform_limit_suspected"] = True

        logger.info(
            "[HISTORY] Resumen: visibles_iniciales=%s historicos_encontrados=%s visibles_finales=%s growth_rounds=%s stagnation_rounds=%s status=%s stop_reason=%s platform_limit_suspected=%s",
            result["new_orders_visible_initial"],
            result["historical_orders_found"],
            result["buttons_final"],
            result["growth_rounds"],
            result["stagnation_rounds"],
            result["status"],
            result["stop_reason"],
            result["platform_limit_suspected"],
        )

        return result

    def _find_order_button(self, idx: int, container):
        """Re-localiza el idx-ésimo botón dentro del container."""
        try:
            btns = self._find_order_buttons(container)
            if idx < len(btns):
                return btns[idx]
        except StaleElementReferenceException:
            pass
        return None

    def _fetch_order_id(self, btn, idx: int, last_extracted_id: str | None = None) -> tuple[str | None, str]:
        """
        Hace clic en el botón de la orden, lee el ID único del panel de detalle
        y vuelve a la lista. Devuelve el ID de WhatsApp o None si no se puede obtener.
        
        Estrategia:
        1. Buscar el ID en múltiples selectores/atributos del DOM de detalle
        2. Extraer el ID con formato # (ej: #12345ABC)
        3. Si no se encuentra, devolver None para indicar que se debe usar fallback
        """
        
        try:
            self._safe_click(btn, f"open-order-{idx}")
            time.sleep(0.8)
            
            panel_wait = WebDriverWait(self.driver, 10)
            
            order_id = None
            detail_text = ""
            
            # Polling: buscar hasta 6 veces (aprox 3 segundos) el panel con el ID
            for attempt in range(6):
                # strict=True asegura que solo se lea el panel derecho, nunca el body global (evitando falsos positivos)
                detail_text = self._capture_order_detail_text(silent=(attempt > 0), strict=True)
                
                # ── Filtro temprano: descartar "Solicitud de pedido" ──
                # Las solicitudes de pedido tienen un formato distinto a los pedidos
                # confirmados ("Pedido N.°"). No contienen un ID de WhatsApp válido
                # y deben descartarse sin perder tiempo en estrategias de extracción.
                if detail_text and self._is_order_request(detail_text):
                    logger.info(
                        "[Orden %s] Descartada: es una 'Solicitud de pedido' (no un pedido confirmado). preview='%s'",
                        idx, detail_text[:160],
                    )
                    self._go_back()
                    return '__ORDER_REQUEST__', detail_text
                
                # Expresión regular ampliada para detectar identificador
                match = re.search(r'(?i)(pedido\s*n|order\s*id|solicitud\s*n|id|pedido)\.?[°º]?\s*[:#-]?\s*([A-Za-z0-9\-]{8,15})', detail_text)
                cand = None
                
                if match:
                    cand = match.group(2).strip().upper()
                else:
                    # Intento directo: formato típico de WhatsApp ej. 4V67ZPQG4PB (11 caracteres, mayúsculas y números)
                    raw_match = re.search(r'\b([A-Z0-9]{11,15})\b', detail_text)
                    if raw_match:
                        raw_cand = raw_match.group(1)
                        if re.search(r'[A-Z]', raw_cand) and re.search(r'[0-9]', raw_cand):
                            cand = raw_cand

                if cand:
                    # Rompemos el loop si encontramos un ID y es diferente al de la orden anterior,
                    # garantizando que el DOM de WhatsApp ya se actualizó.
                    if cand != last_extracted_id:
                        break
                
                time.sleep(0.5)
                # Si llegamos a la mitad de los intentos y no hay nada nuevo, reintentar el clic
                if attempt == 2:
                    try:
                        self._safe_click(btn, f"retry-open-order-{idx}")
                    except Exception:
                        pass
            
            # Ya no hacemos fallback a toda la página para evitar falsos positivos del chat

            # Intentar múltiples estrategias centradas en contexto de detalle e ID real.
            search_strategies = [
                ('XPATH', '//*[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "order id") or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜ", "abcdefghijklmnopqrstuvwxyzáéíóúü"), "id de pedido") or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜ", "abcdefghijklmnopqrstuvwxyzáéíóúü"), "identificador")]', 'label-context'),
                ('CSS', '[data-testid*="order" i], [data-testid*="id" i], [aria-label*="order" i], [aria-label*="pedido" i]', 'data-attrs'),
                ('XPATH', '//*[contains(text(), "#") and normalize-space() != ""]', 'hash-text'),
            ]

            for strategy_type, selector, strategy_name in search_strategies:
                elements = []
                try:
                    if strategy_type == 'CSS':
                        elements = panel_wait.until(
                            EC.presence_of_all_elements_located((By.CSS_SELECTOR, selector)))
                    else:
                        elements = WebDriverWait(self.driver, 5).until(
                            EC.presence_of_all_elements_located((By.XPATH, selector)))
                except Exception as exc:
                    logger.debug("[Orden %s] Estrategia %s falló: %s", idx, strategy_name, exc)
                    continue

                for el in elements:
                    text = ' '.join((el.text or '').split())
                    if not text:
                        continue

                    candidates = []
                    # 1) IDs con etiqueta contextual
                    for m in re.finditer(
                        r'(?i)(?:order\s*id|id\s*de\s*pedido|id\s*pedido|pedido\s*id|identificador|\bid\b)\s*[:#-]?\s*([A-Za-z0-9\-]{1,})',
                        text,
                    ):
                        candidates.append(m.group(1))
                    # 2) Formato con #
                    for m in re.finditer(r'#([A-Za-z0-9\-]{1,})', text):
                        candidates.append(m.group(1))

                    # 3) Valor compacto alfanumérico largo en bloque de ID
                    if re.search(r'(?i)(order\s*id|id\s*de\s*pedido|identificador)', text):
                        for m in re.finditer(r'\b([A-Za-z0-9\-]{5,})\b', text):
                            candidates.append(m.group(1))

                    for cand in candidates:
                        ok, reason = self._is_reliable_order_id(cand, text)
                        if not ok:
                            logger.info(
                                "[Orden %s] ID descartado='%s' estrategia=%s motivo=%s fuente='%s'",
                                idx,
                                cand,
                                strategy_name,
                                reason,
                                text[:120],
                            )
                            continue

                        order_id = cand.strip().upper().lstrip('#')
                        logger.info(
                            "[Orden %s] ID extraído='%s' estrategia=%s fuente='%s'",
                            idx,
                            order_id,
                            strategy_name,
                            text[:160],
                        )
                        break

                    if order_id:
                        break
                if order_id:
                    break

            # Estrategia adicional: Buscar directamente en detail_text usando regex
            if not order_id and detail_text:
                for m in re.finditer(r'(?i)(?:pedido|solicitud)(\s*n\.?[°º]?|\s*de\s*pedido)?\s*[:#-]?\s*([A-Za-z0-9\-]{8,15})', detail_text):
                    cand = m.group(2)
                    ok, reason = self._is_reliable_order_id(cand, "detail_text")
                    if ok:
                        order_id = cand.strip().upper()
                        logger.info("[Orden %s] ID extraído='%s' estrategia=detail_text_regex fuente='PEDIDO N.°'", idx, order_id)
                        break
                        
                if not order_id:
                    for m in re.finditer(r'(?i)(order\s*id|id)\s*[:#-]?\s*([A-Za-z0-9\-]{8,15})', detail_text):
                        cand = m.group(2)
                        ok, reason = self._is_reliable_order_id(cand, "detail_text_en")
                        if ok:
                            order_id = cand.strip().upper()
                            logger.info("[Orden %s] ID extraído='%s' estrategia=detail_text_regex fuente='Order ID'", idx, order_id)
                            break
                            
                # Fallback final: Buscar el patrón clásico directo (ej. 4V67ZPQG4PB)
                if not order_id:
                    for m in re.finditer(r'\b([A-Z0-9]{11,15})\b', detail_text):
                        cand = m.group(1)
                        if re.search(r'[A-Z]', cand) and re.search(r'[0-9]', cand):
                            ok, reason = self._is_reliable_order_id(cand, "detail_text_raw")
                            if ok:
                                order_id = cand.strip().upper()
                                logger.info("[Orden %s] ID extraído='%s' estrategia=detail_text_raw_fallback", idx, order_id)
                                break
                try:
                    page_source = self.driver.page_source
                    matches = re.findall(r'data-order-id=["\']([A-Za-z0-9\-]{3,})["\']', page_source)
                    for cand in matches:
                        ok, reason = self._is_reliable_order_id(cand, "data-order-id")
                        if not ok:
                            logger.info("[Orden %s] ID HTML descartado='%s' motivo=%s", idx, cand, reason)
                            continue
                        order_id = cand.strip().upper()
                        logger.info("[Orden %s] ID extraído='%s' estrategia=data-order-id fuente='page_source'", idx, order_id)
                        break
                except Exception as e:
                    logger.debug(f"[Orden {idx}] Búsqueda en source falló - {e}")

            if order_id:
                logger.info(f"✓ [Orden {idx}] ID de WhatsApp obtenido: {order_id}")
                self._go_back()
                return order_id, detail_text
            else:
                logger.warning(f"⚠ [Orden {idx}] No se pudo extraer ID único de WhatsApp. Se usará método alternativo.")
                self._go_back()
                return None, detail_text

        except Exception as e:
            logger.error(f"✗ [Orden {idx}] Excepción al obtener ID: {e}")
            try:
                self._go_back()
            except Exception:
                pass
            return None, ""

    @staticmethod
    def _is_order_request(detail_text: str) -> bool:
        """
        Detecta si el texto del panel de detalle corresponde a una
        'Solicitud de pedido' (order request) en lugar de un pedido confirmado.
        
        Las solicitudes de pedido:
        - Contienen 'Solicitud de pedido' / 'Order request'
        - Tienen 'Aceptar pedido' / 'Accept order' (botón de acción)
        - Muestran 'total estimado' / 'estimated total'
        - NO contienen 'PEDIDO N.°' ni un ID de orden real
        
        Returns True si es una solicitud (debe descartarse).
        """
        txt = (detail_text or '').lower()
        
        # Indicadores positivos de solicitud de pedido
        request_markers = [
            'solicitud de pedido',
            'order request',
            'aceptar pedido',
            'accept order',
            'total estimado',
            'estimated total',
        ]
        
        # Indicadores de pedido confirmado (si aparecen, NO es solicitud)
        confirmed_markers = [
            'pedido n',     # "PEDIDO N.°" 
            'order n',      # "ORDER N.°"
            'pedido #',
            'order #',
            'order id',
            'id de pedido',
        ]
        
        has_request = any(marker in txt for marker in request_markers)
        has_confirmed = any(marker in txt for marker in confirmed_markers)
        
        return has_request and not has_confirmed

    def _capture_order_detail_text(self, silent: bool = False, strict: bool = True) -> str:
        """Captura texto bruto del panel de detalle del pedido para extraer el ID."""
        selectors = [
            'div[aria-label="Detalles del pedido"]',
            'div[aria-label="Order details"]',
            'div[data-testid="order-details"]',
            'div[data-testid="right-drawer"]',
            'div[data-testid="drawer-right"]',
            'div[role="dialog"]',
        ]
        
        # Esperar un poco a que el panel derecho renderice
        time.sleep(0.5)
        
        for sel in selectors:
            try:
                el = self.driver.find_element(By.CSS_SELECTOR, sel)
                if el.is_displayed():
                    text = ' '.join((el.text or '').split())
                    if text:
                        if not silent:
                            logger.info("[Orden][detail] fuente=%s preview='%s'", sel, text[:160])
                        return text
            except Exception:
                continue
        
        return ""

    def _go_back(self):
        """
        Ya no cerramos el panel de detalle derecho.
        Dejarlo abierto mejora drásticamente el rendimiento y la estabilidad porque
        al hacer clic en la siguiente fila de la lista, el panel simplemente actualiza 
        su contenido en lugar de tener que reproducir la animación de apertura, 
        la cual era demasiado lenta y causaba fallos intermitentes en la captura.
        """
        time.sleep(0.3)

    # ── Parseo de una fila de orden ───────────────────────────────────────────
    def _parse_order_row(self, btn, cur_date: date, idx: int) -> dict | None:
        try:
            # Usar placeholder para ID - será asignado en la segunda pasada
            order = {"id": None, "whatsapp_order_id": None, "fecha": cur_date.isoformat()}
            order['_row_slot'] = idx
            row_text = ' '.join((btn.text or '').split())
            order['_row_text'] = row_text
            if row_text:
                order['_row_fingerprint'] = hashlib.md5(row_text.encode()).hexdigest()[:16]

            # Cliente
            try:
                sp = btn.find_element(By.CSS_SELECTOR, 'span[dir="auto"][title]')
                order['cliente'] = sp.get_attribute('title') or sp.text.strip()
            except NoSuchElementException:
                try:
                    order['cliente'] = btn.find_element(
                        By.CSS_SELECTOR, 'span[dir="auto"]').text.strip()
                except NoSuchElementException:
                    order['cliente'] = 'Desconocido'

            # Monto
            monto = None
            span_texts = [sp.text.strip() for sp in btn.find_elements(By.TAG_NAME, 'span') if sp.text and sp.text.strip()]
            currency_candidates = [t for t in span_texts if re.search(r'(COP|USD|EUR|\$|€)', t, re.I)]
            selected_source = ""

            parsed_candidates: list[tuple[str, float]] = []
            for cand in currency_candidates:
                parsed = self._parse_amount_token(cand)
                if parsed is not None and parsed > 0:
                    parsed_candidates.append((cand, parsed))

            if parsed_candidates:
                # Elegir el mayor para evitar tomar cantidades parciales o badges.
                selected_source, monto = max(parsed_candidates, key=lambda x: x[1])

            # Fallback: intentar desde el texto completo de la fila si no hubo match con moneda.
            if monto is None:
                parsed = self._parse_amount_token(row_text)
                if parsed is not None and parsed > 0:
                    monto = parsed
                    selected_source = row_text[:120]

            if monto is None:
                logger.warning("[SCRAPER] No se pudo parsear monto en fila idx=%s. Se deja en 0 temporalmente.", idx)
                monto = 0.0
                selected_source = row_text[:120]

            if selected_source:
                logger.info(
                    "[SCRAPER][MONTO] idx=%s fuente='%s' monto_parseado=%s",
                    idx,
                    selected_source,
                    monto,
                )

                digits = re.sub(r'\D', '', selected_source)
                if len(digits) >= 4 and monto < 1000:
                    logger.warning(
                        "[SCRAPER][MONTO] Posible desescala detectada idx=%s fuente='%s' monto_parseado=%s",
                        idx,
                        selected_source,
                        monto,
                    )
            order['monto'] = float(monto)

            # Estado
            estado_raw = next(
                (sp.text.strip()
                 for sp in reversed(btn.find_elements(By.TAG_NAME, 'span'))
                 if sp.text.strip()
                 and not (sp.get_attribute('title') or '')
                 and not re.search(r'(COP|USD|\$|€)', sp.text, re.I)),
                '')
            order['estado'] = ESTADO_MAP.get(estado_raw.lower(), estado_raw or 'Desconocido')

            # Producto (Deducción por exclusión del texto de la fila)
            clean_product = row_text
            if order.get('cliente') and order['cliente'] != 'Desconocido':
                clean_product = clean_product.replace(order['cliente'], '', 1)
            if selected_source:
                clean_product = clean_product.replace(selected_source, '', 1)
            if estado_raw:
                clean_product = clean_product.replace(estado_raw, '', 1)
            
            # Limpiar caracteres especiales sobrantes en los bordes
            clean_product = re.sub(r'^[^\w]+|[^\w]+$', '', clean_product.strip())
            
            if len(clean_product) > 0:
                producto = clean_product
            else:
                # Fallback al viejo método si todo falla
                producto = next(
                    (sp.get_attribute('title').strip()
                     for sp in btn.find_elements(By.CSS_SELECTOR, 'span[title]')
                     if sp.get_attribute('title')
                     and not re.fullmatch(r'[\d\s\+\-]+', sp.get_attribute('title').strip())
                     and sp.get_attribute('title').strip() != order.get('cliente', '')),
                    'Artículos de carrito')
            
            order['producto'] = producto

            return order

        except Exception as e:
            logger.error(f"Error parseando fila de orden {idx}: {e}")
            # Devolver None para que se salte esta orden (no incluir orden con error)
            # Si queremos incluirla con placeholder, cambiar return a crear orden con datos vacíos
            return None

    # ── Helpers ───────────────────────────────────────────────────────────────
    def _try_click(self, selectors: list[str], timeout: int = 8) -> bool:
        w = WebDriverWait(self.driver, timeout)
        for sel in selectors:
            try:
                w.until(EC.element_to_be_clickable((By.CSS_SELECTOR, sel))).click()
                return True
            except TimeoutException:
                continue
        return False

    @staticmethod
    def _parse_date_header(raw: str, today: date) -> date:
        if not raw:
            return today

        up = raw.strip().upper()

        # Palabras clave
        if up in ('TODAY', 'HOY'):
            return today
        if up in ('YESTERDAY', 'AYER'):
            return today - timedelta(days=1)

        # Formatos numéricos estándar
        for fmt in ('%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%Y-%m-%d',
                    '%d/%m/%y', '%d %b %Y', '%B %d, %Y',
                    '%d de %B de %Y', '%d %B %Y'):
            try:
                return datetime.strptime(raw.strip(), fmt).date()
            except ValueError:
                continue

        # Parseo manual con meses en español: "15 de marzo de 2025" o "15 marzo 2025"
        match = re.search(
            r'(\d{1,2})\s+(?:de\s+)?([a-záéíóúüñ]+)(?:\s+(?:de\s+)?(\d{4}))?',
            raw.strip(), re.I)
        if match:
            day  = int(match.group(1))
            mes  = match.group(2).lower()
            year = int(match.group(3)) if match.group(3) else today.year
            if mes in MESES_ES:
                try:
                    return date(year, MESES_ES[mes], day)
                except ValueError:
                    pass

        # "Mar 15" o "March 15" sin año → año actual
        match2 = re.search(r'([a-záéíóúüñ]+)\s+(\d{1,2})', raw.strip(), re.I)
        if match2:
            mes = match2.group(1).lower()
            day = int(match2.group(2))
            if mes in MESES_ES:
                try:
                    return date(today.year, MESES_ES[mes], day)
                except ValueError:
                    pass

        return today
