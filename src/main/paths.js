const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const LOCAL_APPDATA =
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

const DATA_DIR = path.join(LOCAL_APPDATA, 'CafePalMonte');
const DB_PATH = path.join(DATA_DIR, 'orders.db');
const REPORTS_DIR = path.join(DATA_DIR, 'reportes');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const SESSION_BASE = path.join(DATA_DIR, 'wsp_session');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const LOG_PATH = path.join(DATA_DIR, 'desktop.log');

function ensureDataDirs() {
  for (const dir of [DATA_DIR, REPORTS_DIR, BACKUPS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getAssetPath(filename) {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'assets', filename));
    candidates.push(path.join(process.resourcesPath, 'app.asar', 'app', 'assets', filename));
  }
  const projectRoot = path.resolve(__dirname, '..', '..');
  candidates.push(path.join(projectRoot, 'app', 'assets', filename));
  candidates.push(path.join(projectRoot, 'logo', filename));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

function resolveLegacyFolder(folderOrFile) {
  if (!folderOrFile || !fs.existsSync(folderOrFile)) {
    return null;
  }
  const stat = fs.statSync(folderOrFile);
  if (stat.isFile() && folderOrFile.toLowerCase().endsWith('.db')) {
    const parent = path.dirname(folderOrFile);
    const grandParent = path.dirname(parent);
    const reportsCandidates = [
      path.join(parent, 'reportes'),
      path.join(grandParent, 'reportes'),
      path.join(grandParent, '_internal', 'reportes'),
    ];
    const sessions = [];
    for (const root of [parent, grandParent]) {
      for (const browser of ['edge', 'chrome', 'firefox']) {
        const s = path.join(root, `wsp_session_${browser}`);
        if (fs.existsSync(s) && fs.statSync(s).isDirectory()) {
          sessions.push({ browser, path: s });
        }
      }
    }
    return {
      sourceLabel: folderOrFile,
      dbPath: folderOrFile,
      reportsDir: reportsCandidates.find((d) => fs.existsSync(d) && fs.statSync(d).isDirectory()) || null,
      sessions,
    };
  }

  if (stat.isDirectory()) {
    const dbCandidates = [
      path.join(folderOrFile, 'orders.db'),
      path.join(folderOrFile, '_internal', 'orders.db'),
      path.join(folderOrFile, 'app', 'orders.db'),
      path.join(folderOrFile, 'dist', 'CafePalMonte', '_internal', 'orders.db'),
    ];
    const reportsCandidates = [
      path.join(folderOrFile, 'reportes'),
      path.join(folderOrFile, '_internal', 'reportes'),
      path.join(folderOrFile, 'app', 'reportes'),
    ];
    const sessions = [];
    for (const browser of ['edge', 'chrome', 'firefox']) {
      for (const sub of [
        path.join(folderOrFile, `wsp_session_${browser}`),
        path.join(folderOrFile, 'dist', 'CafePalMonte', `wsp_session_${browser}`),
      ]) {
        if (fs.existsSync(sub) && fs.statSync(sub).isDirectory()) {
          sessions.push({ browser, path: sub });
          break;
        }
      }
    }
    const foundDb = dbCandidates.find((f) => fs.existsSync(f) && fs.statSync(f).isFile()) || null;
    const foundReports = reportsCandidates.find((d) => fs.existsSync(d) && fs.statSync(d).isDirectory()) || null;
    if (foundDb || foundReports || sessions.length > 0) {
      return {
        sourceLabel: folderOrFile,
        dbPath: foundDb,
        reportsDir: foundReports,
        sessions,
      };
    }
  }
  return null;
}

function discoverKnownLegacySources() {
  const home = os.homedir();
  const projectRoot = path.resolve(__dirname, '..', '..');
  const searchDirs = [
    projectRoot,
    path.join(projectRoot, 'dist', 'CafePalMonte'),
    path.join(home, 'Desktop', 'CafePalMonte'),
    path.join(home, 'Escritorio', 'CafePalMonte'),
    path.join(home, 'Downloads', 'CafePalMonte'),
    path.join(home, 'Descargas', 'CafePalMonte'),
    path.join(home, 'Documents', 'CafePalMonte'),
    path.join(home, 'Documentos', 'CafePalMonte'),
    'C:\\CafePalMonte',
  ];

  const seenDbs = new Set([path.resolve(DB_PATH).toLowerCase()]);
  const results = [];

  for (const dir of searchDirs) {
    const resolved = resolveLegacyFolder(dir);
    if (!resolved) continue;
    const key = resolved.dbPath
      ? path.resolve(resolved.dbPath).toLowerCase()
      : path.resolve(resolved.sourceLabel).toLowerCase();
    if (seenDbs.has(key)) continue;
    seenDbs.add(key);
    results.push(resolved);
  }
  return results;
}

function readSettings() {
  ensureDataDirs();
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch (_) {
    // ignore malformed settings
  }
  return { theme: 'light', autoMigratedOnce: false };
}

function writeSettings(patch) {
  const current = readSettings();
  const next = { ...current, ...patch };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = {
  DATA_DIR,
  DB_PATH,
  REPORTS_DIR,
  BACKUPS_DIR,
  SESSION_BASE,
  SETTINGS_PATH,
  LOG_PATH,
  ensureDataDirs,
  getAssetPath,
  resolveLegacyFolder,
  discoverKnownLegacySources,
  readSettings,
  writeSettings,
};
