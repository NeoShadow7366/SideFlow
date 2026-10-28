import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  shell,
  screen,
  dialog,
  nativeImage,
  session,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { execFile, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import * as readline from 'readline';

const GITHUB_OWNER = 'NeoShadow7366';
const GITHUB_REPO = 'SideFlow';
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

type MainMonitorMode = 'primary' | 'single' | 'all' | 'custom';

interface MainMonitorDisplayInfo {
  id: number;
  index: number;
  label: string;
  isPrimary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

interface MainMonitorSettings {
  mode: MainMonitorMode;
  targetDisplayId?: number | null;
  enabledDisplayIds?: number[];
  edgeOverrides?: Record<string, 'left' | 'right'>;
}

interface MainDisplayStatePayload {
  displays: MainMonitorDisplayInfo[];
  activeDisplayId: number;
  effectiveEdge: 'left' | 'right';
  monitorSettings: MainMonitorSettings;
}

const EDGE_TAB_WIN_WIDTH = 40;
const EDGE_TAB_WIN_HEIGHT = 96;

let mainWindow: BrowserWindow | null = null;
const edgeTabWindows = new Map<number, BrowserWindow>();
let tray: Tray | null = null;
let isPanelVisible = true;
let currentAccelerator = 'Alt+Space';
let currentPanelEdge: 'left' | 'right' = 'right';
let currentPanelWidthPercent = 35;
let monitorSettings: MainMonitorSettings = {
  mode: 'primary',
  targetDisplayId: null,
  enabledDisplayIds: [],
  edgeOverrides: {},
};
let activeDisplayId: number | null = null;
let showEdgeHandleState = true;
let isDictatingState = false;
let shortcutLabelState = 'Alt + Space';
let suppressBlurUntil = 0;
let isHoveringCompanionTab = false;
let cachedStore: Record<string, unknown> | null = null;
let storeWriteChain: Promise<void> = Promise.resolve();
let updateCheckInterval: NodeJS.Timeout | null = null;

interface MainUpdateState {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  downloadPercent?: number;
  error?: string;
  lastCheckedAt?: number;
  canQuitAndInstall?: boolean;
}

let updateState: MainUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  releaseUrl: GITHUB_RELEASES_URL,
};

// Persistent Local Speech-to-Text Python Worker & Windows SAPI MemoryStream Daemon state
let sttWorkerProcess: ChildProcessWithoutNullStreams | null = null;
let sttWorkerReady = false;
let sttWorkerInitPromise: Promise<boolean> | null = null;
let sttWorkerFailedAt = 0;
let sttPendingRequests = new Map<string, (resp: Record<string, unknown>) => void>();
let sttStatusCache: {
  available: boolean;
  fasterWhisperAvailable: boolean;
  cudaAvailable: boolean;
  gpuName?: string;
  gpuVramMb?: number;
  cpuThreads?: number;
  windowsSapiAvailable: boolean;
  activeModel?: string;
} | null = null;

let sapiWorkerProcess: ChildProcessWithoutNullStreams | null = null;
let sapiWorkerReady = false;
let sapiWorkerInitPromise: Promise<boolean> | null = null;
let sapiWorkerFailedAt = 0;
let sapiPendingRequests = new Map<string, (resp: Record<string, unknown>) => void>();


const ALLOWED_PROTOCOLS = new Set([
  'https:',
  'http:',
  'vscode:',
  'x-github-client:',
  'spotify:',
  'slack:',
  'figma:',
  'notion:',
  'obsidian:',
  'ms-calculator:',
  'mailto:',
  'app:',
  'shell:',
]);

const FORBIDDEN_STORE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'sideflow-config.json');
}

function readLocalStore(): Record<string, unknown> {
  if (cachedStore) return cachedStore;
  try {
    const storePath = getStorePath();
    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        cachedStore = parsed as Record<string, unknown>;
        return cachedStore;
      }
    }
  } catch (err) {
    console.error('[SideFlow] Failed to read local store:', err);
  }
  cachedStore = {};
  return cachedStore;
}

function writeLocalStore(key: string, value: unknown): void {
  if (!key || FORBIDDEN_STORE_KEYS.has(key)) return;
  try {
    const storePath = getStorePath();
    const current = readLocalStore();
    current[key] = value;
    const serialized = JSON.stringify(current, null, 2);
    storeWriteChain = storeWriteChain
      .then(() => fs.promises.writeFile(storePath, serialized, 'utf-8'))
      .catch((err) => {
        console.error('[SideFlow] Failed to write local store:', err);
      });
  } catch (err) {
    console.error('[SideFlow] Failed to update local store:', err);
  }
}

function getAutoLaunchState(): { enabled: boolean; isPackaged: boolean } {
  const store = readLocalStore();
  if (typeof store.sideflow_open_at_login === 'boolean') {
    return {
      enabled: store.sideflow_open_at_login,
      isPackaged: app.isPackaged,
    };
  }
  if (app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin')) {
    try {
      const settings = app.getLoginItemSettings();
      return {
        enabled: Boolean(settings.openAtLogin),
        isPackaged: true,
      };
    } catch {
      // ignore
    }
  }
  return {
    enabled: true,
    isPackaged: app.isPackaged,
  };
}

function setAutoLaunchState(enabled: boolean): { enabled: boolean; isPackaged: boolean } {
  const nextEnabled = Boolean(enabled);
  writeLocalStore('sideflow_open_at_login', nextEnabled);
  if (app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin')) {
    try {
      app.setLoginItemSettings({
        openAtLogin: nextEnabled,
        path: process.execPath,
      });
    } catch (err) {
      console.error('[SideFlow] Failed to set login item settings:', err);
    }
  }
  updateTrayMenu();
  return {
    enabled: nextEnabled,
    isPackaged: app.isPackaged,
  };
}

function isNewerSemver(currentVer: string, candidateVer: string): boolean {
  const clean = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const curr = clean(currentVer);
  const cand = clean(candidateVer);
  for (let i = 0; i < 3; i++) {
    const a = curr[i] || 0;
    const b = cand[i] || 0;
    if (b > a) return true;
    if (b < a) return false;
  }
  return false;
}

function broadcastUpdateState(patch: Partial<MainUpdateState>): MainUpdateState {
  updateState = {
    ...updateState,
    currentVersion: app.getVersion(),
    ...patch,
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status-changed', updateState);
  }
  updateTrayMenu();
  return updateState;
}

function checkGitHubReleaseFallback(): Promise<MainUpdateState> {
  return new Promise((resolve) => {
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': `SideFlow-Desktop/${app.getVersion()}`,
        Accept: 'application/vnd.github+json',
      },
      timeout: 8000,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 404) {
          // No GitHub release published yet; current build is up to date
          resolve(
            broadcastUpdateState({
              status: 'not-available',
              latestVersion: app.getVersion(),
              lastCheckedAt: Date.now(),
              error: undefined,
            })
          );
          return;
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          resolve(
            broadcastUpdateState({
              status: 'not-available',
              latestVersion: app.getVersion(),
              lastCheckedAt: Date.now(),
              error: undefined,
            })
          );
          return;
        }
        try {
          const parsed = JSON.parse(body) as {
            tag_name?: string;
            html_url?: string;
            body?: string;
            assets?: Array<{ name?: string; browser_download_url?: string }>;
          };
          const rawTag = (parsed.tag_name || '').replace(/^v/i, '').trim();
          const latestVersion = rawTag || app.getVersion();
          const assets = parsed.assets || [];
          const setupAsset =
            assets.find((a) => a.name && /setup.*\.exe$/i.test(a.name)) ||
            assets.find((a) => a.name && a.name.toLowerCase().endsWith('.exe'));
          const releaseUrl =
            setupAsset?.browser_download_url || parsed.html_url || GITHUB_RELEASES_URL;

          if (isNewerSemver(app.getVersion(), latestVersion)) {
            resolve(
              broadcastUpdateState({
                status: 'available',
                latestVersion,
                releaseNotes: typeof parsed.body === 'string' ? parsed.body : undefined,
                releaseUrl,
                lastCheckedAt: Date.now(),
                canQuitAndInstall: false,
                error: undefined,
              })
            );
          } else {
            resolve(
              broadcastUpdateState({
                status: 'not-available',
                latestVersion,
                releaseUrl,
                lastCheckedAt: Date.now(),
                canQuitAndInstall: false,
                error: undefined,
              })
            );
          }
        } catch {
          resolve(
            broadcastUpdateState({
              status: 'not-available',
              latestVersion: app.getVersion(),
              lastCheckedAt: Date.now(),
            })
          );
        }
      });
    });

    req.on('error', () => {
      resolve(
        broadcastUpdateState({
          status: 'not-available',
          latestVersion: app.getVersion(),
          lastCheckedAt: Date.now(),
        })
      );
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(
        broadcastUpdateState({
          status: 'not-available',
          latestVersion: app.getVersion(),
          lastCheckedAt: Date.now(),
        })
      );
    });

    req.end();
  });
}

