const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

exports.default = async function afterPack(context) {
  const rootDir = path.resolve(__dirname, '..');
  const appOutDir = context.appOutDir;
  const officialElectronExe = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');
  const unpackedExe = path.join(appOutDir, "Cafe Pa'l Monte.exe");
  const appIco = path.join(rootDir, 'app', 'assets', 'app.ico');
  const rceditPath = path.join(
    process.env.LOCALAPPDATA || '',
    'electron-builder',
    'Cache',
    'winCodeSign',
    'winCodeSign-2.6.0',
    'rcedit-x64.exe'
  );

  if (fs.existsSync(officialElectronExe) && fs.existsSync(appOutDir)) {
    fs.copyFileSync(officialElectronExe, unpackedExe);
    if (fs.existsSync(appIco)) {
      fs.copyFileSync(appIco, path.join(appOutDir, 'app.ico'));
      if (fs.existsSync(rceditPath)) {
        spawnSync(rceditPath, [unpackedExe, '--set-icon', appIco], { stdio: 'inherit' });
      }
    }
    console.log('[afterPack] Icono de Cafe Pa\'l Monte incrustado en:', unpackedExe);
  }
};
