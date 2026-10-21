import sys
import os
import logging
import certifi

# Solucionar error SSL de "Could not reach host" en webdriver-manager al usar pyinstaller
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
os.environ["SSL_CERT_FILE"] = certifi.where()

# Asegurar que la carpeta 'app' esté en sys.path para que 'from config import ...' funcione
app_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app')
sys.path.insert(0, app_dir)

from config import DATA_DIR, migrate_legacy_data

log_path = os.path.join(DATA_DIR, 'debug.log')
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
    filename=log_path,
    filemode='w'
)

migrate_legacy_data()

from app import App

if __name__ == "__main__":
    App().mainloop()