async function performUpdateCheck(): Promise<MainUpdateState> {
  if (updateState.status === 'checking' || updateState.status === 'downloading') {
    return updateState;
  }

  broadcastUpdateState({
    status: 'checking',
    error: undefined,
  });

  if (app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR) {
    try {
      await autoUpdater.checkForUpdates();
      return updateState;
    } catch {
      return checkGitHubReleaseFallback();
    }
  }

  return checkGitHubReleaseFallback();
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdateState({
      status: 'checking',
      error: undefined,
    });
  });

  autoUpdater.on('update-available', (info) => {
    broadcastUpdateState({
      status: 'downloading',
      latestVersion: info.version,
      releaseNotes:
        typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      downloadPercent: 0,
      lastCheckedAt: Date.now(),
      canQuitAndInstall: false,
      error: undefined,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    broadcastUpdateState({
      status: 'downloading',
      downloadPercent: Math.round(progress.percent || 0),
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcastUpdateState({
      status: 'downloaded',
      latestVersion: info.version,
      downloadPercent: 100,
      lastCheckedAt: Date.now(),
      canQuitAndInstall: true,
      error: undefined,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    broadcastUpdateState({
      status: 'not-available',
      latestVersion: info?.version || app.getVersion(),
      lastCheckedAt: Date.now(),
      canQuitAndInstall: false,
      error: undefined,
    });
  });

  autoUpdater.on('error', () => {
    void checkGitHubReleaseFallback();
  });
}

function createTrayIcon(): Electron.NativeImage {
  const candidates = [
    ...(app.isPackaged && process.resourcesPath
      ? [path.join(process.resourcesPath, 'electron/icon.png')]
      : []),
    path.join(__dirname, '../electron/icon.png'),
    path.join(__dirname, 'icon.png'),
    path.join(process.resourcesPath || '', 'electron/icon.png'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const img = nativeImage.createFromPath(candidate);
      if (!img.isEmpty()) {
        return img.resize({ width: 16, height: 16 });
      }
    }
  }

  // Fallback 16x16 indigo-cyan SideFlow icon data URL (bidirectional arrow between vertical waves)
  const fallbackBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAADKklEQVR4nE2TXWhcRRTH/2dm7tyP3ex3kjbVmq5GUxF8kD4I1eBDYoW+KGolVgXTN/vkUyHSu2rFR19ERbAPog+CIEWDEgQ/QPNgX9pCrVDaIDY1ZLebbHbv7r175x65extwYA7DOTNnzvn9Zwj/G/43N0v/XOnu7+y0CVoj3AtonRoUJypcf9i9/fZT5e29EMH3BTcafOzkqt/aHJwKgkFNe0LEAFgQWCiwsiFsFwN2E7dca1b2Oed/OTflUwNEaZZji6t+85bVEOoOSuMWrv21A+0pGE7AUkFoD312MDtbQivIIyzMoDbRfue3t8Z9ceajy+Wd1vB0L+iYkGFeW3qUp2eKHMbMpGhUQGiY64dsfv3EfRwiNr3+ptnum9NLv3NFrK/3p+JEFJUrZavNYuX7v2n+6TqFhkhol0i7NEgkLcxN0YVf27QVkFSukaGkwsaN7gFlpMWsLJCxMCQDN+8gYYHA2Ki4uRGDoMdIWMIbI0RWDHYk2CEIFyxSwmTZ2I0kHjsyjoX5g/jywr9YOjGL7cgZzVPP1/H5T9t45vEyjjziYBcEciQiACoVaAiFQlXh5Zfux3sf3sCbrzyI5+YnUZ8ugoXE4kINh9cK8L/ewvKLk2j82MfQytRVqU1buCsIYDkg7WZr2wNU6meQawFOti+xCUn2NKCyMiw0O4Qvvmtj+Y1pnP14C1c3BL5a20ViA9c7wLdXd/D+CzV8crGHNlkoO4xIAyJNEwuF3JiLi9cIq2s9LB6v4rOf+yju81Ca9PDpHwFePTqGlesDrDUJXkHAqKxIlUgilhYSKChXohcJCAW4RcJQAqwAZyzzdRNA5gQSzaM2QhskJu4tbkhXdyLyTKVMyfGjHn64NGArL2E0w2hA5yRW1kN+9iGN8XxsBo420qHOzD35WyNyc8ubja3uhG9xE+XaEH82FeximgAjBnAJXWFwuBZjU1joHahif9x598qTxbMEnwU3gLlznUYzkEsBh1WdY2E0E6e0bWTEXeKeEoldcFo1Lz5/6Ym8n95+V7tsnLnM5fWb0dRuP6LIymTKvjNGxAslzQ9U+7c/OFi6s3foP3gzPVo6j3ULAAAAAElFTkSuQmCC';
  return nativeImage.createFromDataURL(`data:image/png;base64,${fallbackBase64}`);
}

function buildTrayMonitorSubmenu(): Electron.MenuItemConstructorOptions[] {
  let displays: MainMonitorDisplayInfo[] = [];
  try {
    displays = getAllMonitorDisplayInfos();
  } catch {
    displays = [];
  }

  const items: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Primary Monitor Only',
      type: 'radio',
      checked: monitorSettings.mode === 'primary',
      click: () => {
        applyMonitorSettingsFromMain({
          ...monitorSettings,
          mode: 'primary',
        });
      },
    },
    {
      label: 'All Monitors (Open at Mouse Cursor)',
      type: 'radio',
      checked: monitorSettings.mode === 'all',
      click: () => {
        applyMonitorSettingsFromMain({
          ...monitorSettings,
          mode: 'all',
        });
      },
    },
  ];

  if (displays.length > 0) {
    items.push({ type: 'separator' });
    for (const d of displays) {
      const resLabel = `${d.bounds.width}×${d.bounds.height}`;
      const primarySuffix = d.isPrimary ? ' [Primary]' : '';
      items.push({
        label: `Monitor ${d.index}: ${d.label} (${resLabel})${primarySuffix}`,
        type: 'radio',
        checked:
          monitorSettings.mode === 'single' &&
          monitorSettings.targetDisplayId === d.id,
        click: () => {
          applyMonitorSettingsFromMain({
            ...monitorSettings,
            mode: 'single',
            targetDisplayId: d.id,
          });
        },
      });
    }
  }

  if (monitorSettings.mode === 'custom') {
    items.push({ type: 'separator' });
    items.push({
      label: `Custom Multi-Monitor Subset (${
        getEnabledMonitorDisplays(displays).length
      } active)`,
      type: 'radio',
      checked: true,
      click: () => navigateToTabFromMain('settings'),
    });
  }

  return items;
}

function updateTrayMenu(): void {
  if (!tray) return;

  const autoLaunch = getAutoLaunchState();
  const updateLabel =
    updateState.status === 'downloaded'
      ? `Restart to Apply Update (v${updateState.latestVersion || ''})`
      : updateState.status === 'downloading'
      ? `Downloading Update (${updateState.downloadPercent ?? 0}%)...`
      : updateState.status === 'available'
      ? `Download Update (v${updateState.latestVersion || ''})`
      : 'Check for Updates...';

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Toggle SideFlow Panel (${currentAccelerator})`,
      click: () => togglePanelFromMain(),
    },
    { type: 'separator' },
    {
      label: 'Open App Drawers (Dock)',
      click: () => navigateToTabFromMain('drawers'),
    },
    {
      label: 'Quick Flowchart',
      click: () => navigateToTabFromMain('flowchart'),
    },
    {
      label: 'Voice Dictation Notes',
      click: () => navigateToTabFromMain('notes'),
    },
    {
      label: 'Configure Hotkey & Settings',
      click: () => navigateToTabFromMain('settings'),
    },
    {
      label: 'Monitor Display',
      submenu: buildTrayMonitorSubmenu(),
    },
    { type: 'separator' },
    {
      label: 'Start SideFlow at Login',
      type: 'checkbox',
      checked: autoLaunch.enabled,
      click: (menuItem) => {
        setAutoLaunchState(menuItem.checked);
      },
    },
    {
      label: updateLabel,
      click: () => {
        if (updateState.status === 'downloaded' && updateState.canQuitAndInstall) {
          setImmediate(() => autoUpdater.quitAndInstall(false, true));
          return;
        }
        if (updateState.status === 'available' && updateState.releaseUrl) {
          void shell.openExternal(updateState.releaseUrl);
          return;
        }
        navigateToTabFromMain('settings');
        void performUpdateCheck();
      },
    },
    { type: 'separator' },
    {
      label: `Quit SideFlow (v${app.getVersion()})`,
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip(`SideFlow v${app.getVersion()} (${currentAccelerator})`);
  tray.setContextMenu(contextMenu);
}

function openPanelOnDisplay(
  targetDisplayId: number,
  switchToTab?: 'drawers' | 'flowchart' | 'notes' | 'settings'
): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isHoveringCompanionTab = false;
  suppressBlurUntil = Date.now() + 500;

  const allDisplays = getAllMonitorDisplayInfos();
  const enabledDisplays = getEnabledMonitorDisplays(allDisplays);
  const targetDisplay =
    enabledDisplays.find((d) => d.id === targetDisplayId) ??
    ensureValidActiveDisplay(allDisplays);

  activeDisplayId = targetDisplay.id;
  const effectiveEdge = getEffectiveEdgeForDisplay(targetDisplay.id);
  const nextBounds = computePanelBoundsForDisplay(
    targetDisplay,
    effectiveEdge,
    currentPanelWidthPercent
  );
  setWindowBoundsCrossDpiSafe(mainWindow, nextBounds);

  isPanelVisible = true;
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.show();
  mainWindow.focus();

  broadcastDisplayState();
  mainWindow.webContents.send('set-panel-visibility', true);
  if (switchToTab) {
    mainWindow.webContents.send('switch-tab', switchToTab);
  }
  syncEdgeTabWindows();
}

function closePanelFromMain(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isPanelVisible = false;
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.webContents.send('set-panel-visibility', false);
  syncEdgeTabWindows();
}

function resolveCursorOrConfiguredDisplay(
  allDisplays: MainMonitorDisplayInfo[]
): MainMonitorDisplayInfo | undefined {
  const enabled = getEnabledMonitorDisplays(allDisplays);
  if (enabled.length === 0) return undefined;

  if (monitorSettings.mode === 'primary' || monitorSettings.mode === 'single') {
    return enabled[0];
  }

  try {
    const cursorPt = screen.getCursorScreenPoint();
    const cursorDisp = screen.getDisplayNearestPoint(cursorPt);
    const cursorMatch = enabled.find((d) => d.id === cursorDisp.id);
    if (cursorMatch) {
      return cursorMatch;
    }
  } catch {
    // fallback below
  }
  return undefined;
}

function togglePanelFromMain(forceState?: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const allDisplays = getAllMonitorDisplayInfos();
  const enabled = getEnabledMonitorDisplays(allDisplays);
  const currentActive = ensureValidActiveDisplay(allDisplays);

  if (typeof forceState === 'boolean') {
    if (!forceState) {
      closePanelFromMain();
      return;
    }
    const preferred =
      resolveCursorOrConfiguredDisplay(allDisplays) ?? currentActive;
    openPanelOnDisplay(preferred.id);
    return;
  }

  // Single-screen modes ('primary' | 'single')
  if (monitorSettings.mode === 'primary' || monitorSettings.mode === 'single') {
    const target = enabled[0] ?? currentActive;
    if (!isPanelVisible || activeDisplayId !== target.id) {
      openPanelOnDisplay(target.id);
    } else {
      closePanelFromMain();
    }
    return;
  }

  // Multi-monitor modes ('all' | 'custom'): check cursor display
  const cursorMatch = resolveCursorOrConfiguredDisplay(allDisplays);
  if (cursorMatch) {
    if (!isPanelVisible) {
      openPanelOnDisplay(cursorMatch.id);
    } else if (activeDisplayId !== cursorMatch.id) {
      // Immediately move open panel onto the monitor where the mouse is
      openPanelOnDisplay(cursorMatch.id);
    } else {
      closePanelFromMain();
    }
    return;
  }

  // Cursor is on an excluded monitor in 'custom' mode
  if (isPanelVisible) {
    closePanelFromMain();
  } else {
    const fallback =
      enabled.find((d) => d.id === activeDisplayId) ??
      enabled[0] ??
      currentActive;
    openPanelOnDisplay(fallback.id);
  }
}

function navigateToTabFromMain(tab: 'drawers' | 'flowchart' | 'notes' | 'settings'): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const allDisplays = getAllMonitorDisplayInfos();
  const currentActive = ensureValidActiveDisplay(allDisplays);
  const preferred =
    resolveCursorOrConfiguredDisplay(allDisplays) ?? currentActive;
  openPanelOnDisplay(preferred.id, tab);
}

function registerGlobalHotkey(accelerator: string): boolean {
  if (typeof accelerator !== 'string') return false;
  const normalized = accelerator.replace(/\s+/g, '');
  if (
    !/^(?:(?:CommandOrControl|Ctrl|Alt|Shift|Super)\+)+(?:[A-Za-z0-9]|Space|Tab|Enter|Backspace|Delete|Up|Down|Left|Right|F[1-9]|F1[0-2]|Plus|Minus)$/i.test(
      normalized
    )
  ) {
    return false;
  }

  const previousAccelerator = currentAccelerator;
  try {
    globalShortcut.unregisterAll();
    const registered = globalShortcut.register(normalized, () => {
      togglePanelFromMain();
    });
    if (registered) {
      currentAccelerator = normalized;
      updateTrayMenu();
      return true;
    }
    // Restore previous accelerator if registration failed
    if (previousAccelerator) {
      globalShortcut.register(previousAccelerator, () => {
        togglePanelFromMain();
      });
    }
  } catch (err) {
    console.error('[SideFlow] Failed to register global shortcut:', accelerator, err);
    if (previousAccelerator) {
      try {
        globalShortcut.register(previousAccelerator, () => {
          togglePanelFromMain();
        });
      } catch {
        // ignore
      }
    }
  }
  return false;
}

function launchNativeCommand(
  command: string,
  args?: string[]
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const trimmed = (command || '').trim().replace(/^["']|["']$/g, '').trim();
    if (!trimmed) {
      resolve({ success: false, error: 'Empty command' });
      return;
    }

    const safeArgs = Array.isArray(args)
      ? args.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      : [];

    // Check if URL or custom URI protocol (e.g. vscode://, spotify://, mailto:, ms-calculator:)
    // Excludes single-letter Windows drive paths like C:\...
    const isUriOrUrl = /^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(trimmed);
    if (isUriOrUrl) {
      try {
        const parsed = new URL(trimmed);
        if (!ALLOWED_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
          resolve({
            success: false,
            error: `Blocked disallowed URI protocol: ${parsed.protocol}`,
          });
          return;
        }
      } catch {
        resolve({ success: false, error: 'Invalid URI format' });
        return;
      }

      if (trimmed.toLowerCase().startsWith('app:')) {
        resolve({ success: true });
        return;
      }

      if (trimmed.toLowerCase().startsWith('shell:')) {
        if (process.platform === 'win32') {
          try {
            const child = execFile('explorer.exe', [trimmed]);
            child.on('spawn', () => {
              child.unref();
              resolve({ success: true });
            });
            child.on('error', (err) =>
              resolve({ success: false, error: err.message })
            );
          } catch (err) {
            resolve({
              success: false,
              error: err instanceof Error ? err.message : 'Failed to open shell folder',
            });
          }
          return;
        }
        resolve({ success: true });
        return;
      }

      shell
        .openExternal(trimmed)
        .then(() => resolve({ success: true }))
        .catch((err: Error) => resolve({ success: false, error: err.message }));
      return;
    }

    // Local file path, executable, shortcut, script, or bare system binary
    const hasPathSeparator = /[\\/]/.test(trimmed);
    const resolvedPath = hasPathSeparator ? path.resolve(trimmed) : trimmed;

    const fallbackExec = () => {
      let settled = false;
      const done = (result: { success: boolean; error?: string }) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      try {
        const child = execFile(
          resolvedPath,
          safeArgs,
          { shell: false, windowsVerbatimArguments: false },
          (execErr) => {
            if (execErr) {
              done({ success: false, error: execErr.message });
            } else {
              done({ success: true });
            }
          }
        );
        child.on('spawn', () => {
          child.unref();
          done({ success: true });
        });
      } catch (err) {
        done({
          success: false,
          error: err instanceof Error ? err.message : 'Failed to launch executable',
        });
      }
    };

    if (safeArgs.length > 0) {
      fallbackExec();
      return;
    }

    shell
      .openPath(resolvedPath)
      .then((errMessage) => {
        if (!errMessage) {
          resolve({ success: true });
        } else {
          fallbackExec();
        }
      })
      .catch(() => {
        fallbackExec();
      });
  });
}

function getSttWorkerScriptPath(): string | null {
  const candidates = [
    ...(app.isPackaged && process.resourcesPath
      ? [path.join(process.resourcesPath, 'electron/stt_worker.py')]
      : []),
    path.join(__dirname, '../electron/stt_worker.py'),
    path.join(__dirname, 'stt_worker.py'),
    path.join(process.resourcesPath || '', 'electron/stt_worker.py'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function ensureSttWorker(): Promise<boolean> {
  if (sttWorkerProcess && sttWorkerReady) {
    return Promise.resolve(true);
  }
  if (sttWorkerInitPromise) {
    return sttWorkerInitPromise;
  }
  // Avoid re-spawning missing python on every audio chunk on standard work laptops (retry at most once per 60s)
  if (sttWorkerFailedAt > 0 && Date.now() - sttWorkerFailedAt < 60000) {
    return Promise.resolve(false);
  }

  const scriptPath = getSttWorkerScriptPath();
  if (!scriptPath) {
    sttWorkerFailedAt = Date.now();
    return Promise.resolve(false);
  }

  sttWorkerInitPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    let initTimer: NodeJS.Timeout | null = null;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        if (initTimer) {
          clearTimeout(initTimer);
          initTimer = null;
        }
        sttWorkerInitPromise = null;
        if (!ok) {
          sttWorkerFailedAt = Date.now();
        } else {
          sttWorkerFailedAt = 0;
        }
        resolve(ok);
      }
    };

    try {
      const proc = spawn('python', ['-u', scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      sttWorkerProcess = proc;
      // Drain stderr continuously so Windows pipe buffers never block tqdm / CTranslate2 logs
      proc.stderr.resume();

      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        try {
          const parsed = JSON.parse(line.replace(/^\uFEFF/, '')) as Record<string, unknown>;
          if (parsed.id === 'init') {
            const hasFasterWhisper = Boolean(parsed.fasterWhisperAvailable);
            if (sttWorkerProcess === proc) {
              sttWorkerReady = hasFasterWhisper;
            }
            sttStatusCache = {
              available: hasFasterWhisper || process.platform === 'win32',
              fasterWhisperAvailable: hasFasterWhisper,
              cudaAvailable: Boolean(parsed.cudaAvailable),
              gpuName: typeof parsed.gpuName === 'string' ? parsed.gpuName : undefined,
              gpuVramMb: typeof parsed.gpuVramMb === 'number' ? parsed.gpuVramMb : undefined,
              cpuThreads: typeof parsed.cpuThreads === 'number' ? parsed.cpuThreads : undefined,
              windowsSapiAvailable: process.platform === 'win32',
              activeModel: Boolean(parsed.cudaAvailable) ? 'distil-small.en' : 'base.en',
            };
            // If Python started but faster-whisper isn't installed, shut down idle python process immediately
            if (!hasFasterWhisper) {
              if (sttWorkerProcess === proc) {
                sttWorkerReady = false;
                sttWorkerProcess = null;
              }
              try {
                rl.close();
                proc.kill();
              } catch {
                // ignore
              }
            }
            finish(hasFasterWhisper);
            return;
          }
          const reqId = String(parsed.id || '');
          const cb = sttPendingRequests.get(reqId);
          if (cb) {
            sttPendingRequests.delete(reqId);
            cb(parsed);
          }
        } catch {
          // ignore non-json stdout lines
        }
      });

      proc.on('error', () => {
        try {
          rl.close();
        } catch {
          // ignore
        }
        if (sttWorkerProcess === proc) {
          sttWorkerReady = false;
          sttWorkerProcess = null;
        }
        if (!sttStatusCache) {
          sttStatusCache = {
            available: process.platform === 'win32',
            fasterWhisperAvailable: false,
            cudaAvailable: false,
            windowsSapiAvailable: process.platform === 'win32',
          };
        }
        finish(false);
      });

      proc.on('exit', () => {
        try {
          rl.close();
        } catch {
          // ignore
        }
        if (sttWorkerProcess === proc) {
          sttWorkerReady = false;
          sttWorkerProcess = null;
          for (const [, cb] of sttPendingRequests) {
            cb({ success: false, error: 'STT worker exited' });
          }
          sttPendingRequests.clear();
        }
        finish(false);
      });

      initTimer = setTimeout(() => {
        if (!settled) {
          if (sttWorkerProcess === proc) {
            sttWorkerReady = false;
            sttWorkerProcess = null;
          }
          try {
            rl.close();
            proc.kill();
          } catch {
            // ignore
          }
          finish(false);
        }
      }, 8000);
    } catch {
      finish(false);
    }
  });

  return sttWorkerInitPromise;
}

function sendSttWorkerCommand(
  payload: Record<string, unknown>,
  timeoutMs = 30000
): Promise<Record<string, unknown>> {
  return new Promise(async (resolve) => {
    const ok = await ensureSttWorker();
    const proc = sttWorkerProcess;
    if (!ok || !proc) {
      resolve({ success: false, error: 'Python faster-whisper worker unavailable' });
      return;
    }

    const reqId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timer = setTimeout(() => {
      sttPendingRequests.delete(reqId);
      if (sttWorkerProcess === proc) {
        sttWorkerReady = false;
        sttWorkerProcess = null;
        try {
          proc.kill();
        } catch {
          // ignore
        }
      }
      resolve({ success: false, error: 'STT worker timed out' });
    }, timeoutMs);

    sttPendingRequests.set(reqId, (resp) => {
      clearTimeout(timer);
      resolve(resp);
    });

    try {
      proc.stdin.write(JSON.stringify({ ...payload, id: reqId }) + '\n');
    } catch (err) {
      clearTimeout(timer);
      sttPendingRequests.delete(reqId);
      resolve({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write to STT worker',
      });
    }
  });
}

const SAPI_DAEMON_PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$engines = @{}

function Get-SapiEngine([string]$langCode) {
  $safeLang = if ($langCode) { ($langCode -replace '[^a-zA-Z-]', '') } else { 'en-US' }
  if (-not $safeLang) { $safeLang = 'en-US' }
  if ($engines.ContainsKey($safeLang)) {
    return $engines[$safeLang]
  }
  $rec = $null
  try {
    $culture = New-Object System.Globalization.CultureInfo($safeLang)
    $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
  } catch {
    $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  }
  $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $engines[$safeLang] = $rec
  return $rec
}

[Console]::Out.WriteLine('{"id":"init","ready":true}')
[Console]::Out.Flush()

while ($null -ne ($line = [Console]::In.ReadLine())) {
  $trimmed = $line.Trim()
  if (-not $trimmed) { continue }
  $reqId = ''
  try {
    $req = $trimmed | ConvertFrom-Json
    $reqId = [string]$req.id
    $cmd = [string]$req.cmd
    $lang = if ($req.lang) { [string]$req.lang } else { 'en-US' }
    if ($cmd -eq 'warmup') {
      $null = Get-SapiEngine $lang
      $out = @{ id = $reqId; success = $true; engineUsed = 'Windows Offline Speech (SAPI)' } | ConvertTo-Json -Compress
      [Console]::Out.WriteLine($out)
      [Console]::Out.Flush()
      continue
    }
    $b64 = [string]$req.pcm16Base64
    $sr = if ($req.sampleRate) { [int]$req.sampleRate } else { 16000 }
    $bytes = [Convert]::FromBase64String($b64)
    if ($bytes.Length -lt 1600) {
      $out = @{ id = $reqId; success = $true; text = ''; engineUsed = 'Windows Offline Speech (SAPI)' } | ConvertTo-Json -Compress
      [Console]::Out.WriteLine($out)
      [Console]::Out.Flush()
      continue
    }
    $rec = Get-SapiEngine $lang
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    $sb = New-Object System.Text.StringBuilder
    try {
      $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo($sr, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
      $rec.SetInputToAudioStream($ms, $fmt)
      while ($true) {
        $r = $rec.Recognize()
        if ($null -eq $r) { break }
        if ($r.Text) { [void]$sb.Append($r.Text + ' ') }
      }
    } finally {
      try { $rec.SetInputToNull() } catch {}
      $ms.Dispose()
    }
    $out = @{ id = $reqId; success = $true; text = $sb.ToString().Trim(); engineUsed = 'Windows Offline Speech (SAPI)' } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($out)
    [Console]::Out.Flush()
  } catch {
    $errResp = @{ id = $reqId; success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($errResp)
    [Console]::Out.Flush()
  }
}
`;

function ensureSapiWorker(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  if (sapiWorkerProcess && sapiWorkerReady) return Promise.resolve(true);
  if (sapiWorkerInitPromise) return sapiWorkerInitPromise;
  if (sapiWorkerFailedAt > 0 && Date.now() - sapiWorkerFailedAt < 30000) {
    return Promise.resolve(false);
  }

  sapiWorkerInitPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    let initTimer: NodeJS.Timeout | null = null;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        if (initTimer) {
          clearTimeout(initTimer);
          initTimer = null;
        }
        sapiWorkerInitPromise = null;
        sapiWorkerFailedAt = ok ? 0 : Date.now();
        resolve(ok);
      }
    };

    try {
      const encodedCmd = Buffer.from(SAPI_DAEMON_PS_SCRIPT, 'utf16le').toString('base64');
      const proc = spawn(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-EncodedCommand',
          encodedCmd,
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        }
      );
      sapiWorkerProcess = proc;
      // Drain stderr continuously so PowerShell CLIXML / progress messages never block pipe buffer
      proc.stderr.resume();

      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        try {
          const parsed = JSON.parse(line.replace(/^\uFEFF/, '')) as Record<string, unknown>;
          if (parsed.id === 'init') {
            if (sapiWorkerProcess === proc) {
              sapiWorkerReady = true;
            }
            finish(true);
            return;
          }
          const reqId = String(parsed.id || '');
          const cb = sapiPendingRequests.get(reqId);
          if (cb) {
            sapiPendingRequests.delete(reqId);
            cb(parsed);
          }
        } catch {
          // ignore non-json stdout lines
        }
      });

      proc.on('error', () => {
        try {
          rl.close();
        } catch {
          // ignore
        }
        if (sapiWorkerProcess === proc) {
          sapiWorkerReady = false;
          sapiWorkerProcess = null;
        }
        finish(false);
      });

      proc.on('exit', () => {
        try {
          rl.close();
        } catch {
          // ignore
        }
        if (sapiWorkerProcess === proc) {
          sapiWorkerReady = false;
          sapiWorkerProcess = null;
          for (const [, cb] of sapiPendingRequests) {
            cb({ success: false, error: 'SAPI worker exited' });
          }
          sapiPendingRequests.clear();
        }
        finish(false);
      });

      initTimer = setTimeout(() => {
        if (!settled) {
          if (sapiWorkerProcess === proc) {
            sapiWorkerReady = false;
            sapiWorkerProcess = null;
          }
          try {
            rl.close();
            proc.kill();
          } catch {
            // ignore
          }
          finish(false);
        }
      }, 15000);
    } catch {
      finish(false);
    }
  });

  return sapiWorkerInitPromise;
}

