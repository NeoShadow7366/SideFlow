import { contextBridge, ipcRenderer, webUtils } from 'electron';

export type PanelEdge = 'left' | 'right';
export type MonitorMode = 'primary' | 'single' | 'all' | 'custom';

export interface MonitorDisplayInfo {
  id: number;
  index: number;
  label: string;
  isPrimary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

export interface MonitorSettings {
  mode: MonitorMode;
  targetDisplayId?: number | null;
  enabledDisplayIds?: number[];
  edgeOverrides?: Record<string, PanelEdge>;
}

export interface DisplayStatePayload {
  displays: MonitorDisplayInfo[];
  activeDisplayId: number;
  effectiveEdge: PanelEdge;
  monitorSettings: MonitorSettings;
}

export interface SideFlowElectronAPI {
  isElectron: boolean;
  launchNativeApp: (
    command: string,
    args?: string[]
  ) => Promise<{ success: boolean; error?: string }>;
  updateGlobalShortcut: (accelerator: string) => Promise<boolean>;
  setPanelVisibility: (visible: boolean) => void;
  setPanelEdge: (edge: PanelEdge) => void;
  setPanelWidthPercent: (widthPercent: number) => void;
  setIgnoreMouseEvents: (ignore: boolean) => void;
  getDisplayState: () => Promise<DisplayStatePayload>;
  setMonitorSettings: (settings: MonitorSettings) => Promise<DisplayStatePayload>;
  activateDisplay: (displayId: number, openPanel?: boolean) => Promise<DisplayStatePayload>;
  setEdgeHandleState: (state: {
    showEdgeHandle: boolean;
    isDictating: boolean;
    shortcutLabel: string;
  }) => void;
  onDisplayStateChanged: (callback: (state: DisplayStatePayload) => void) => () => void;
  clickEdgeTab: (displayId: number) => void;
  prepareEdgeTabClick: () => void;
  setCompanionIgnoreMouse: (displayId: number, ignore: boolean) => void;
  onEdgeTabUpdate: (
    callback: (payload: {
      displayId: number;
      edge: PanelEdge;
      isDictating: boolean;
      shortcutLabel: string;
      displayName?: string;
      isOpenElsewhere?: boolean;
    }) => void
  ) => () => void;
  openFileDialog: () => Promise<string[]>;
  openDirectoryDialog: () => Promise<string | null>;
  readDirectoryItems: (dirPath: string) => Promise<
    Array<{
      name: string;
      path: string;
      isDirectory: boolean;
      iconDataUrl?: string;
    }>
  >;
  extractFileIcon: (filePath: string) => Promise<string | null>;
  resolveShortcutItem: (rawPathOrName: string) => Promise<{
    name: string;
    cmd: string;
    args?: string;
    iconDataUrl: string | null;
  } | null>;
  getSystemMetrics: () => Promise<{
    cpuPercent: number;
    memPercent: number;
    memUsedGb: number;
    memTotalGb: number;
    uptimeHours: number;
  }>;
  getRunningProcesses: () => Promise<string[]>;
  getPathForFile: (file: File) => string;
  onSetPanelVisibility: (callback: (visible: boolean) => void) => () => void;
  onSwitchTab: (callback: (tab: 'drawers' | 'flowchart' | 'notes' | 'settings') => void) => () => void;
  onWindowBlur: (callback: () => void) => () => void;
  storeGetAll: () => Promise<Record<string, unknown>>;
  getInitialStoreSnapshot?: () => Record<string, unknown> | null;
  storeSet: (key: string, value: unknown) => void;
  listStoreBackups?: () => Promise<{
    backups: Array<{
      fileName: string;
      filePath: string;
      createdAt: number;
      sizeBytes: number;
    }>;
    storePath: string;
    backupsDir: string;
  }>;
  createStoreBackupNow?: () => Promise<{
    success: boolean;
    created?: {
      fileName: string;
      filePath: string;
      createdAt: number;
      sizeBytes: number;
    } | null;
    backups: Array<{
      fileName: string;
      filePath: string;
      createdAt: number;
      sizeBytes: number;
    }>;
  }>;
  restoreStoreBackup?: (fileName: string) => Promise<{
    success: boolean;
    store?: Record<string, unknown>;
    error?: string;
  }>;
  openUserDataFolder?: () => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;
  runWorkspaceDiagnostics?: () => Promise<{
    shortcutRegistered: boolean;
    currentAccelerator: string;
    storeHealthy: boolean;
    storeSizeBytes: number;
    storePath: string;
    backupCount: number;
    latestBackupFile?: string;
    recoveredFromBackup?: string;
    strictOffline: boolean;
    sttReady: boolean;
  }>;
  getLocalSttStatus: () => Promise<{
    available: boolean;
    fasterWhisperAvailable: boolean;
    cudaAvailable: boolean;
    gpuName?: string;
    gpuVramMb?: number;
    cpuThreads?: number;
    windowsSapiAvailable: boolean;
    activeModel?: string;
  }>;
  installLocalPythonStt?: () => Promise<{
    success: boolean;
    message?: string;
    error?: string;
    status?: {
      available: boolean;
      fasterWhisperAvailable: boolean;
      cudaAvailable: boolean;
      gpuName?: string;
      gpuVramMb?: number;
      cpuThreads?: number;
      windowsSapiAvailable: boolean;
      activeModel?: string;
    };
  }>;
  warmupLocalStt: (payload?: {
    lang?: string;
    modelSize?: string;
    preferEngine?: string;
  }) => Promise<{
    success: boolean;
    engineUsed?: string;
    durationMs?: number;
    error?: string;
  }>;
  transcribeAudioLocal: (payload: {
    pcm16Base64: string;
    sampleRate: number;
    lang: string;
    modelSize?: string;
    preferEngine?: string;
    promptContext?: string;
    lowLatency?: boolean;
    isPartial?: boolean;
    preTrimmed?: boolean;
    preNormalized?: boolean;
  }) => Promise<{
    success: boolean;
    text?: string;
    engineUsed?: string;
    durationMs?: number;
    error?: string;
  }>;
  getAutoLaunch: () => Promise<{ enabled: boolean; isPackaged: boolean }>;
  setAutoLaunch: (enabled: boolean) => Promise<{ enabled: boolean; isPackaged: boolean }>;
  getUpdateStatus: () => Promise<{
    status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
    currentVersion: string;
    latestVersion?: string;
    releaseNotes?: string;
    releaseUrl?: string;
    downloadPercent?: number;
    error?: string;
    lastCheckedAt?: number;
    canQuitAndInstall?: boolean;
  }>;
  checkForUpdates: () => Promise<{
    status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
    currentVersion: string;
    latestVersion?: string;
    releaseNotes?: string;
    releaseUrl?: string;
    downloadPercent?: number;
    error?: string;
    lastCheckedAt?: number;
    canQuitAndInstall?: boolean;
  }>;
  installUpdateNow: () => Promise<{ success: boolean; error?: string }>;
  onUpdateStatus: (
    callback: (state: {
      status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
      currentVersion: string;
      latestVersion?: string;
      releaseNotes?: string;
      releaseUrl?: string;
      downloadPercent?: number;
      error?: string;
      lastCheckedAt?: number;
      canQuitAndInstall?: boolean;
    }) => void
  ) => () => void;
  addWordToSpellCheckerDictionary?: (word: string) => Promise<boolean>;
  removeWordFromSpellCheckerDictionary?: (word: string) => Promise<boolean>;
  clearSpellCheckerDictionary?: () => Promise<boolean>;
  setSpellCheckerLanguages?: (languages: string[]) => Promise<boolean>;
  replaceMisspelling?: (replacement: string) => Promise<boolean>;
  onnxModelCacheGet?: (url: string) => Promise<{
    bytes: Uint8Array;
    headers: Record<string, string>;
  } | null>;
  onnxModelCachePut?: (payload: {
    url: string;
    bytes: Uint8Array;
    headers?: Record<string, string>;
  }) => Promise<boolean>;
  onSpellCheckContextMenu?: (
    callback: (params: {
      x: number;
      y: number;
      misspelledWord: string;
      dictionarySuggestions: string[];
      selectionText: string;
      isEditable: boolean;
    }) => void
  ) => () => void;
}

let cachedInitialStoreSnapshot: Record<string, unknown> | null | undefined =
  undefined;

const sideflowAPI: SideFlowElectronAPI = {
  isElectron: true,
  launchNativeApp: (command: string, args?: string[]) =>
    ipcRenderer.invoke('launch-native-app', command, args),
  updateGlobalShortcut: (accelerator: string) =>
    ipcRenderer.invoke('update-global-shortcut', accelerator),
  setPanelVisibility: (visible: boolean) => ipcRenderer.send('set-panel-visibility', visible),
  setPanelEdge: (edge: PanelEdge) => ipcRenderer.send('set-panel-edge', edge),
  setPanelWidthPercent: (widthPercent: number) =>
    ipcRenderer.send('set-panel-width-percent', widthPercent),
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  getDisplayState: () => ipcRenderer.invoke('get-display-state'),
  setMonitorSettings: (settings: MonitorSettings) =>
    ipcRenderer.invoke('set-monitor-settings', settings),
  activateDisplay: (displayId: number, openPanel = true) =>
    ipcRenderer.invoke('activate-display', { displayId, openPanel }),
  setEdgeHandleState: (state) => ipcRenderer.send('set-edge-handle-state', state),
  onDisplayStateChanged: (callback: (state: DisplayStatePayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: DisplayStatePayload) =>
      callback(state);
    ipcRenderer.on('display-state-changed', listener);
    return () => ipcRenderer.removeListener('display-state-changed', listener);
  },
  clickEdgeTab: (displayId: number) => ipcRenderer.send('edge-tab-clicked', displayId),
  prepareEdgeTabClick: () => ipcRenderer.send('prepare-edge-tab-click'),
  setCompanionIgnoreMouse: (displayId: number, ignore: boolean) =>
    ipcRenderer.send('set-companion-ignore-mouse', { displayId, ignore }),
  onEdgeTabUpdate: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: Parameters<typeof callback>[0]
    ) => callback(payload);
    ipcRenderer.on('edge-tab-update', listener);
    return () => ipcRenderer.removeListener('edge-tab-update', listener);
  },
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
  readDirectoryItems: (dirPath: string) => ipcRenderer.invoke('read-directory-items', dirPath),
  extractFileIcon: (filePath: string) => ipcRenderer.invoke('extract-file-icon', filePath),
  resolveShortcutItem: (rawPathOrName: string) =>
    ipcRenderer.invoke('resolve-shortcut-item', rawPathOrName),
  getSystemMetrics: () => ipcRenderer.invoke('get-system-metrics'),
  getRunningProcesses: () => ipcRenderer.invoke('get-running-processes'),
  getPathForFile: (file: File) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
      return (file as File & { path?: string }).path || file.name;
    } catch {
      return (file as File & { path?: string }).path || file.name;
    }
  },
  onSetPanelVisibility: (callback: (visible: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible);
    ipcRenderer.on('set-panel-visibility', listener);
    return () => ipcRenderer.removeListener('set-panel-visibility', listener);
  },
  onSwitchTab: (
    callback: (tab: 'drawers' | 'flowchart' | 'notes' | 'settings') => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      tab: 'drawers' | 'flowchart' | 'notes' | 'settings'
    ) => callback(tab);
    ipcRenderer.on('switch-tab', listener);
    return () => ipcRenderer.removeListener('switch-tab', listener);
  },
  onWindowBlur: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('window-blur', listener);
    return () => ipcRenderer.removeListener('window-blur', listener);
  },
  storeGetAll: () => ipcRenderer.invoke('store-get-all'),
  getInitialStoreSnapshot: () => {
    if (cachedInitialStoreSnapshot !== undefined) {
      return cachedInitialStoreSnapshot;
    }
    try {
      const res = ipcRenderer.sendSync('store-get-all-sync');
      cachedInitialStoreSnapshot =
        res && typeof res === 'object' && !Array.isArray(res)
          ? (res as Record<string, unknown>)
          : null;
    } catch {
      cachedInitialStoreSnapshot = null;
    }
    return cachedInitialStoreSnapshot;
  },
  storeSet: (key: string, value: unknown) => ipcRenderer.send('store-set', { key, value }),
  listStoreBackups: () => ipcRenderer.invoke('list-store-backups'),
  createStoreBackupNow: () => ipcRenderer.invoke('create-store-backup-now'),
  restoreStoreBackup: (fileName: string) =>
    ipcRenderer.invoke('restore-store-backup', fileName),
  openUserDataFolder: () => ipcRenderer.invoke('open-user-data-folder'),
  runWorkspaceDiagnostics: () => ipcRenderer.invoke('run-workspace-diagnostics'),
  getLocalSttStatus: () => ipcRenderer.invoke('get-local-stt-status'),
  installLocalPythonStt: () => ipcRenderer.invoke('install-local-python-stt'),
  warmupLocalStt: (payload) => ipcRenderer.invoke('warmup-local-stt', payload),
  transcribeAudioLocal: (payload) => ipcRenderer.invoke('transcribe-audio-local', payload),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('set-auto-launch', enabled),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdateNow: () => ipcRenderer.invoke('install-update-now'),
  onUpdateStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) =>
      callback(state);
    ipcRenderer.on('update-status-changed', listener);
    return () => ipcRenderer.removeListener('update-status-changed', listener);
  },
  addWordToSpellCheckerDictionary: (word: string) =>
    ipcRenderer.invoke('spellcheck-add-word', word),
  removeWordFromSpellCheckerDictionary: (word: string) =>
    ipcRenderer.invoke('spellcheck-remove-word', word),
  clearSpellCheckerDictionary: () =>
    ipcRenderer.invoke('spellcheck-clear-dictionary'),
  setSpellCheckerLanguages: (languages: string[]) =>
    ipcRenderer.invoke('spellcheck-set-languages', languages),
  replaceMisspelling: (replacement: string) =>
    ipcRenderer.invoke('spellcheck-replace-misspelling', replacement),
  onnxModelCacheGet: (url: string) =>
    ipcRenderer.invoke('onnx-model-cache-get', url),
  onnxModelCachePut: (payload) =>
    ipcRenderer.invoke('onnx-model-cache-put', payload),
  onSpellCheckContextMenu: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      params: Parameters<typeof callback>[0]
    ) => callback(params);
    ipcRenderer.on('spellcheck-context-menu', listener);
    return () => ipcRenderer.removeListener('spellcheck-context-menu', listener);
  },
};

const isCompanionEdgeTabWindow =
  typeof window !== 'undefined' &&
  typeof window.location?.pathname === 'string' &&
  /edge-tab\.html$/i.test(window.location.pathname);

if (isCompanionEdgeTabWindow) {
  contextBridge.exposeInMainWorld('sideflow', {
    isElectron: true,
    clickEdgeTab: sideflowAPI.clickEdgeTab,
    prepareEdgeTabClick: sideflowAPI.prepareEdgeTabClick,
    setCompanionIgnoreMouse: sideflowAPI.setCompanionIgnoreMouse,
    onEdgeTabUpdate: sideflowAPI.onEdgeTabUpdate,
  });
} else {
  contextBridge.exposeInMainWorld('sideflow', sideflowAPI);
}
