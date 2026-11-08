const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cafeApi', {
  getInitialState: () => ipcRenderer.invoke('app:getInitialState'),
  saveSettings: (patch) => ipcRenderer.invoke('app:saveSettings', patch),
  copyToClipboard: (text) => ipcRenderer.invoke('app:copyToClipboard', text),

  // Pedidos
  getOrders: () => ipcRenderer.invoke('orders:getAll'),
  upsertOrder: (order, isEdit) => ipcRenderer.invoke('orders:upsert', { order, isEdit }),
  changeOrdersState: (orderIds, newState) =>
    ipcRenderer.invoke('orders:changeState', { orderIds, newState }),
  deleteOrders: (orderIds) => ipcRenderer.invoke('orders:delete', { orderIds }),

  // WhatsApp Business
  connectWhatsApp: (opts) => ipcRenderer.invoke('wa:connect', opts),
  disconnectWhatsApp: () => ipcRenderer.invoke('wa:disconnect'),
  syncManual: () => ipcRenderer.invoke('wa:syncManual'),
  toggleAutoSync: () => ipcRenderer.invoke('wa:toggleAutoSync'),

  // Reportes PDF y Excel
  exportReport: (payload) => ipcRenderer.invoke('reports:export', payload),
  listReports: () => ipcRenderer.invoke('reports:list'),
  openFile: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),

  // Migración de BD, Respaldos y Wizard de Actualización
  pickLegacySource: (mode) => ipcRenderer.invoke('migration:pickSource', { mode }),
  inspectLegacySource: (targetPath) => ipcRenderer.invoke('migration:inspect', { targetPath }),
  migrateFromPath: (targetPath) => ipcRenderer.invoke('migration:run', { targetPath }),
  createBackup: () => ipcRenderer.invoke('migration:backup'),
  openDataFolder: () => ipcRenderer.invoke('migration:openDataFolder'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  runUpdateWizardFile: () => ipcRenderer.invoke('updater:runWizardFile'),
  runUninstallerWizard: () => ipcRenderer.invoke('updater:runUninstaller'),
  getInstallStatus: () => ipcRenderer.invoke('wizard:getStatus'),
  pickInstallFolder: () => ipcRenderer.invoke('wizard:pickFolder'),
  runSetupWizardInstall: (opts) => ipcRenderer.invoke('wizard:installOrUpdate', opts),
  onWizardProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('wizard:progress', handler);
    return () => ipcRenderer.removeListener('wizard:progress', handler);
  },

  // Eventos en tiempo real
  onStatus: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('wa:status', handler);
    return () => ipcRenderer.removeListener('wa:status', handler);
  },
  onConnectionState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('wa:connectionState', handler);
    return () => ipcRenderer.removeListener('wa:connectionState', handler);
  },
  onQrUpdate: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('wa:qrUpdate', handler);
    return () => ipcRenderer.removeListener('wa:qrUpdate', handler);
  },
  onOrdersUpdated: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('orders:updated', handler);
    return () => ipcRenderer.removeListener('orders:updated', handler);
  },
});
