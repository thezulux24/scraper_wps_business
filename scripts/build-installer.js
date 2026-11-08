/**
 * Prepara el entorno de compilacion de electron-builder en Windows:
 * 1. Evita errores de symlinks de macOS en winCodeSign sin Modo Desarrollador.
 * 2. Extrae el desinstalador NSIS en memoria (UninstallerReader) sin bloquear el archivo Setup .exe.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const nsisTargetPath = path.join(
  __dirname,
  '..',
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

const env = {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
};

const cliPath = path.join(__dirname, '..', 'node_modules', 'electron-builder', 'cli.js');
const res = spawnSync(process.execPath, [cliPath, '--win', 'nsis'], {
  stdio: 'inherit',
  env,
});

process.exit(res.status ?? 0);
