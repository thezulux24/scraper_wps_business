const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { getAssetPath } = require('./paths');

const DEFAULT_INSTALL_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), 'AppData', 'Local'),
  'Programs',
  'CafePalMonte'
);

const UNINSTALL_REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CafePalMonte';

/**
 * Obtiene la carpeta raiz desde donde se esta ejecutando la aplicacion empaquetada
 * (por ejemplo dist/win-unpacked o la carpeta instalada).
 */
function getCurrentAppBundleRoot() {
  const exeDir = path.dirname(process.execPath);
  if (fs.existsSync(path.join(exeDir, 'resources', 'app.asar'))) {
    return exeDir;
  }
  const distUnpacked = path.resolve(__dirname, '..', '..', 'dist', 'win-unpacked');
  if (fs.existsSync(path.join(distUnpacked, 'resources', 'app.asar'))) {
    return distUnpacked;
  }
  return exeDir;
}

function getInstallStatus() {
  const exePath = path.join(DEFAULT_INSTALL_DIR, "Cafe Pa'l Monte.exe");
  const installed = fs.existsSync(exePath);
  const currentExeDir = path.normalize(path.dirname(process.execPath)).toLowerCase();
  const targetDirNorm = path.normalize(DEFAULT_INSTALL_DIR).toLowerCase();
  const runningFromInstalled = currentExeDir === targetDirNorm;

  return {
    installed,
    installDir: DEFAULT_INSTALL_DIR,
    installedExePath: exePath,
    runningFromInstalled,
    sourceBundleDir: getCurrentAppBundleRoot(),
  };
}

/**
 * Crea un acceso directo (.lnk) de Windows usando PowerShell WScript.Shell
 */
function createWindowsShortcut({ shortcutPath, targetPath, argumentsStr = '', iconPath = '', workingDir = '', description = '' }) {
  const psScript = `
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($env:CPM_LNK_PATH)
$s.TargetPath = $env:CPM_TARGET_PATH
if ($env:CPM_ARGS) { $s.Arguments = $env:CPM_ARGS }
if ($env:CPM_WORKDIR) { $s.WorkingDirectory = $env:CPM_WORKDIR }
if ($env:CPM_ICON) { $s.IconLocation = $env:CPM_ICON }
if ($env:CPM_DESC) { $s.Description = $env:CPM_DESC }
$s.Save()
`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    env: {
      ...process.env,
      CPM_LNK_PATH: shortcutPath,
      CPM_TARGET_PATH: targetPath,
      CPM_ARGS: argumentsStr,
      CPM_WORKDIR: workingDir || path.dirname(targetPath),
      CPM_ICON: iconPath,
      CPM_DESC: description,
    },
    windowsHide: true,
  });
}

function getWindowsFolder(specialFolder) {
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `[Environment]::GetFolderPath('${specialFolder}')`],
    { encoding: 'utf8', windowsHide: true }
  );
  return out.trim();
}

/**
 * Ejecuta la instalacion o actualizacion completa hacia targetInstallDir:
 * 1. Copia el paquete completo preservando el ejecutable oficial compatible con Smart App Control.
 * 2. Copia el icono app.ico para los accesos directos.
 * 3. Crea accesos directos en Escritorio y Menu Inicio (Aplicacion + Desinstalador).
 * 4. Registra la aplicacion en Aplicaciones instaladas de Windows (HKCU).
 */
