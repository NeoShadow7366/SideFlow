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

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isPanelVisible = true;
let currentAccelerator = 'Alt+Space';
let currentPanelEdge: 'left' | 'right' = 'right';
let currentPanelWidthPercent = 35;
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

// Persistent Local Speech-to-Text Python Worker state
let sttWorkerProcess: ChildProcessWithoutNullStreams | null = null;
let sttWorkerReady = false;
let sttPendingRequests = new Map<string, (resp: Record<string, unknown>) => void>();
let sttStatusCache: {
  available: boolean;
  fasterWhisperAvailable: boolean;
  cudaAvailable: boolean;
  gpuName?: string;
  windowsSapiAvailable: boolean;
  activeModel?: string;
} | null = null;


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
          const setupAsset = (parsed.assets || []).find(
            (a) => a.name && a.name.toLowerCase().endsWith('.exe')
          );
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

function togglePanelFromMain(forceState?: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const nextState = typeof forceState === 'boolean' ? forceState : !isPanelVisible;
  isPanelVisible = nextState;

  if (isPanelVisible) {
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.show();
    mainWindow.focus();
  } else {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
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

  const scriptPath = getSttWorkerScriptPath();
  if (!scriptPath) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };

    try {
      const proc = spawn('python', ['-u', scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      sttWorkerProcess = proc;

      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          if (parsed.id === 'init') {
            sttWorkerReady = true;
            sttStatusCache = {
              available: true,
              fasterWhisperAvailable: Boolean(parsed.fasterWhisperAvailable),
              cudaAvailable: Boolean(parsed.cudaAvailable),
              gpuName: typeof parsed.gpuName === 'string' ? parsed.gpuName : undefined,
              windowsSapiAvailable: process.platform === 'win32',
              activeModel: 'base.en',
            };
            finish(true);
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
        sttWorkerReady = false;
        sttWorkerProcess = null;
        finish(false);
      });

      proc.on('exit', () => {
        sttWorkerReady = false;
        sttWorkerProcess = null;
        for (const [, cb] of sttPendingRequests) {
          cb({ success: false, error: 'STT worker exited' });
        }
        sttPendingRequests.clear();
        finish(false);
      });

      setTimeout(() => finish(sttWorkerReady), 6000);
    } catch {
      finish(false);
    }
  });
}

function sendSttWorkerCommand(
  payload: Record<string, unknown>,
  timeoutMs = 30000
): Promise<Record<string, unknown>> {
  return new Promise(async (resolve) => {
    const ok = await ensureSttWorker();
    if (!ok || !sttWorkerProcess) {
      resolve({ success: false, error: 'Python STT worker unavailable' });
      return;
    }

    const reqId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timer = setTimeout(() => {
      sttPendingRequests.delete(reqId);
      resolve({ success: false, error: 'STT worker timed out' });
    }, timeoutMs);

    sttPendingRequests.set(reqId, (resp) => {
      clearTimeout(timer);
      resolve(resp);
    });

    try {
      sttWorkerProcess.stdin.write(JSON.stringify({ ...payload, id: reqId }) + '\n');
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

function createWavBufferFromPcm16(pcm16Bytes: Buffer, sampleRate = 16000): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcm16Bytes.length;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20);  // AudioFormat 1 = PCM
  header.writeUInt16LE(1, 22);  // NumChannels = 1 (Mono)
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // ByteRate = SampleRate * 2
  header.writeUInt16LE(2, 32);  // BlockAlign = 2
  header.writeUInt16LE(16, 34); // BitsPerSample = 16
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm16Bytes]);
}

function transcribeWithWindowsSapi(
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
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ success: false, error: 'Windows SAPI is only supported on Windows' });
      return;
    }

    const t0 = Date.now();
    const rawPcm = Buffer.from(pcm16Base64, 'base64');
    if (rawPcm.length < 1600) {
      resolve({ success: true, text: '', engineUsed: 'Windows Offline SAPI', durationMs: 0 });
      return;
    }

    const wavBuffer = createWavBufferFromPcm16(rawPcm, sampleRate);
    const tempWav = path.join(
      os.tmpdir(),
      `sideflow-stt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.wav`
    );

    try {
      fs.writeFileSync(tempWav, wavBuffer);
    } catch (err) {
      resolve({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write temp WAV',
      });
      return;
    }

    const psScript = `
Add-Type -AssemblyName System.Speech
$culture = try { New-Object System.Globalization.CultureInfo('${lang.replace(/[^a-zA-Z-]/g, '')}') } catch { [System.Globalization.CultureInfo]::InstalledUICulture }
$rec = try { New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture) } catch { New-Object System.Speech.Recognition.SpeechRecognitionEngine }
$rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$rec.SetInputToWaveFile('${tempWav.replace(/'/g, "''")}')
$sb = New-Object System.Text.StringBuilder
while ($true) {
  $r = $rec.Recognize()
  if ($null -eq $r) { break }
  if ($r.Text) { [void]$sb.Append($r.Text + ' ') }
}
$rec.Dispose()
Write-Output $sb.ToString().Trim()
`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { timeout: 15000, windowsHide: true },
      (err, stdout) => {
        try {
          if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
        } catch {
          // ignore
        }
        if (err) {
          resolve({ success: false, error: err.message });
          return;
        }
        resolve({
          success: true,
          text: (stdout || '').trim(),
          engineUsed: 'Windows Offline Speech (SAPI)',
          durationMs: Date.now() - t0,
        });
      }
    );
  });
}

