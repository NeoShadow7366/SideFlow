import { AppDrawer, FlowchartState, NoteItem, ShortcutConfig } from '../types/sideflow';

export const defaultDrawers: AppDrawer[] = [
  {
    id: 'drawer-dev',
    title: 'Development & Code',
    collapsed: false,
    apps: [
      { id: 'app-1', name: 'VS Code', cmd: 'vscode://', icon: 'terminal', color: 'indigo' },
      { id: 'app-2', name: 'GitHub Desktop', cmd: 'x-github-client://', icon: 'git-branch', color: 'purple' },
      { id: 'app-3', name: 'Localhost:3000', cmd: 'http://localhost:3000', icon: 'globe', color: 'emerald' },
      { id: 'app-4', name: 'Docker Engine', cmd: 'C:\\Program Files\\Docker\\Docker Desktop.exe', icon: 'database', color: 'cyan' },
    ],
  },
  {
    id: 'drawer-design',
    title: 'Diagramming & Creative',
    collapsed: false,
    apps: [
      { id: 'app-5', name: 'Lucidchart', cmd: 'https://lucid.app', icon: 'share-2', color: 'amber' },
      { id: 'app-6', name: 'Figma Desktop', cmd: 'figma://', icon: 'figma', color: 'rose' },
      { id: 'app-7', name: 'Notion Workspace', cmd: 'notion://', icon: 'file-text', color: 'indigo' },
    ],
  },
  {
    id: 'drawer-comms',
    title: 'Communication & Media',
    collapsed: false,
    apps: [
      { id: 'app-8', name: 'Slack', cmd: 'slack://open', icon: 'message-square', color: 'purple' },
      { id: 'app-9', name: 'Spotify', cmd: 'spotify://', icon: 'music', color: 'emerald' },
      { id: 'app-10', name: 'Calculator', cmd: 'ms-calculator://', icon: 'cpu', color: 'cyan' },
    ],
  },
];

export const defaultFlowData: FlowchartState = {
  nodes: [
    { id: 'n1', type: 'start', text: 'Hotkey Pressed', x: 45, y: 35 },
    { id: 'n2', type: 'decision', text: 'Need Diagram or App?', x: 195, y: 120 },
    { id: 'n3', type: 'process', text: 'Launch from Dock', x: 40, y: 245 },
    { id: 'n4', type: 'process', text: 'Sync to Lucidchart', x: 265, y: 245 },
  ],
  edges: [
    { from: 'n1', to: 'n2' },
    { from: 'n2', to: 'n3' },
    { from: 'n2', to: 'n4' },
  ],
};

export const defaultNotes: NoteItem[] = [
  {
    id: 'note-1',
    title: 'Architecture & Sprint Ideas',
    body: '• Configure SideFlow shortcut to Alt + Space for instant slide-over access.\n• Use the Flowchart tab to sketch API flows and export Mermaid syntax directly into Lucidchart.\n• Click the microphone button above to dictate meeting notes hands-free.',
    updatedAt: Date.now(),
  },
  {
    id: 'note-2',
    title: 'Voice Dictation Scratchpad',
    body: 'Ready for voice capture...',
    updatedAt: Date.now(),
  },
];

export const defaultShortcut: ShortcutConfig = {
  alt: true,
  ctrl: false,
  shift: false,
  code: 'Space',
  key: ' ',
  label: 'Alt + Space',
};

export const DEFAULT_PANEL_WIDTH_PERCENT = 35;
export const MIN_PANEL_WIDTH_PERCENT = 15;
export const MAX_PANEL_WIDTH_PERCENT = 90;
export const PANEL_WIDTH_PRESETS = [25, 35, 50, 65, 75] as const;

export function clampPanelWidthPercent(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) {
    return DEFAULT_PANEL_WIDTH_PERCENT;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_PANEL_WIDTH_PERCENT;
  return Math.max(
    MIN_PANEL_WIDTH_PERCENT,
    Math.min(MAX_PANEL_WIDTH_PERCENT, Math.round(num))
  );
}

export const ELECTRON_WRAPPER_CODE = `// electron/main.ts — Electron Background Tray + Global Shortcut + Native App Launcher
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell, screen, dialog } = require('electron');
const { exec } = require('child_process');
const path = require('path');

let mainWindow;
let tray;
let isVisible = true;

app.whenReady().then(() => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // Create frameless transparent slide-over window docked to right edge
  mainWindow = new BrowserWindow({
    width: 560,
    height: height,
    x: width - 560,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  // Register Global OS Hotkey (Alt + Space)
  globalShortcut.register('Alt+Space', () => {
    if (isVisible) {
      mainWindow.hide();
      isVisible = false;
    } else {
      mainWindow.show();
      mainWindow.focus();
      isVisible = true;
    }
  });

  // Create System Tray Icon & Context Menu
  tray = new Tray(path.join(__dirname, 'icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Toggle SideFlow Panel (Alt+Space)', click: () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit SideFlow', click: () => app.quit() }
  ]);
  tray.setToolTip('SideFlow Utility Panel');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show());

  // Listen for Native App Launch Requests from the Dock Drawers
  ipcMain.handle('launch-native-app', async (event, command) => {
    if (command.startsWith('http') || command.includes('://')) {
      await shell.openExternal(command);
    } else {
      const err = await shell.openPath(command);
      if (err) exec(\`"\${command}"\`);
    }
  });
});`;
