# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# database.py
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""Persistencia local de pedidos usando SQLite."""

import sqlite3
import logging
from datetime import date
from pathlib import Path

logger = logging.getLogger(__name__)

# La base de datos se guarda junto a los módulos de la app
DB_PATH = Path(__file__).parent / "orders.db"


class Database:
    """
    Maneja el almacenamiento persistente de órdenes en SQLite.
    La tabla usa el ID de WhatsApp como clave primaria para evitar duplicados.
    """

    def __init__(self, db_path: str | Path = DB_PATH):
        self.db_path = str(db_path)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """
        Crea la tabla si no existe, o la migra si es necesaria.
        Estrategia:
        - La tabla usa 'id' como PK (combinación única cliente+producto+fecha+monto hash)
        - Agrega campo 'whatsapp_order_id' como índice único para deduplicación real
        - Si la tabla existe pero no tiene whatsapp_order_id, lo agrega
        """
        with self._connect() as conn:
            # Crear tabla si no existe
            conn.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    id                 TEXT PRIMARY KEY,
                    whatsapp_order_id  TEXT UNIQUE,
                    cliente            TEXT NOT NULL DEFAULT '',
                    producto           TEXT NOT NULL DEFAULT '',
                    monto              REAL NOT NULL DEFAULT 0.0,
                    fecha              TEXT NOT NULL,
                    estado             TEXT NOT NULL DEFAULT 'Desconocido',
                    synced_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
                )
            """)
            
            # Migración: si la columna whatsapp_order_id no existe, agregarla
            cursor = conn.execute("PRAGMA table_info(orders)")
            columns = {row[1] for row in cursor.fetchall()}
            
            if 'whatsapp_order_id' not in columns:
                logger.info("Migrando BD: agregando columna whatsapp_order_id...")
                # SQLite no permite agregar columnas UNIQUE con ALTER TABLE.
                conn.execute("ALTER TABLE orders ADD COLUMN whatsapp_order_id TEXT")
                conn.commit()
                logger.info("Migración completada: columna whatsapp_order_id agregada")
            
            # Crear índices para performance
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_orders_fecha ON orders(fecha)
            """)
            try:
                conn.execute("""
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_whatsapp_id_unique
                    ON orders(whatsapp_order_id)
                """)
            except sqlite3.IntegrityError:
                logger.error(
                    "No se pudo crear índice único de whatsapp_order_id por duplicados existentes. "
                    "Revisa y limpia duplicados para reforzar integridad.")
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_orders_whatsapp_id
                    ON orders(whatsapp_order_id)
                """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_orders_cliente ON orders(cliente)
            """)
            conn.commit()
        logger.info(f"Base de datos lista: {self.db_path}")

    # ── Escritura ─────────────────────────────────────────────────────────────

    def upsert_orders(self, orders: list[dict]) -> int:
        """
        Inserta o actualiza órdenes. Devuelve el número de registros afectados.
        
        Estrategia de deduplicación:
        1. Si la orden tiene whatsapp_order_id (ID real de WhatsApp), usarlo como clave única
        2. Si no tiene whatsapp_order_id, usar el id (hash fallback)
        3. Si la orden ya existe (por whatsapp_order_id o id), actualizar todos los campos
        
        Validación:
        - La orden debe tener al menos: cliente, fecha, id
        - Se loguea cuando se inserta/actualiza para auditoria
        """
        if not orders:
            return 0

        affected = 0
        with self._connect() as conn:
            for o in orders:
                # Validación básica
                if not o.get('id'):
                    logger.warning(f"⚠ Orden sin ID será ignorada: {o}")
                    continue
                
                if not o.get('fecha'):
                    logger.warning(f"⚠ Orden sin fecha será ignorada: orden_id={o.get('id')}")
                    continue
                
                if not o.get('cliente'):
                    o['cliente'] = 'Desconocido'
                
                if not o.get('producto'):
                    o['producto'] = 'Sin descripción'
                
                # Preparar datos para insert/update
                order_id = o.get('id', '')
                wa_order_id = o.get('whatsapp_order_id')  # Puede ser None
                cliente = o.get('cliente', '')
                producto = o.get('producto', '')
                monto = float(o.get('monto', 0.0))
                fecha = o.get('fecha', date.today().isoformat())
                estado = o.get('estado', 'Desconocido')
                
                try:
                    # Verificar si ya existe esta orden y obtener el id persistido
                    existing_id = self._find_existing_order_id(conn, order_id, wa_order_id)

                    if existing_id is not None:
                        if monto <= 0:
                            prev_row = conn.execute(
                                "SELECT monto FROM orders WHERE id = ? LIMIT 1",
                                (existing_id,)
                            ).fetchone()
                            prev_monto = float(prev_row[0]) if prev_row and prev_row[0] is not None else 0.0
                            if prev_monto > 0:
                                logger.warning(
                                    "[DB] Monto parseado en 0 para incoming_id=%s; se conserva monto previo=%s",
                                    order_id,
                                    prev_monto,
                                )
                                monto = prev_monto

                        logger.info(
                            f"[DB] Actualizando orden: incoming_id={order_id} stored_id={existing_id} "
                            f"cliente='{cliente}' monto={monto} estado={estado}")
                        conn.execute("""
                            UPDATE orders
                            SET cliente = ?, producto = ?, monto = ?,
                                estado = ?, whatsapp_order_id = ?, synced_at = datetime('now','localtime')
                            WHERE id = ?
                        """, (cliente, producto, monto, estado, wa_order_id, existing_id))
                    else:
                        logger.info(
                            f"[DB] Insertando orden nueva: id={order_id} whatsapp_id={wa_order_id} "
                            f"cliente='{cliente}' monto={monto} estado={estado}")
                        conn.execute("""
                            INSERT INTO orders (id, whatsapp_order_id, cliente, producto, monto, fecha, estado, synced_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
                        """, (order_id, wa_order_id, cliente, producto, monto, fecha, estado))

                    affected += conn.execute("SELECT changes()").fetchone()[0]
                except sqlite3.IntegrityError as exc:
                    logger.error(
                        "[DB] IntegrityError en upsert: id=%s whatsapp_id=%s cliente=%s error=%s",
                        order_id, wa_order_id, cliente, exc)
                except Exception as exc:
                    logger.exception(
                        "[DB] Error inesperado en upsert: id=%s whatsapp_id=%s cliente=%s error=%s",
                        order_id, wa_order_id, cliente, exc)
            
            conn.commit()
        
        logger.info(f"[DB] upsert_orders completado: {affected} registro(s) afectado(s)")
        return affected
    
    def _find_existing_order(self, order_id: str, wa_order_id: str | None) -> bool:
        """
        Verifica si una orden ya existe en la BD.
        Primero busca por whatsapp_order_id (más confiable), luego por id.
        Devuelve True si existe, False si no.
        """
        with self._connect() as conn:
            # Búsqueda 1: por whatsapp_order_id si existe
            if wa_order_id:
                row = conn.execute(
                    "SELECT 1 FROM orders WHERE whatsapp_order_id = ? LIMIT 1",
                    (wa_order_id,)
                ).fetchone()
                if row:
                    return True
            
            # Búsqueda 2: por id (hash fallback)
            row = conn.execute(
                "SELECT 1 FROM orders WHERE id = ? LIMIT 1",
                (order_id,)
            ).fetchone()
            return bool(row)

    def _find_existing_order_id(self, conn: sqlite3.Connection, order_id: str, wa_order_id: str | None) -> str | None:
        """Devuelve el id persistido que coincide por whatsapp_order_id o por id."""
        if wa_order_id:
            row = conn.execute(
                "SELECT id FROM orders WHERE whatsapp_order_id = ? LIMIT 1",
                (wa_order_id,)
            ).fetchone()
            if row:
                return row[0]

        row = conn.execute(
            "SELECT id FROM orders WHERE id = ? LIMIT 1",
            (order_id,)
        ).fetchone()
        return row[0] if row else None

    def update_estado(self, order_id: str, estado: str):
        """Actualiza el estado de una orden específica."""
        with self._connect() as conn:
            conn.execute(
                "UPDATE orders SET estado = ? WHERE id = ?",
                (estado, order_id))
            conn.commit()

    # ── Lectura ───────────────────────────────────────────────────────────────

    def get_all(self) -> list[dict]:
        """Devuelve todas las órdenes ordenadas por fecha descendente."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, whatsapp_order_id, cliente, producto, monto, fecha, estado "
                "FROM orders ORDER BY fecha DESC").fetchall()
        return [dict(r) for r in rows]
    
    def get_by_whatsapp_id(self, wa_order_id: str) -> dict | None:
        """Obtiene una orden específica por su whatsapp_order_id."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, whatsapp_order_id, cliente, producto, monto, fecha, estado "
                "FROM orders WHERE whatsapp_order_id = ? LIMIT 1",
                (wa_order_id,)
            ).fetchone()
        return dict(row) if row else None
    
    def get_by_id(self, order_id: str) -> dict | None:
        """Obtiene una orden específica por su id (hash)."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, whatsapp_order_id, cliente, producto, monto, fecha, estado "
                "FROM orders WHERE id = ? LIMIT 1",
                (order_id,)
            ).fetchone()
        return dict(row) if row else None

    def get_by_date_range(self, date_from: str, date_to: str) -> list[dict]:
        """Devuelve órdenes dentro de un rango de fechas (YYYY-MM-DD)."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, whatsapp_order_id, cliente, producto, monto, fecha, estado "
                "FROM orders WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC",
                (date_from, date_to)).fetchall()
        return [dict(r) for r in rows]

    def get_by_month(self, year: int, month: int) -> list[dict]:
        """Devuelve órdenes de un mes/año específico."""
        prefix = f"{year:04d}-{month:02d}"
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, whatsapp_order_id, cliente, producto, monto, fecha, estado "
                "FROM orders WHERE fecha LIKE ? ORDER BY fecha DESC",
                (f"{prefix}%",)).fetchall()
        return [dict(r) for r in rows]

    def get_months(self) -> list[tuple[int, int]]:
        """
        Devuelve lista de (año, mes) con al menos una orden, ordenados desc.
        Útil para poblar el selector de meses en la UI.
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT DISTINCT substr(fecha,1,4) AS y, substr(fecha,6,2) AS m "
                "FROM orders ORDER BY y DESC, m DESC").fetchall()
        return [(int(r['y']), int(r['m'])) for r in rows]
    
    def get_sync_stats(self) -> dict:
        """Devuelve estadísticas de sincronización."""
        with self._connect() as conn:
            total = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
            with_wa_id = conn.execute(
                "SELECT COUNT(*) FROM orders WHERE whatsapp_order_id IS NOT NULL"
            ).fetchone()[0]
            without_wa_id = total - with_wa_id
        
        return {
            'total': total,
            'with_whatsapp_id': with_wa_id,
            'without_whatsapp_id': without_wa_id,
            'success_rate': (with_wa_id / total * 100) if total > 0 else 0
        }

    def count(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]

    # ── Utilidades ────────────────────────────────────────────────────────────

    def merge(self, new_orders: list[dict]) -> tuple[int, int]:
        """
        Sincroniza nuevas órdenes con la BD.
        Devuelve (número_insertadas, número_actualizadas).
        
        Usa lógica inteligente:
        - Si la orden tiene whatsapp_order_id, lo usa para deduplicar
        - Calcula inserciones vs actualizaciones comparando antes/después
        """
        if not new_orders:
            return 0, 0
        
        before_count = self.count()
        
        # Contar cuántas órdenes ya existían
        existing_count = 0
        with self._connect() as conn:
            for o in new_orders:
                existing_id = self._find_existing_order_id(
                    conn,
                    o.get('id', ''),
                    o.get('whatsapp_order_id'))
                if existing_id is not None:
                    existing_count += 1
        
        # Hacer upsert
        self.upsert_orders(new_orders)
        
        after_count = self.count()
        new_inserted = after_count - before_count
        updated_count = existing_count
        
        logger.info(f"[Merge] Sincronización: +{new_inserted} nuevas, {updated_count} actualizadas")
        return new_inserted, updated_count

    def delete_orders(self, order_ids: list[str]) -> int:
        """Elimina las órdenes especificadas por sus IDs de la base de datos."""
        if not order_ids:
            return 0
        with self._connect() as conn:
            placeholders = ",".join("?" for _ in order_ids)
            cursor = conn.execute(f"DELETE FROM orders WHERE id IN ({placeholders})", order_ids)
            affected = cursor.rowcount
            conn.commit()
        logger.info(f"[DB] delete_orders: {affected} registro(s) eliminado(s)")
        return affected
