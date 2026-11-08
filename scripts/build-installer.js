/**
 * Prepara el entorno de compilacion de electron-builder en Windows:
 * 1. Evita errores de symlinks de macOS en winCodeSign sin Modo Desarrollador.
 * 2. Extrae el desinstalador NSIS en memoria (UninstallerReader) sin bloquear el archivo Setup .exe.
 * 3. Corrige el bug de prefijos de carpetas en app-builder.exe --flatten (ej. call-bind vs call-bind-apply-helpers).
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

const pkgDepsPath = path.join(
  __dirname,
  '..',
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

const cliPath = path.join(__dirname, '..', 'node_modules', 'electron-builder', 'cli.js');
const res = spawnSync(process.execPath, [cliPath, '--win', 'nsis'], {
  stdio: 'inherit',
  env,
});

process.exit(res.status ?? 0);