function sendSapiWorkerCommand(
  payload: Record<string, unknown>,
  timeoutMs = 15000
): Promise<Record<string, unknown>> {
  return new Promise(async (resolve) => {
    const ok = await ensureSapiWorker();
    const proc = sapiWorkerProcess;
    if (!ok || !proc) {
      resolve({ success: false, error: 'Persistent Windows SAPI worker unavailable' });
      return;
    }

    const reqId = `sapi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timer = setTimeout(() => {
      sapiPendingRequests.delete(reqId);
      if (sapiWorkerProcess === proc) {
        sapiWorkerReady = false;
        sapiWorkerProcess = null;
        try {
          proc.kill();
        } catch {
          // ignore
        }
      }
      resolve({ success: false, error: 'Windows SAPI worker timed out' });
    }, timeoutMs);

    sapiPendingRequests.set(reqId, (resp) => {
      clearTimeout(timer);
      resolve(resp);
    });

    try {
      proc.stdin.write(JSON.stringify({ ...payload, id: reqId }) + '\n');
    } catch (err) {
      clearTimeout(timer);
      sapiPendingRequests.delete(reqId);
      resolve({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write to SAPI worker',
      });
    }
  });
}

async function transcribeWithWindowsSapi(
  pcm16Base64: string,
  sampleRate = 16000,
  lang = 'en-US'
): Promise<{
  success: boolean;
  text?: string;
  engineUsed?: string;
  durationMs?: number;
  error?: string;
}> {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Windows SAPI is only supported on Windows' };
  }

  const t0 = Date.now();
  const rawPcm = Buffer.from(pcm16Base64, 'base64');
  if (rawPcm.length < 1600) {
    return {
      success: true,
      text: '',
      engineUsed: 'Windows Offline Speech (SAPI)',
      durationMs: 0,
    };
  }

  // Zero-disk persistent MemoryStream SAPI recognition (~65-140ms vs 2500ms cold spawn)
  const daemonResp = await sendSapiWorkerCommand({
    cmd: 'transcribe',
    pcm16Base64,
    sampleRate,
    lang,
  });

  if (daemonResp.success) {
    return {
      success: true,
      text: typeof daemonResp.text === 'string' ? daemonResp.text : '',
      engineUsed: 'Windows Offline Speech (SAPI)',
      durationMs: Date.now() - t0,
    };
  }

  return {
    success: false,
    error:
      typeof daemonResp.error === 'string'
        ? daemonResp.error
        : 'Windows SAPI recognition failed',
  };
}

function clampPanelWidthPercent(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) {
    return 35;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 35;
  return Math.max(15, Math.min(90, Math.round(num)));
}

const VALID_MONITOR_MODES = new Set<MainMonitorMode>([
  'primary',
  'single',
  'all',
  'custom',
]);

function sanitizeMainMonitorSettings(raw: unknown): MainMonitorSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      mode: 'primary',
      targetDisplayId: null,
      enabledDisplayIds: [],
      edgeOverrides: {},
    };
  }
  const obj = raw as Record<string, unknown>;
  const mode: MainMonitorMode = VALID_MONITOR_MODES.has(
    obj.mode as MainMonitorMode
  )
    ? (obj.mode as MainMonitorMode)
    : 'primary';

  const targetDisplayId =
    typeof obj.targetDisplayId === 'number' &&
    Number.isFinite(obj.targetDisplayId)
      ? obj.targetDisplayId
      : null;

  const enabledDisplayIds = Array.isArray(obj.enabledDisplayIds)
    ? Array.from(
        new Set(
          obj.enabledDisplayIds.filter(
            (id): id is number => typeof id === 'number' && Number.isFinite(id)
          )
        )
      )
    : [];

  const edgeOverrides: Record<string, 'left' | 'right'> = {};
  if (
    obj.edgeOverrides &&
    typeof obj.edgeOverrides === 'object' &&
    !Array.isArray(obj.edgeOverrides)
  ) {
    let count = 0;
    for (const [key, val] of Object.entries(
      obj.edgeOverrides as Record<string, unknown>
    )) {
      if (count >= 32) break;
      if (
        !FORBIDDEN_STORE_KEYS.has(key) &&
        /^-?\d+$/.test(key) &&
        (val === 'left' || val === 'right')
      ) {
        edgeOverrides[key] = val;
        count++;
      }
    }
  }

  return {
    mode,
    targetDisplayId,
    enabledDisplayIds,
    edgeOverrides,
  };
}

function getAllMonitorDisplayInfos(): MainMonitorDisplayInfo[] {
  let rawDisplays: Electron.Display[] = [];
  let primaryId: number | null = null;
  try {
    rawDisplays = screen.getAllDisplays();
    primaryId = screen.getPrimaryDisplay()?.id ?? null;
  } catch {
    rawDisplays = [];
  }

  // Safe synthetic fallback during transient zero-display OS transitions (DisplayPort sleep / KVM / RDP)
  if (!Array.isArray(rawDisplays) || rawDisplays.length === 0) {
    return [
      {
        id: activeDisplayId ?? 1,
        index: 1,
        label: 'Primary Display',
        isPrimary: true,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        scaleFactor: 1,
      },
    ];
  }

  const sorted = [...rawDisplays].sort(
    (a, b) =>
      a.bounds.x - b.bounds.x ||
      a.bounds.y - b.bounds.y ||
      a.id - b.id
  );
  return sorted.map((d, idx) => ({
    id: d.id,
    index: idx + 1,
    label: (d.label && d.label.trim()) || `Display ${idx + 1}`,
    isPrimary: primaryId != null ? d.id === primaryId : idx === 0,
    bounds: { ...d.bounds },
    workArea: { ...d.workArea },
    scaleFactor: d.scaleFactor || 1,
  }));
}

function getEnabledMonitorDisplays(
  allDisplays = getAllMonitorDisplayInfos()
): MainMonitorDisplayInfo[] {
  if (allDisplays.length === 0) return [];
  const primary = allDisplays.find((d) => d.isPrimary) ?? allDisplays[0];
  switch (monitorSettings.mode) {
    case 'primary':
      return [primary];
    case 'single': {
      const target =
        monitorSettings.targetDisplayId != null
          ? allDisplays.find((d) => d.id === monitorSettings.targetDisplayId)
          : undefined;
      return [target ?? primary];
    }
    case 'all':
      return [...allDisplays];
    case 'custom': {
      const enabledSet = new Set(monitorSettings.enabledDisplayIds ?? []);
      const matched = allDisplays.filter((d) => enabledSet.has(d.id));
      return matched.length > 0 ? matched : [primary];
    }
    default:
      return [primary];
  }
}

function getEffectiveEdgeForDisplay(
  displayId: number | null | undefined
): 'left' | 'right' {
  if (displayId != null && monitorSettings.edgeOverrides) {
    const override = monitorSettings.edgeOverrides[String(displayId)];
    if (override === 'left' || override === 'right') {
      return override;
    }
  }
  return currentPanelEdge === 'left' ? 'left' : 'right';
}

function ensureValidActiveDisplay(
  allDisplays = getAllMonitorDisplayInfos()
): MainMonitorDisplayInfo {
  const enabled = getEnabledMonitorDisplays(allDisplays);
  const primary = allDisplays.find((d) => d.isPrimary) ?? allDisplays[0];
  if (activeDisplayId != null) {
    const existing = enabled.find((d) => d.id === activeDisplayId);
    if (existing) return existing;
  }

  if (monitorSettings.mode === 'all' || monitorSettings.mode === 'custom') {
    try {
      const cursorPt = screen.getCursorScreenPoint();
      const cursorDisp = screen.getDisplayNearestPoint(cursorPt);
      const cursorMatch = enabled.find((d) => d.id === cursorDisp.id);
      if (cursorMatch) {
        activeDisplayId = cursorMatch.id;
        return cursorMatch;
      }
    } catch {
      // ignore
    }
  }

  const next = enabled[0] ?? primary;
  activeDisplayId = next.id;
  return next;
}

function computePanelBoundsForDisplay(
  display: MainMonitorDisplayInfo,
  edge: 'left' | 'right',
  widthPercent: number
): { x: number; y: number; width: number; height: number } {
  const { x: workAreaX, y: workAreaY, width, height } = display.workArea;
  const clampedPct = clampPanelWidthPercent(widthPercent);
  const panelWidth = Math.max(
    320,
    Math.min(width, Math.round((width * clampedPct) / 100))
  );
  const nextX = edge === 'left' ? workAreaX : workAreaX + width - panelWidth;
  return {
    x: nextX,
    y: workAreaY,
    width: panelWidth,
    height,
  };
}

function setWindowBoundsCrossDpiSafe(
  win: BrowserWindow,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  if (win.isDestroyed()) return;
  try {
    win.setResizable(true);
    win.setBounds(bounds);
    win.setBounds(bounds);
    win.setResizable(false);
  } catch {
    try {
      win.setBounds(bounds);
    } catch {
      // ignore
    }
  }
}

function setEdgeTabBoundsSafe(
  win: BrowserWindow,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  if (win.isDestroyed()) return;
  try {
    // Keep resizable: false on tiny 40px companion windows to avoid Win32 WS_THICKFRAME (SM_CXMINTRACK ~136px) width clamping
    win.setMinimumSize(bounds.width, bounds.height);
    win.setBounds(bounds);
    win.setBounds(bounds);
  } catch {
    // ignore
  }
}

function getDisplayStatePayload(): MainDisplayStatePayload {
  const allDisplays = getAllMonitorDisplayInfos();
  const activeDisplay = ensureValidActiveDisplay(allDisplays);
  return {
    displays: allDisplays,
    activeDisplayId: activeDisplay.id,
    effectiveEdge: getEffectiveEdgeForDisplay(activeDisplay.id),
    monitorSettings,
  };
}

function broadcastDisplayState(): MainDisplayStatePayload {
  const payload = getDisplayStatePayload();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('display-state-changed', payload);
  }
  return payload;
}

function getEdgeTabHtmlPath(): string | null {
  const candidates = [
    ...(app.isPackaged && process.resourcesPath
      ? [path.join(process.resourcesPath, 'electron/edge-tab.html')]
      : []),
    path.join(__dirname, '../electron/edge-tab.html'),
    path.join(__dirname, 'edge-tab.html'),
    path.join(process.resourcesPath || '', 'electron/edge-tab.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function computeEdgeTabBounds(
  display: MainMonitorDisplayInfo,
  edge: 'left' | 'right'
): { x: number; y: number; width: number; height: number } {
  const { x: workX, y: workY, width: workW, height: workH } = display.workArea;
  const x = edge === 'left' ? workX : workX + workW - EDGE_TAB_WIN_WIDTH;
  const y = Math.round(workY + (workH - EDGE_TAB_WIN_HEIGHT) / 2);
  return {
    x,
    y,
    width: EDGE_TAB_WIN_WIDTH,
    height: EDGE_TAB_WIN_HEIGHT,
  };
}

function destroyAllEdgeTabWindows(): void {
  isHoveringCompanionTab = false;
  for (const [, win] of edgeTabWindows) {
    try {
      if (!win.isDestroyed()) {
        win.destroy();
      }
    } catch {
      // ignore
    }
  }
  edgeTabWindows.clear();
}

function createEdgeTabWindow(
  display: MainMonitorDisplayInfo,
  edge: 'left' | 'right',
  bounds: { x: number; y: number; width: number; height: number }
): BrowserWindow | null {
  const htmlPath = getEdgeTabHtmlPath();
  if (!htmlPath) return null;

  const tabWin = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: EDGE_TAB_WIN_WIDTH,
    minHeight: EDGE_TAB_WIN_HEIGHT,
    maxWidth: EDGE_TAB_WIN_WIDTH,
    maxHeight: EDGE_TAB_WIN_HEIGHT,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  setEdgeTabBoundsSafe(tabWin, bounds);
  tabWin.setIgnoreMouseEvents(true, { forward: true });

  tabWin.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  tabWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  tabWin.webContents.on('did-finish-load', () => {
    if (tabWin.isDestroyed()) return;
    syncEdgeTabWindows();
  });

  tabWin.on('closed', () => {
    if (edgeTabWindows.get(display.id) === tabWin) {
      edgeTabWindows.delete(display.id);
    }
  });

  void tabWin
    .loadFile(htmlPath, {
      query: {
        displayId: String(display.id),
        edge,
        dictating: isDictatingState ? '1' : '0',
        shortcut: shortcutLabelState,
        displayName: `Monitor ${display.index}`,
        openElsewhere: isPanelVisible ? '1' : '0',
      },
    })
    .catch(() => {});

  edgeTabWindows.set(display.id, tabWin);
  return tabWin;
}

function syncEdgeTabWindows(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    destroyAllEdgeTabWindows();
    return;
  }

  const allDisplays = getAllMonitorDisplayInfos();
  const allIds = new Set(allDisplays.map((d) => d.id));
  const activeDisplay = ensureValidActiveDisplay(allDisplays);
  const enabledDisplays = getEnabledMonitorDisplays(allDisplays);
  const shouldShowTabs = showEdgeHandleState || isDictatingState;

  // If in single-display routing where no companion windows are needed, release idle companion renderers
  if (enabledDisplays.length <= 1) {
    isHoveringCompanionTab = false;
    destroyAllEdgeTabWindows();
    return;
  }

  // Destroy companion windows for disconnected displays
  for (const [id, win] of edgeTabWindows) {
    if (!allIds.has(id) || win.isDestroyed()) {
      isHoveringCompanionTab = false;
      try {
        if (!win.isDestroyed()) win.destroy();
      } catch {
        // ignore
      }
      edgeTabWindows.delete(id);
    }
  }

  const companionTargetIds = new Set(
    shouldShowTabs
      ? enabledDisplays
          .filter((d) => d.id !== activeDisplay.id)
          .map((d) => d.id)
      : []
  );

  // Hide companion windows that should not currently be visible (e.g. activeDisplayId)
  for (const [id, win] of edgeTabWindows) {
    if (!companionTargetIds.has(id) && !win.isDestroyed()) {
      if (win.isVisible()) {
        isHoveringCompanionTab = false;
        win.hide();
      }
    }
  }

  // Show and position companion windows for all other enabled monitors
  for (const display of enabledDisplays) {
    if (!companionTargetIds.has(display.id)) continue;
    const edge = getEffectiveEdgeForDisplay(display.id);
    const bounds = computeEdgeTabBounds(display, edge);
    const existing = edgeTabWindows.get(display.id);
    if (!existing || existing.isDestroyed()) {
      createEdgeTabWindow(display, edge, bounds);
    } else {
      setEdgeTabBoundsSafe(existing, bounds);
      if (!existing.webContents.isLoading()) {
        existing.webContents.send('edge-tab-update', {
          displayId: display.id,
          edge,
          isDictating: isDictatingState,
          shortcutLabel: shortcutLabelState,
          displayName: `Monitor ${display.index}`,
          isOpenElsewhere: isPanelVisible,
        });
        if (!existing.isVisible()) {
          existing.setIgnoreMouseEvents(true, { forward: true });
          existing.showInactive();
        }
      }
    }
  }
}

function applyMainWindowBounds(
  edge?: 'left' | 'right',
  widthPercent?: number,
  options?: { skipCompanionSync?: boolean }
): void {
  if (edge === 'left' || edge === 'right') {
    currentPanelEdge = edge;
  }
  if (widthPercent !== undefined) {
    currentPanelWidthPercent = clampPanelWidthPercent(widthPercent);
  }
  if (isPanelVisible) {
    suppressBlurUntil = Math.max(suppressBlurUntil, Date.now() + 300);
  }
  const allDisplays = getAllMonitorDisplayInfos();
  const activeDisplay = ensureValidActiveDisplay(allDisplays);
  const effectiveEdge = getEffectiveEdgeForDisplay(activeDisplay.id);

  if (mainWindow && !mainWindow.isDestroyed()) {
    setWindowBoundsCrossDpiSafe(
      mainWindow,
      computePanelBoundsForDisplay(
        activeDisplay,
        effectiveEdge,
        currentPanelWidthPercent
      )
    );
  }
  if (!options?.skipCompanionSync) {
    broadcastDisplayState();
    syncEdgeTabWindows();
  }
}

function applyMonitorSettingsFromMain(
  nextRaw: unknown
): MainDisplayStatePayload {
  monitorSettings = sanitizeMainMonitorSettings(nextRaw);
  writeLocalStore('sideflow_monitor_settings', monitorSettings);
  applyMainWindowBounds();
  updateTrayMenu();
  return getDisplayStatePayload();
}

function createWindow(): void {
  const store = readLocalStore();
  if (store.sideflow_panel_edge === 'left' || store.sideflow_panel_edge === 'right') {
    currentPanelEdge = store.sideflow_panel_edge;
  }
  if (store.sideflow_panel_width_percent !== undefined) {
    currentPanelWidthPercent = clampPanelWidthPercent(
      store.sideflow_panel_width_percent
    );
  }
  if (store.sideflow_monitor_settings !== undefined) {
    monitorSettings = sanitizeMainMonitorSettings(
      store.sideflow_monitor_settings
    );
  }
  if (typeof store.sideflow_edge_handle === 'boolean') {
    showEdgeHandleState = store.sideflow_edge_handle;
  }
  const savedShortcut = store.sideflow_shortcut as { label?: string } | undefined;
  if (typeof savedShortcut?.label === 'string' && savedShortcut.label.trim()) {
    shortcutLabelState = savedShortcut.label.trim();
  }

  const allDisplays = getAllMonitorDisplayInfos();
  const initialDisplay = ensureValidActiveDisplay(allDisplays);
  const initialEdge = getEffectiveEdgeForDisplay(initialDisplay.id);
  const initialBounds = computePanelBoundsForDisplay(
    initialDisplay,
    initialEdge,
    currentPanelWidthPercent
  );

  mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Automatically grant local microphone access for Voice Dictation inside mainWindow only
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (
      permission === 'media' &&
      mainWindow &&
      !mainWindow.isDestroyed() &&
      webContents === mainWindow.webContents
    ) {
      callback(true);
      return;
    }
    callback(false);
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Prevent untrusted navigation inside the Electron shell
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (devServerUrl && navigationUrl.startsWith(devServerUrl)) return;
    event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url);
      }
    } catch {
      // ignore invalid URLs
    }
    return { action: 'deny' };
  });

  mainWindow.on('blur', () => {
    if (isHoveringCompanionTab || Date.now() < suppressBlurUntil) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-blur');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    destroyAllEdgeTabWindows();
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    togglePanelFromMain(true);
  });
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;

  createWindow();
  syncEdgeTabWindows();

  const handleDisplayTopologyChanged = () => {
    applyMainWindowBounds();
    updateTrayMenu();
  };

  screen.on('display-added', handleDisplayTopologyChanged);
  screen.on('display-removed', handleDisplayTopologyChanged);
  screen.on('display-metrics-changed', handleDisplayTopologyChanged);

  // Register persisted or default global shortcut & auto-launch on login
  const store = readLocalStore();
  if (app.isPackaged && typeof store.sideflow_open_at_login !== 'boolean') {
    setAutoLaunchState(true);
  } else if (typeof store.sideflow_open_at_login === 'boolean') {
    setAutoLaunchState(store.sideflow_open_at_login);
  }

  // Create System Tray
  const icon = createTrayIcon();
  tray = new Tray(icon);
  updateTrayMenu();
  tray.on('click', () => {
    togglePanelFromMain();
  });

  const savedShortcut = store.sideflow_shortcut as { label?: string } | undefined;
  const initialAccel = savedShortcut?.label
    ? savedShortcut.label.replace(/\s+/g, '')
    : 'Alt+Space';
  if (!registerGlobalHotkey(initialAccel)) {
    registerGlobalHotkey('Alt+Space');
  }

  // Initialize Auto-Updater and schedule background release checks
  setupAutoUpdater();
  setTimeout(() => {
    void performUpdateCheck();
  }, 8000);
  updateCheckInterval = setInterval(() => {
    void performUpdateCheck();
  }, 4 * 60 * 60 * 1000);

  const isMainSender = (
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
  ): boolean =>
    Boolean(
      mainWindow &&
        !mainWindow.isDestroyed() &&
        event.sender === mainWindow.webContents
    );

  const isCompanionSender = (
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
    expectedDisplayId?: number
  ): boolean => {
    if (typeof expectedDisplayId === 'number') {
      const win = edgeTabWindows.get(expectedDisplayId);
      return Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
    }
    for (const [, win] of edgeTabWindows) {
      if (!win.isDestroyed() && event.sender === win.webContents) {
        return true;
      }
    }
    return false;
  };

  // IPC Handlers
  ipcMain.handle(
    'launch-native-app',
    async (event, command: string, args?: string[]) => {
      if (!isMainSender(event)) {
        return { success: false, error: 'Unauthorized IPC sender' };
      }
      return launchNativeCommand(command, args);
    }
  );

  ipcMain.handle('update-global-shortcut', async (event, accelerator: string) => {
    if (!isMainSender(event)) return false;
    return registerGlobalHotkey(accelerator);
  });

  ipcMain.on('set-panel-visibility', (event, visible: boolean) => {
    if (!isMainSender(event)) return;
    isPanelVisible = Boolean(visible);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (isPanelVisible) {
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.show();
      mainWindow.focus();
    } else {
      // Forward mouse events so desktop underneath remains clickable while edge handle can still be hovered
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
    syncEdgeTabWindows();
  });

  ipcMain.on('set-panel-edge', (event, edge: 'left' | 'right') => {
    if (!isMainSender(event)) return;
    if (edge !== 'left' && edge !== 'right') return;
    applyMainWindowBounds(edge);
    writeLocalStore('sideflow_panel_edge', currentPanelEdge);
  });

  ipcMain.on('set-panel-width-percent', (event, widthPercent: number) => {
    if (!isMainSender(event)) return;
    const clamped = clampPanelWidthPercent(widthPercent);
    applyMainWindowBounds(undefined, clamped, { skipCompanionSync: true });
    writeLocalStore('sideflow_panel_width_percent', clamped);
  });

  ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean) => {
    if (!isMainSender(event)) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (ignore) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      mainWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.handle('get-display-state', async (event) => {
    if (!isMainSender(event)) return getDisplayStatePayload();
    return getDisplayStatePayload();
  });

  ipcMain.handle('set-monitor-settings', async (event, nextSettings: unknown) => {
    if (!isMainSender(event)) return getDisplayStatePayload();
    return applyMonitorSettingsFromMain(nextSettings);
  });

  ipcMain.handle(
    'activate-display',
    async (
      event,
      payload: { displayId?: number; openPanel?: boolean } | number
    ) => {
      if (!isMainSender(event)) return getDisplayStatePayload();
      const displayId =
        typeof payload === 'number' ? payload : payload?.displayId;
      const shouldOpen =
        typeof payload === 'object' && payload !== null && typeof payload.openPanel === 'boolean'
          ? payload.openPanel
          : true;

      if (typeof displayId === 'number' && Number.isFinite(displayId)) {
        if (shouldOpen) {
          openPanelOnDisplay(displayId);
        } else {
          const allDisplays = getAllMonitorDisplayInfos();
          const enabledDisplays = getEnabledMonitorDisplays(allDisplays);
          const target = enabledDisplays.find((d) => d.id === displayId);
          if (target) {
            activeDisplayId = target.id;
            applyMainWindowBounds();
          }
        }
      }
      return getDisplayStatePayload();
    }
  );

  ipcMain.on(
    'set-edge-handle-state',
    (
      event,
      state: {
        showEdgeHandle?: boolean;
        isDictating?: boolean;
        shortcutLabel?: string;
      }
    ) => {
      if (!isMainSender(event)) return;
      if (!state || typeof state !== 'object') return;
      if (typeof state.showEdgeHandle === 'boolean') {
        showEdgeHandleState = state.showEdgeHandle;
      }
      if (typeof state.isDictating === 'boolean') {
        isDictatingState = state.isDictating;
      }
      if (typeof state.shortcutLabel === 'string' && state.shortcutLabel.trim()) {
        shortcutLabelState = state.shortcutLabel.trim().slice(0, 64);
      }
      syncEdgeTabWindows();
    }
  );

  ipcMain.on('prepare-edge-tab-click', (event) => {
    if (!isCompanionSender(event)) return;
    isHoveringCompanionTab = true;
    suppressBlurUntil = Date.now() + 600;
  });

  ipcMain.on('edge-tab-clicked', (event, displayId: unknown) => {
    if (
      typeof displayId === 'number' &&
      Number.isFinite(displayId) &&
      isCompanionSender(event, displayId)
    ) {
      openPanelOnDisplay(displayId);
    }
  });

  ipcMain.on(
    'set-companion-ignore-mouse',
    (event, payload: { displayId?: number; ignore?: boolean }) => {
      if (!payload || typeof payload.displayId !== 'number') return;
      if (payload.ignore && isCompanionSender(event)) {
        isHoveringCompanionTab = false;
      }
      if (!isCompanionSender(event, payload.displayId)) return;
      const tabWin = edgeTabWindows.get(payload.displayId);
      if (!tabWin || tabWin.isDestroyed()) return;
      if (payload.ignore) {
        isHoveringCompanionTab = false;
        tabWin.setIgnoreMouseEvents(true, { forward: true });
      } else {
        isHoveringCompanionTab = true;
        suppressBlurUntil = Date.now() + 800;
        tabWin.setIgnoreMouseEvents(false);
      }
    }
  );

  ipcMain.handle('open-file-dialog', async (event) => {
    if (!isMainSender(event) || !mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Application, Shortcut, Script, or File',
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  ipcMain.handle('open-directory-dialog', async (event) => {
    if (!isMainSender(event) || !mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Folder for Live ObjectDock Drawer',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('read-directory-items', async (event, dirPath: string) => {
    if (!isMainSender(event)) return [];
    if (!dirPath || typeof dirPath !== 'string') return [];
    try {
      const resolvedDir = path.resolve(dirPath.trim());
      const entries = await fs.promises.readdir(resolvedDir, {
        withFileTypes: true,
      });
      return entries
        .filter((e) => !e.name.startsWith('.'))
        .slice(0, 48)
        .map((e) => ({
          name: e.name,
          path: path.join(resolvedDir, e.name),
          isDirectory: e.isDirectory(),
        }));
    } catch {
      return [];
    }
  });

  const getWindowsShortcutSearchDirs = (): string[] => {
    const dirs: string[] = [];
    if (process.env.APPDATA) {
      dirs.push(
        path.join(
          process.env.APPDATA,
          'Microsoft',
          'Internet Explorer',
          'Quick Launch',
          'User Pinned',
          'TaskBar'
        ),
        path.join(
          process.env.APPDATA,
          'Microsoft',
          'Windows',
          'Start Menu',
          'Programs'
        )
      );
    }
    if (process.env.PROGRAMDATA) {
      dirs.push(
        path.join(
          process.env.PROGRAMDATA,
          'Microsoft',
          'Windows',
          'Start Menu',
          'Programs'
        )
      );
    }
    try {
      dirs.push(app.getPath('desktop'));
    } catch {
      // ignore
    }
    return dirs.filter((d) => {
      try {
        return fs.existsSync(d);
      } catch {
        return false;
      }
    });
  };

  const findShortcutInDirs = (
    baseName: string,
    dirs: string[],
    maxDepth = 3
  ): string | null => {
    const cleanTarget = baseName
      .replace(/\.(lnk|appref-ms|url|exe)$/i, '')
      .trim()
      .toLowerCase();
    if (!cleanTarget) return null;

    const searchDir = (dir: string, depth: number): string | null => {
      if (depth > maxDepth) return null;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return null;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext === '.lnk' || ext === '.appref-ms' || ext === '.url') {
            const stem = path
              .basename(entry.name, path.extname(entry.name))
              .trim()
              .toLowerCase();
            if (stem === cleanTarget || entry.name.toLowerCase() === baseName.toLowerCase()) {
              return fullPath;
            }
          }
        } else if (entry.isDirectory()) {
          const found = searchDir(fullPath, depth + 1);
          if (found) return found;
        }
      }
      return null;
    };

    for (const dir of dirs) {
      const match = searchDir(dir, 0);
      if (match) return match;
    }
    return null;
  };

  const resolveShortcutAndIcon = async (
    rawInput: string
  ): Promise<{
    name: string;
    cmd: string;
    args?: string;
    iconDataUrl: string | null;
  }> => {
    const trimmed = (rawInput || '').trim().replace(/^["']|["']$/g, '');
    let candidatePath = trimmed;
    if (trimmed.toLowerCase().startsWith('file://')) {
      try {
        candidatePath = decodeURIComponent(new URL(trimmed).pathname).replace(
          /^\/([A-Za-z]:)/,
          '$1'
        );
      } catch {
        // keep trimmed
      }
    }

    let resolvedPath = /[\\/]/.test(candidatePath)
      ? path.resolve(candidatePath)
      : candidatePath;

    if (!fs.existsSync(resolvedPath)) {
      const baseName = path.basename(candidatePath);
      const located = findShortcutInDirs(
        baseName,
        getWindowsShortcutSearchDirs()
      );
      if (located) {
        resolvedPath = located;
      }
    }

    let targetPath = resolvedPath;
    let shortcutArgs: string | undefined;
    let customIconFilePath: string | undefined;
    const lowerPath = resolvedPath.toLowerCase();

    if (lowerPath.endsWith('.lnk') && fs.existsSync(resolvedPath)) {
      try {
        const link = shell.readShortcutLink(resolvedPath);
        if (link.target) {
          targetPath = link.target;
        }
        if (link.args) {
          shortcutArgs = link.args;
        }
        if (link.icon) {
          customIconFilePath = link.icon;
        }
      } catch {
        // Fallback to .lnk path itself
      }
    } else if (lowerPath.endsWith('.url') && fs.existsSync(resolvedPath)) {
      try {
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        const urlMatch = content.match(/^URL=(.+)$/im);
        const iconMatch = content.match(/^IconFile=(.+)$/im);
        if (urlMatch && urlMatch[1]) {
          targetPath = urlMatch[1].trim();
        }
        if (iconMatch && iconMatch[1]) {
          customIconFilePath = iconMatch[1].trim();
        }
      } catch {
        // ignore
      }
    }

    let iconDataUrl: string | null = null;
    const iconCandidatePaths = [
      customIconFilePath,
      targetPath,
      resolvedPath,
    ].filter((p): p is string => Boolean(p && typeof p === 'string'));

    for (const candidate of iconCandidatePaths) {
      if (iconDataUrl) break;
      const cleanCandidate = candidate.split(',')[0].trim();
      if (!cleanCandidate) continue;
      try {
        if (
          /\.(png|ico|jpg|jpeg|bmp|webp)$/i.test(cleanCandidate) &&
          fs.existsSync(cleanCandidate)
        ) {
          const directImg = nativeImage.createFromPath(cleanCandidate);
          if (directImg && !directImg.isEmpty()) {
            iconDataUrl = directImg.toDataURL();
            break;
          }
        }
      } catch {
        // continue to app.getFileIcon
      }
      try {
        const fileIcon = await app.getFileIcon(cleanCandidate, {
          size: 'large',
        });
        if (fileIcon && !fileIcon.isEmpty()) {
          iconDataUrl = fileIcon.toDataURL();
          break;
        }
      } catch {
        // ignore and try next candidate
      }
    }

    const baseDisplay = path
      .basename(resolvedPath)
      .replace(/\.(lnk|appref-ms|url|exe|app)$/i, '');

    return {
      name: baseDisplay || path.basename(targetPath) || 'Shortcut',
      cmd: targetPath || resolvedPath,
      ...(shortcutArgs ? { args: shortcutArgs } : {}),
      iconDataUrl,
    };
  };

  ipcMain.handle('extract-file-icon', async (event, filePath: string) => {
    if (!isMainSender(event)) return null;
    if (!filePath || typeof filePath !== 'string') return null;
    try {
      const resolved = await resolveShortcutAndIcon(filePath);
      return resolved.iconDataUrl;
    } catch {
      return null;
    }
  });

  ipcMain.handle('resolve-shortcut-item', async (event, rawPathOrName: string) => {
    if (!isMainSender(event)) return null;
    if (!rawPathOrName || typeof rawPathOrName !== 'string') return null;
    try {
      return await resolveShortcutAndIcon(rawPathOrName);
    } catch {
      return null;
    }
  });

  ipcMain.handle('get-system-metrics', async (event) => {
    if (!isMainSender(event)) {
      return {
        cpuPercent: 0,
        memPercent: 0,
        memUsedGb: 0,
        memTotalGb: 0,
        uptimeHours: 0,
      };
    }
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpus) {
      for (const type of Object.keys(cpu.times) as Array<keyof typeof cpu.times>) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }
    const cpuPercent =
      totalTick > 0
        ? Math.max(1, Math.min(99, Math.round((1 - totalIdle / totalTick) * 100)))
        : 12;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = Math.max(0, totalMem - freeMem);
    const memTotalGb = Math.round((totalMem / 1024 ** 3) * 10) / 10;
    const memUsedGb = Math.round((usedMem / 1024 ** 3) * 10) / 10;
    const memPercent =
      totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 45;
    const uptimeHours = Math.round((os.uptime() / 3600) * 10) / 10;

    return {
      cpuPercent,
      memPercent,
      memUsedGb,
      memTotalGb,
      uptimeHours,
    };
  });

  ipcMain.handle('get-running-processes', async (event) => {
    if (!isMainSender(event)) return [];
    return new Promise<string[]>((resolve) => {
      if (process.platform === 'win32') {
        execFile(
          'tasklist',
          ['/FO', 'CSV', '/NH'],
          { timeout: 4000, windowsHide: true },
          (err, stdout) => {
            if (err || !stdout) {
              resolve([]);
              return;
            }
            const names = new Set<string>();
            for (const line of stdout.split(/\r?\n/)) {
              const match = line.match(/^"([^"]+)"/);
              if (match && match[1]) {
                names.add(match[1].toLowerCase());
              }
            }
            resolve(Array.from(names));
          }
        );
      } else {
        execFile(
          'ps',
          ['-eo', 'comm='],
          { timeout: 4000 },
          (err, stdout) => {
            if (err || !stdout) {
              resolve([]);
              return;
            }
            const names = new Set<string>();
            for (const line of stdout.split(/\r?\n/)) {
              const clean = path.basename(line.trim()).toLowerCase();
              if (clean) names.add(clean);
            }
            resolve(Array.from(names));
          }
        );
      }
    });
  });

  ipcMain.handle('store-get-all', async (event) => {
    if (!isMainSender(event)) return {};
    return readLocalStore();
  });

  ipcMain.on('store-set', (event, payload: { key: string; value: unknown }) => {
    if (!isMainSender(event)) return;
    if (payload && typeof payload.key === 'string') {
      writeLocalStore(payload.key, payload.value);
      if (payload.key === 'sideflow_edge_handle' && typeof payload.value === 'boolean') {
        showEdgeHandleState = payload.value;
        syncEdgeTabWindows();
      } else if (payload.key === 'sideflow_monitor_settings') {
        const incoming = sanitizeMainMonitorSettings(payload.value);
        if (JSON.stringify(incoming) !== JSON.stringify(monitorSettings)) {
          applyMonitorSettingsFromMain(incoming);
        }
      } else if (
        payload.key === 'sideflow_shortcut' &&
        payload.value &&
        typeof payload.value === 'object' &&
        typeof (payload.value as { label?: unknown }).label === 'string'
      ) {
        const trimmedLabel = String((payload.value as { label: string }).label)
          .trim()
          .slice(0, 64);
        if (trimmedLabel) {
          shortcutLabelState = trimmedLabel;
          syncEdgeTabWindows();
        }
      }
    }
  });

  ipcMain.handle('get-local-stt-status', async (event) => {
    if (!isMainSender(event)) {
      return {
        available: false,
        fasterWhisperAvailable: false,
        cudaAvailable: false,
        windowsSapiAvailable: false,
      };
    }
    if (sttStatusCache) return sttStatusCache;
    await ensureSttWorker();
    if (sttStatusCache) {
      return sttStatusCache;
    }
    return {
      available: process.platform === 'win32',
      fasterWhisperAvailable: false,
      cudaAvailable: false,
      windowsSapiAvailable: process.platform === 'win32',
    };
  });

  ipcMain.handle(
    'warmup-local-stt',
    async (
      event,
      payload?: {
        lang?: string;
        modelSize?: string;
        preferEngine?: string;
      }
    ) => {
      if (!isMainSender(event)) {
        return { success: false, error: 'Unauthorized IPC sender' };
      }
      const preferEngine =
        typeof payload?.preferEngine === 'string'
          ? payload.preferEngine.slice(0, 32)
          : 'auto';
      const lang =
        typeof payload?.lang === 'string'
          ? payload.lang.slice(0, 16)
          : 'en-US';
      const modelSize =
        typeof payload?.modelSize === 'string'
          ? payload.modelSize.slice(0, 32)
          : 'base.en';

      if (preferEngine === 'os-speech') {
        const t0 = Date.now();
        const resp = await sendSapiWorkerCommand({ cmd: 'warmup', lang }, 12000);
        return {
          success: Boolean(resp.success),
          engineUsed:
            typeof resp.engineUsed === 'string'
              ? resp.engineUsed
              : 'Windows Offline Speech (SAPI)',
          durationMs: Date.now() - t0,
        };
      }

      const workerOk = await ensureSttWorker();
      if (workerOk && sttStatusCache?.fasterWhisperAvailable) {
        const resp = await sendSttWorkerCommand(
          {
            cmd: 'warmup',
            lang,
            modelSize,
            preferEngine,
          },
          45000
        );
        return {
          success: Boolean(resp.success),
          engineUsed:
            typeof resp.engineUsed === 'string' ? resp.engineUsed : undefined,
          durationMs:
            typeof resp.durationMs === 'number' ? resp.durationMs : undefined,
          error: typeof resp.error === 'string' ? resp.error : undefined,
        };
      }

      return {
        success: false,
        error: 'Native faster-whisper unavailable; renderer ONNX worker preferred',
      };
    }
  );

  ipcMain.handle(
    'transcribe-audio-local',
    async (
      event,
      payload: {
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
      }
    ) => {
      if (!isMainSender(event)) {
        return { success: false, error: 'Unauthorized IPC sender' };
      }
      if (!payload || typeof payload.pcm16Base64 !== 'string' || !payload.pcm16Base64) {
        return { success: false, error: 'Missing audio payload' };
      }

      const preferEngine =
        typeof payload.preferEngine === 'string'
          ? payload.preferEngine.slice(0, 32)
          : 'auto';
      const safeSampleRate =
        typeof payload.sampleRate === 'number' &&
        Number.isFinite(payload.sampleRate)
          ? Math.max(8000, Math.min(96000, Math.round(payload.sampleRate)))
          : 16000;
      const safeLang =
        typeof payload.lang === 'string' && payload.lang.trim()
          ? payload.lang.trim().slice(0, 16)
          : 'en-US';
      const safeModelSize =
        typeof payload.modelSize === 'string' && payload.modelSize.trim()
          ? payload.modelSize.trim().slice(0, 32)
          : 'base.en';
      const safePromptContext =
        typeof payload.promptContext === 'string'
          ? payload.promptContext.slice(-300)
          : '';

      // Explicit Windows Offline Speech (SAPI) via persistent MemoryStream daemon
      if (preferEngine === 'os-speech') {
        return transcribeWithWindowsSapi(
          payload.pcm16Base64,
          safeSampleRate,
          safeLang
        );
      }

      const workerOk = await ensureSttWorker();
      if (workerOk && sttStatusCache?.fasterWhisperAvailable) {
        const workerResp = await sendSttWorkerCommand({
          cmd: 'transcribe',
          pcm16Base64: payload.pcm16Base64,
          sampleRate: safeSampleRate,
          lang: safeLang,
          modelSize: safeModelSize,
          preferEngine,
          promptContext: safePromptContext,
          lowLatency: payload.lowLatency ?? !sttStatusCache.cudaAvailable,
          isPartial: Boolean(payload.isPartial),
          preTrimmed: Boolean(payload.preTrimmed),
          preNormalized: Boolean(payload.preNormalized),
        });

        if (workerResp.success) {
          return workerResp;
        }
      }

      // In 'auto' mode when faster-whisper is absent, return fast so renderer uses hot Moonshine ONNX worker first
      if (preferEngine === 'auto') {
        return {
          success: false,
          error: 'faster-whisper unavailable; deferring to in-app ONNX worker',
        };
      }

      // Explicit native-cpu / native-cuda fallback to persistent Windows SAPI
      return transcribeWithWindowsSapi(
        payload.pcm16Base64,
        safeSampleRate,
        safeLang
      );
    }
  );

  ipcMain.handle('get-auto-launch', async (event) => {
    if (!isMainSender(event)) return { enabled: false, isPackaged: app.isPackaged };
    return getAutoLaunchState();
  });

  ipcMain.handle('set-auto-launch', async (event, enabled: boolean) => {
    if (!isMainSender(event)) return getAutoLaunchState();
    return setAutoLaunchState(Boolean(enabled));
  });

  ipcMain.handle('get-update-status', async (event) => {
    if (!isMainSender(event)) {
      return {
        ...updateState,
        currentVersion: app.getVersion(),
      };
    }
    return {
      ...updateState,
      currentVersion: app.getVersion(),
    };
  });

  ipcMain.handle('check-for-updates', async (event) => {
    if (!isMainSender(event)) {
      return {
        ...updateState,
        currentVersion: app.getVersion(),
      };
    }
    return performUpdateCheck();
  });

  ipcMain.handle('install-update-now', async (event) => {
    if (!isMainSender(event)) {
      return { success: false, error: 'Unauthorized IPC sender' };
    }
    try {
      if (updateState.status === 'downloaded' && updateState.canQuitAndInstall) {
        setImmediate(() => {
          autoUpdater.quitAndInstall(false, true);
        });
        return { success: true };
      }
      if (updateState.releaseUrl) {
        await shell.openExternal(updateState.releaseUrl);
        return { success: true };
      }
      await shell.openExternal(GITHUB_RELEASES_URL);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to launch update installer',
      };
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  destroyAllEdgeTabWindows();
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
  if (sttWorkerProcess) {
    try {
      sttWorkerProcess.kill();
    } catch {
      // ignore
    }
    sttWorkerProcess = null;
  }
  if (sapiWorkerProcess) {
    try {
      sapiWorkerProcess.kill();
    } catch {
      // ignore
    }
    sapiWorkerProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