function clampPanelWidthPercent(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) {
    return 35;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 35;
  return Math.max(15, Math.min(90, Math.round(num)));
}

function computePanelBounds(
  edge: 'left' | 'right',
  widthPercent: number
): { x: number; y: number; width: number; height: number } {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const { x: workAreaX, y: workAreaY } = primaryDisplay.workArea;
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

function applyMainWindowBounds(
  edge?: 'left' | 'right',
  widthPercent?: number
): void {
  if (edge === 'left' || edge === 'right') {
    currentPanelEdge = edge;
  }
  if (widthPercent !== undefined) {
    currentPanelWidthPercent = clampPanelWidthPercent(widthPercent);
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setBounds(
    computePanelBounds(currentPanelEdge, currentPanelWidthPercent)
  );
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
  const initialBounds = computePanelBounds(
    currentPanelEdge,
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
    },
  });

  // Automatically grant local microphone access for Voice Dictation inside Electron
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-blur');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
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

  screen.on('display-metrics-changed', () => {
    applyMainWindowBounds();
  });

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

  // IPC Handlers
  ipcMain.handle(
    'launch-native-app',
    async (_event, command: string, args?: string[]) => {
      return launchNativeCommand(command, args);
    }
  );

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

  ipcMain.on('set-panel-edge', (_event, edge: 'left' | 'right') => {
    if (edge !== 'left' && edge !== 'right') return;
    applyMainWindowBounds(edge);
    writeLocalStore('sideflow_panel_edge', currentPanelEdge);
  });

  ipcMain.on('set-panel-width-percent', (_event, widthPercent: number) => {
    const clamped = clampPanelWidthPercent(widthPercent);
    applyMainWindowBounds(undefined, clamped);
    writeLocalStore('sideflow_panel_width_percent', clamped);
  });

  ipcMain.on('set-ignore-mouse-events', (_event, ignore: boolean) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (ignore) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      mainWindow.setIgnoreMouseEvents(false);
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

  ipcMain.handle('open-directory-dialog', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Folder for Live ObjectDock Drawer',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('read-directory-items', async (_event, dirPath: string) => {
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

  ipcMain.handle('extract-file-icon', async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') return null;
    try {
      const resolved = await resolveShortcutAndIcon(filePath);
      return resolved.iconDataUrl;
    } catch {
      return null;
    }
  });

  ipcMain.handle('resolve-shortcut-item', async (_event, rawPathOrName: string) => {
    if (!rawPathOrName || typeof rawPathOrName !== 'string') return null;
    try {
      return await resolveShortcutAndIcon(rawPathOrName);
    } catch {
      return null;
    }
  });

  ipcMain.handle('get-system-metrics', async () => {
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

  ipcMain.handle('get-running-processes', async () => {
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

  ipcMain.handle('store-get-all', async () => {
    return readLocalStore();
  });

  ipcMain.on('store-set', (_event, payload: { key: string; value: unknown }) => {
    if (payload && typeof payload.key === 'string') {
      writeLocalStore(payload.key, payload.value);
    }
  });

  ipcMain.handle('get-local-stt-status', async () => {
    if (sttStatusCache) return sttStatusCache;
    const workerOk = await ensureSttWorker();
    if (workerOk && sttStatusCache) {
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
    'transcribe-audio-local',
    async (
      _event,
      payload: {
        pcm16Base64: string;
        sampleRate: number;
        lang: string;
        modelSize?: string;
        preferEngine?: string;
        promptContext?: string;
      }
    ) => {
      if (!payload || !payload.pcm16Base64) {
        return { success: false, error: 'Missing audio payload' };
      }

      // If explicitly requesting OS speech fallback
      if (payload.preferEngine === 'os-speech') {
        return transcribeWithWindowsSapi(
          payload.pcm16Base64,
          payload.sampleRate || 16000,
          payload.lang || 'en-US'
        );
      }

      // Try faster-whisper worker first
      const workerResp = await sendSttWorkerCommand({
        cmd: 'transcribe',
        pcm16Base64: payload.pcm16Base64,
        sampleRate: payload.sampleRate || 16000,
        lang: payload.lang || 'en-US',
        modelSize: payload.modelSize || 'distil-small.en',
        preferEngine: payload.preferEngine || 'auto',
        promptContext: payload.promptContext || '',
      });

      if (workerResp.success) {
        return workerResp;
      }

      // Fallback to Windows Offline Speech (SAPI)
      return transcribeWithWindowsSapi(
        payload.pcm16Base64,
        payload.sampleRate || 16000,
        payload.lang || 'en-US'
      );
    }
  );

  ipcMain.handle('get-auto-launch', async () => {
    return getAutoLaunchState();
  });

  ipcMain.handle('set-auto-launch', async (_event, enabled: boolean) => {
    return setAutoLaunchState(Boolean(enabled));
  });

  ipcMain.handle('get-update-status', async () => {
    return {
      ...updateState,
      currentVersion: app.getVersion(),
    };
  });

  ipcMain.handle('check-for-updates', async () => {
    return performUpdateCheck();
  });

  ipcMain.handle('install-update-now', async () => {
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


