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
} from 'electron';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isPanelVisible = true;
let currentAccelerator = 'Alt+Space';
let cachedStore: Record<string, unknown> | null = null;

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
    fs.promises
      .writeFile(storePath, JSON.stringify(current, null, 2), 'utf-8')
      .catch((err) => {
        console.error('[SideFlow] Failed to write local store:', err);
      });
  } catch (err) {
    console.error('[SideFlow] Failed to update local store:', err);
  }
}

function createTrayIcon(): Electron.NativeImage {
  const candidates = [
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

  // Fallback 16x16 indigo lightning icon data URL
  const fallbackBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABOSURBVDhPY2RgYPgPxFQBjAwMDP8p4dH///9RxMDAwEAzAwaG/1Q1gBqA0QBMBoR5ACMDNQaQ7QFGBvINYGRgIBsMBoNBNwwGg0EAgB4fE/19y66kAAAAAElFTkSuQmCC';
  return nativeImage.createFromDataURL(`data:image/png;base64,${fallbackBase64}`);
}

function updateTrayMenu(): void {
  if (!tray) return;

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
    { type: 'separator' },
    {
      label: 'Quit SideFlow',
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip(`SideFlow Utility Panel (${currentAccelerator})`);
  tray.setContextMenu(contextMenu);
}

function togglePanelFromMain(forceState?: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const nextState = typeof forceState === 'boolean' ? forceState : !isPanelVisible;
  isPanelVisible = nextState;

  if (isPanelVisible) {
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.show();
    mainWindow.focus();
  }
  mainWindow.webContents.send('set-panel-visibility', isPanelVisible);
}

function navigateToTabFromMain(tab: 'drawers' | 'flowchart' | 'notes' | 'settings'): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isPanelVisible = true;
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('set-panel-visibility', true);
  mainWindow.webContents.send('switch-tab', tab);
}

function registerGlobalHotkey(accelerator: string): boolean {
  if (typeof accelerator !== 'string') return false;
  const normalized = accelerator.replace(/\s+/g, '');
  if (!/^(?:(?:CommandOrControl|Ctrl|Alt|Shift|Super)\+)+[A-Za-z0-9]+$/i.test(normalized)) {
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

function launchNativeCommand(command: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const trimmed = (command || '').trim();
    if (!trimmed) {
      resolve({ success: false, error: 'Empty command' });
      return;
    }

    // Check if URL or custom URI protocol (e.g. vscode://, spotify://, slack://, figma://, ms-calculator://)
    const isUriOrUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
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

      shell
        .openExternal(trimmed)
        .then(() => resolve({ success: true }))
        .catch((err: Error) => resolve({ success: false, error: err.message }));
      return;
    }

    // Local file path, executable, shortcut, script, or folder (no shell execution to prevent command injection)
    const resolvedPath = path.resolve(trimmed);
    shell
      .openPath(resolvedPath)
      .then((errMessage) => {
        if (!errMessage) {
          resolve({ success: true });
        } else {
          // Safe fallback using execFile with shell: false
          execFile(
            resolvedPath,
            [],
            { shell: false, windowsVerbatimArguments: false },
            (execErr) => {
              if (execErr) {
                resolve({ success: false, error: execErr.message });
              } else {
                resolve({ success: true });
              }
            }
          );
        }
      })
      .catch(() => {
        execFile(
          resolvedPath,
          [],
          { shell: false, windowsVerbatimArguments: false },
          (execErr) => {
            if (execErr) {
              resolve({ success: false, error: execErr.message });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
  });
}

function createWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const { x: workAreaX, y: workAreaY } = primaryDisplay.workArea;
  const panelWidth = 560;

  mainWindow = new BrowserWindow({
    width: panelWidth,
    height: height,
    x: workAreaX + width - panelWidth,
    y: workAreaY,
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
    },
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-blur');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Create System Tray
  const icon = createTrayIcon();
  tray = new Tray(icon);
  updateTrayMenu();
  tray.on('click', () => {
    togglePanelFromMain();
  });

  // Register persisted or default global shortcut
  const store = readLocalStore();
  const savedShortcut = store.sideflow_shortcut as { label?: string } | undefined;
  const initialAccel = savedShortcut?.label
    ? savedShortcut.label.replace(/\s+/g, '')
    : 'Alt+Space';
  if (!registerGlobalHotkey(initialAccel)) {
    registerGlobalHotkey('Alt+Space');
  }

  // IPC Handlers
  ipcMain.handle('launch-native-app', async (_event, command: string) => {
    return launchNativeCommand(command);
  });

  ipcMain.handle('update-global-shortcut', async (_event, accelerator: string) => {
    return registerGlobalHotkey(accelerator);
  });

  ipcMain.on('set-panel-visibility', (_event, visible: boolean) => {
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
  });

  ipcMain.handle('open-file-dialog', async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Application, Shortcut, Script, or File',
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  ipcMain.handle('store-get-all', async () => {
    return readLocalStore();
  });

  ipcMain.on('store-set', (_event, payload: { key: string; value: unknown }) => {
    if (payload && typeof payload.key === 'string') {
      writeLocalStore(payload.key, payload.value);
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
