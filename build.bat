@echo off
echo Limpiando compilaciones anteriores...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist CafePalMonte.spec del /q CafePalMonte.spec

echo Instalando pyinstaller y dependencias...
pip install -r requirements.txt
pip install pyinstaller

echo.
echo Compilando ejecutable...
pyinstaller --clean --noconfirm --onedir --windowed --icon "app/assets/app.ico" --name "CafePalMonte" --paths app --add-data "app/assets;assets" --collect-all selenium --collect-data certifi --collect-all webdriver_manager run.py

echo.
echo Proceso terminado. La carpeta del programa se encuentra en 'dist\CafePalMonte'.
pause