function performInstallOrUpdate({
  sourceDir,
  targetDir = DEFAULT_INSTALL_DIR,
  createDesktopShortcut = true,
  createStartMenuShortcut = true,
  version = '2.0.0',
  onProgress = () => {},
}) {
  const srcRoot = sourceDir || getCurrentAppBundleRoot();
  const destRoot = path.resolve(targetDir);

  if (!fs.existsSync(path.join(srcRoot, 'resources'))) {
    throw new Error(`No se encontró un paquete válido en: ${srcRoot}`);
  }

  onProgress(15, 'Preparando carpeta de destino...');
  fs.mkdirSync(destRoot, { recursive: true });

  const sameFolder = path.normalize(srcRoot).toLowerCase() === path.normalize(destRoot).toLowerCase();
  if (!sameFolder) {
    onProgress(35, 'Copiando archivos del sistema y motor Chromium...');
    fs.cpSync(srcRoot, destRoot, { recursive: true, force: true });
  }

  // Asegurar que el icono oficial quede en la raiz de instalacion
  const srcIcon = getAssetPath('app.ico');
  const destIcon = path.join(destRoot, 'app.ico');
  if (srcIcon && fs.existsSync(srcIcon)) {
    fs.copyFileSync(srcIcon, destIcon);
  }

  const installedExe = path.join(destRoot, "Cafe Pa'l Monte.exe");

  // Crear script auxiliar de desinstalacion en la carpeta instalada
  const uninstallBatPath = path.join(destRoot, 'Desinstalar_CafePalMonte.bat');
  const uninstallBatContent = [
    '@echo off',
    'chcp 65001 > nul',
    `start "" "${installedExe}" --uninstall-wizard`,
  ].join('\r\n');
  fs.writeFileSync(uninstallBatPath, uninstallBatContent, 'utf8');

  onProgress(70, 'Configurando accesos directos en Windows...');
  const desktopDir = getWindowsFolder('Desktop');
  const startMenuProgramsDir = getWindowsFolder('Programs');
  const startMenuAppFolder = path.join(startMenuProgramsDir, "Cafe Pa'l Monte");

  const desktopShortcutPath = path.join(desktopDir, "Cafe Pa'l Monte.lnk");
  if (createDesktopShortcut) {
    createWindowsShortcut({
      shortcutPath: desktopShortcutPath,
      targetPath: installedExe,
      workingDir: destRoot,
      iconPath: fs.existsSync(destIcon) ? destIcon : installedExe,
      description: "Café Pa'l Monte · Gestión de Pedidos y Analítica",
    });
  }

  if (createStartMenuShortcut) {
    fs.mkdirSync(startMenuAppFolder, { recursive: true });
    createWindowsShortcut({
      shortcutPath: path.join(startMenuAppFolder, "Cafe Pa'l Monte.lnk"),
      targetPath: installedExe,
      workingDir: destRoot,
      iconPath: fs.existsSync(destIcon) ? destIcon : installedExe,
      description: "Café Pa'l Monte · Gestión de Pedidos y Analítica",
    });
    createWindowsShortcut({
      shortcutPath: path.join(startMenuAppFolder, "Desinstalar Cafe Pa'l Monte.lnk"),
      targetPath: installedExe,
      argumentsStr: '--uninstall-wizard',
      workingDir: destRoot,
      iconPath: fs.existsSync(destIcon) ? destIcon : installedExe,
      description: "Abrir Wizard de desinstalación de Café Pa'l Monte",
    });
  }

  onProgress(90, 'Registrando en Aplicaciones instaladas de Windows...');
  try {
    const regScript = `
$regPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CafePalMonte'
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name 'DisplayName' -Value "Cafe Pa'l Monte"
Set-ItemProperty -Path $regPath -Name 'DisplayVersion' -Value $env:CPM_VER
Set-ItemProperty -Path $regPath -Name 'Publisher' -Value "Cafe Pa'l Monte"
Set-ItemProperty -Path $regPath -Name 'DisplayIcon' -Value $env:CPM_ICON
Set-ItemProperty -Path $regPath -Name 'InstallLocation' -Value $env:CPM_DEST
Set-ItemProperty -Path $regPath -Name 'UninstallString' -Value ('"' + $env:CPM_EXE + '" --uninstall-wizard')
Set-ItemProperty -Path $regPath -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $regPath -Name 'NoRepair' -Value 1 -Type DWord
`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', regScript], {
      env: {
        ...process.env,
        CPM_VER: version,
        CPM_ICON: fs.existsSync(destIcon) ? destIcon : installedExe,
        CPM_DEST: destRoot,
        CPM_EXE: installedExe,
      },
      windowsHide: true,
    });
  } catch (_) {}

  onProgress(100, 'Instalación completada con éxito.');

  return {
    ok: true,
    installDir: destRoot,
    installedExe,
    desktopShortcutPath: createDesktopShortcut ? desktopShortcutPath : null,
    startMenuFolder: createStartMenuShortcut ? startMenuAppFolder : null,
  };
}

/**
 * Desinstala la aplicacion:
 * 1. Elimina accesos directos del Escritorio y Menu Inicio.
 * 2. Elimina el registro de desinstalacion en HKCU.
 * 3. Programa la eliminacion de la carpeta de programa en segundo plano tras cerrar la ventana,
 *    conservando intacta la base de datos en %LOCALAPPDATA%\CafePalMonte.
 */
function performUninstall({ targetDir = DEFAULT_INSTALL_DIR } = {}) {
  const destRoot = path.resolve(targetDir);

  try {
    const desktopDir = getWindowsFolder('Desktop');
    const desktopLnk = path.join(desktopDir, "Cafe Pa'l Monte.lnk");
    if (fs.existsSync(desktopLnk)) fs.unlinkSync(desktopLnk);
  } catch (_) {}

  try {
    const startMenuProgramsDir = getWindowsFolder('Programs');
    const startMenuAppFolder = path.join(startMenuProgramsDir, "Cafe Pa'l Monte");
    if (fs.existsSync(startMenuAppFolder)) {
      fs.rmSync(startMenuAppFolder, { recursive: true, force: true });
    }
    const legacyStartLnk = path.join(startMenuProgramsDir, "Desinstalar Cafe Pa'l Monte.lnk");
    if (fs.existsSync(legacyStartLnk)) fs.unlinkSync(legacyStartLnk);
  } catch (_) {}

  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CafePalMonte' -Recurse -Force -ErrorAction SilentlyContinue",
      ],
      { windowsHide: true }
    );
  } catch (_) {}

  // Si existe la carpeta de instalacion, lanzar proceso desacoplado que espera a que cierre Electron y la borra
  if (fs.existsSync(destRoot)) {
    const cleanupCmd = `Start-Sleep -Seconds 2; Get-Process | Where-Object { $_.Path -like '${destRoot.replace(/'/g, "''")}*' } | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 600; Remove-Item -LiteralPath '${destRoot.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`;
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', cleanupCmd],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }
    );
    child.unref();
  }

  return {
    ok: true,
    removedDir: destRoot,
  };
}

module.exports = {
  DEFAULT_INSTALL_DIR,
  UNINSTALL_REG_KEY,
  getInstallStatus,
  performInstallOrUpdate,
  performUninstall,
};
