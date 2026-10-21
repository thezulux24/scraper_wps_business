# WBS Order Manager - Manual de Usuario

Sistema integral para la sincronización automática, gestión y analítica de órdenes generadas a través de WhatsApp Business Web.

---

## Descripción del Sistema

WBS Order Manager es una aplicación de escritorio diseñada para consolidar las ventas originadas en WhatsApp Business. Extrae de forma segura la información de cada orden, previniendo duplicados y consolidando los datos en una base local robusta. Adicionalmente, cuenta con un panel analítico en tiempo real y opciones de generación de reportes avanzados para facilitar la toma de decisiones empresariales.

Características principales:
- **Sincronización automatizada:** Conexión directa y segura a WhatsApp Web para la descarga de pedidos.
- **Prevención de duplicados:** Identificación única de cada pedido para evitar registros repetidos.
- **Panel analítico (Dashboard):** Visualización de métricas clave (ingresos, órdenes canceladas, top clientes y comparativas anuales).
- **Generación de reportes:** Exportación a PDF y Excel de periodos predeterminados o personalizados.
- **Base de datos local:** Almacenamiento privado y seguro mediante SQLite, sin depender de servidores externos.

---

## Requisitos del Sistema

Para el correcto funcionamiento de la aplicación, el equipo debe cumplir con los siguientes requerimientos:

- **Sistema Operativo:** Windows 10 o superior (64-bits).
- **Navegador Web:** Google Chrome o Microsoft Edge (en su última versión).
- **Software base:** Python 3.10 o superior (se recomienda 3.11).

---

## Guía de Instalación para desarrollador

Existen dos vías para instalar la aplicación en su entorno de trabajo:

### Instalación Rápida (Windows)
1. Extraiga la carpeta del software en la ubicación deseada.
2. Haga doble clic sobre el archivo `install.bat`. Este script configurará el entorno virtual y descargará las dependencias necesarias de forma automática.

### Instalación Manual (Técnica)
1. Abra la terminal (Símbolo del sistema o PowerShell) en el directorio del proyecto.
2. Cree un entorno virtual:
   `python -m venv .venv`
3. Active el entorno virtual:
   `.\.venv\Scripts\activate`
4. Instale las dependencias:
   `pip install -r requirements.txt`

---

## Guía de Uso para desarrolladores

Para ejecutar la aplicación, inicie el archivo `run.bat` o ejecute desde la consola el comando `python app/main.py`.

### 1. Conexión de WhatsApp
1. Al iniciar la aplicación, diríjase a la barra lateral izquierda y presione **"Conectar WhatsApp"**.
2. Se abrirá una ventana controlada de su navegador mostrando el código QR de WhatsApp Web.
3. Desde su dispositivo móvil, escanee el código QR tal como lo haría al iniciar sesión normalmente.
4. Una vez la sesión se haya vinculado, la ventana se acoplará y el sistema iniciará la primera sincronización de forma automática.

### 2. Gestión de Órdenes
- **Sincronización Automática:** El sistema actualizará las órdenes en segundo plano mientras permanezca conectado.
- **Sincronización Manual:** En caso de requerir una actualización inmediata, presione el botón **"Sincronización Manual"** en el panel izquierdo.
- **Filtros de fecha:** En la pestaña principal de "Órdenes", puede seleccionar rangos de fecha específicos para consultar transacciones puntuales.

### 3. Analítica Empresarial
Acceda a la pestaña **"Analítica"** para consultar métricas financieras y operativas. Encontrará la siguiente información:
- Resumen financiero: Ingresos, promedio por orden y tasas de órdenes finalizadas/canceladas.
- Gráfico de ventas y proyecciones.
- Gráfico comparativo de ventas anuales.
- Distribución de estados y tasas de cancelación mensuales.
- Top de clientes por volumen de compra y productos más vendidos.

### 4. Generación de Reportes
En la pestaña **"Reportes"**, puede generar documentos consolidados en formato PDF o Excel. 
- Utilice la sección **"Generación Rápida"** para obtener informes instantáneos de periodos comunes (ej. Último Mes, Último Trimestre, Acumulado Anual, Toda la Operación).
- Todos los documentos generados se listarán en la parte inferior, donde podrá abrirlos haciendo clic en su botón respectivo.

---

## Solución de Problemas Frecuentes

**El navegador no abre tras presionar "Conectar WhatsApp"**
Verifique que tiene Google Chrome o Microsoft Edge instalados en su última versión y que su antivirus no esté bloqueando la ejecución automatizada de Selenium.

**Las órdenes no se están actualizando**
Asegúrese de que el teléfono móvil mantenga conexión a internet y que la sesión en el navegador controlado por el sistema no haya sido cerrada o interrumpida de forma manual.

**El monto total en los reportes no coincide con mi sumatoria manual**
El cálculo financiero está programado de acuerdo a la lógica empresarial: únicamente suma las órdenes con estados aprobatorios (Completado, Enviado, Envío en preparación, Entregado). Las órdenes pendientes y canceladas son excluidas de la sumatoria de ingresos netos.

---

## Soporte y Mantenimiento

Este software realiza conexiones locales y procesos automatizados. No requiere llaves de API ni compromete los datos a servidores en la nube. Las carpetas de sesión y bases de datos (`app/orders.db`) son de uso exclusivo y local. Se recomienda hacer copias de seguridad de la base de datos periódicamente.
