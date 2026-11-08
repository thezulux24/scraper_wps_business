/**
 * Prepara y ejecuta el empaquetado de escritorio en Windows:
 * 1. Corrige el bug de prefijos de carpetas en app-builder.exe --flatten (ej. call-bind vs call-bind-apply-helpers).
 * 2. Extrae el desinstalador NSIS en memoria sin bloquear archivos en dist.
 * 3. Restaura el binario oficial inalterado de electron.exe en dist/win-unpacked/Cafe Pa'l Monte.exe
 *    para garantizar compatibilidad 100% con el Control Inteligente de Aplicaciones de Windows 11.
 * 4. Genera los lanzadores directos del Wizard de instalacion/actualizacion y desinstalacion en dist/.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');

const nsisTargetPath = path.join(
  rootDir,
  'node_modules',
  'app-builder-lib',
  'out',
  'targets',
  'nsis',
  'NsisTarget.js'
);

if (fs.existsSync(nsisTargetPath)) {
  const content = fs.readFileSync(nsisTargetPath, 'utf8');
  const legacyBlock = `        // http://forums.winamp.com/showthread.php?p=3078545
        if ((0, macosVersion_1.isMacOsCatalina)()) {`;
  if (content.includes(legacyBlock)) {
    const updated = content.replace(
      /\/\/ http:\/\/forums\.winamp\.com\/showthread\.php\?p=3078545[\s\S]*?await packager\.sign\(uninstallerPath\);/,
      `await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);\n        await (0, fs_extra_1.unlink)(installerPath);\n        await packager.sign(uninstallerPath);`
    );
    fs.writeFileSync(nsisTargetPath, updated, 'utf8');
  }
}

const pkgDepsPath = path.join(
  rootDir,
  'node_modules',
  'app-builder-lib',
  'out',
  'util',
  'packageDependencies.js'
);

if (fs.existsSync(pkgDepsPath)) {
  const content = fs.readFileSync(pkgDepsPath, 'utf8');
  if (!content.includes('fixFlatTree')) {
    const patched = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLazyProductionDeps = createLazyProductionDeps;
const path = require("path");
const lazy_val_1 = require("lazy-val");
const appBuilder_1 = require("./appBuilder");

function fixFlatTree(list) {
    if (!Array.isArray(list)) return list;
    const promoted = [];
    for (const dep of list) {
        if (dep && Array.isArray(dep.conflictDependency)) {
            dep.conflictDependency = dep.conflictDependency.filter(c => {
                if (c && c.dir && dep.dir && !c.dir.startsWith(dep.dir + path.sep)) {
                    promoted.push(c);
                    return false;
                }
                return true;
            });
            if (dep.conflictDependency.length === 0) {
                delete dep.conflictDependency;
            }
        }
    }
    if (promoted.length > 0) {
        list.push(...fixFlatTree(promoted));
    }
    return list;
}

function createLazyProductionDeps(projectDir, excludedDependencies, flatten) {
    return new lazy_val_1.Lazy(async () => {
        const args = ["node-dep-tree", "--dir", projectDir];
        if (flatten)
            args.push("--flatten");
        if (excludedDependencies != null) {
            for (const name of excludedDependencies) {
                args.push("--exclude-dep", name);
            }
        }
        const raw = await (0, appBuilder_1.executeAppBuilderAsJson)(args);
        return flatten ? fixFlatTree(raw) : raw;
    });
}
`;
    fs.writeFileSync(pkgDepsPath, patched, 'utf8');
  }
}

const env = {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
};

const cliPath = path.join(rootDir, 'node_modules', 'electron-builder', 'cli.js');
const res = spawnSync(process.execPath, [cliPath, '--win', 'nsis'], {
  stdio: 'inherit',
  env,
});

if ((res.status ?? 0) !== 0) {
  process.exit(res.status ?? 1);
}

// Restaurar el binario oficial de electron.exe (reconocido por Smart App Control de Windows 11)
const officialElectronExe = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const unpackedDir = path.join(rootDir, 'dist', 'win-unpacked');
const unpackedExe = path.join(unpackedDir, "Cafe Pa'l Monte.exe");
const appIco = path.join(rootDir, 'app', 'assets', 'app.ico');

if (fs.existsSync(officialElectronExe) && fs.existsSync(unpackedDir)) {
  fs.copyFileSync(officialElectronExe, unpackedExe);
  if (fs.existsSync(appIco)) {
    fs.copyFileSync(appIco, path.join(unpackedDir, 'app.ico'));
  }
  console.log('Binario oficial compatible con Smart App Control aplicado en:', unpackedExe);
}

// Crear lanzadores del Wizard compatibles con Smart App Control en dist/
const distDir = path.join(rootDir, 'dist');
const installBat = path.join(distDir, 'Instalar_o_Actualizar_CafePalMonte.bat');
fs.writeFileSync(
  installBat,
  [
    '@echo off',
    'chcp 65001 > nul',
    'title Wizard de Instalacion y Actualizacion - Cafe Pa\'l Monte',
    'start "" "%~dp0win-unpacked\\Cafe Pa\'l Monte.exe" --wizard',
  ].join('\r\n'),
  'utf8'
);

const uninstallBat = path.join(distDir, 'Desinstalar_CafePalMonte.bat');
fs.writeFileSync(
  uninstallBat,
  [
    '@echo off',
    'chcp 65001 > nul',
    'title Wizard de Desinstalacion - Cafe Pa\'l Monte',
    'if exist "%LOCALAPPDATA%\\Programs\\CafePalMonte\\Cafe Pa\'l Monte.exe" (',
    '    start "" "%LOCALAPPDATA%\\Programs\\CafePalMonte\\Cafe Pa\'l Monte.exe" --uninstall-wizard',
    '    exit /b 0',
    ')',
    'if exist "%~dp0win-unpacked\\Cafe Pa\'l Monte.exe" (',
    '    start "" "%~dp0win-unpacked\\Cafe Pa\'l Monte.exe" --uninstall-wizard',
    '    exit /b 0',
    ')',
    'start ms-settings:appsfeatures',
  ].join('\r\n'),
  'utf8'
);

console.log('Lanzadores del Wizard creados en dist/.');
