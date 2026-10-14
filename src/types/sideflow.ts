export type AccentColor = 'indigo' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'purple';

export type TabId = 'drawers' | 'flowchart' | 'notes' | 'settings';

export interface AppItem {
  id: string;
  name: string;
  cmd: string;       // Full OS file path (C:\...\app.exe) or URI (vscode://)
  icon: string;      // Lucide icon name
  color: AccentColor;
}

export interface AppDrawer {
  id: string;
  title: string;
  collapsed: boolean;
  apps: AppItem[];
}

export type FlowNodeType = 'process' | 'decision' | 'start';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  text: string;
  x: number;
  y: number;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowchartState {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface NoteItem {
  id: string;
  title: string;
  body: string;
  updatedAt?: number;
}

export interface ShortcutConfig {
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  code?: string;
  key: string;
  label: string;     // e.g., "Alt + Space"
}

export interface ToastMessage {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
}

export interface SideFlowElectronBridge {
  isElectron: boolean;
  launchNativeApp: (command: string) => Promise<{ success: boolean; error?: string }>;
  updateGlobalShortcut: (accelerator: string) => Promise<boolean>;
  setPanelVisibility: (visible: boolean) => void;
  setIgnoreMouseEvents?: (ignore: boolean) => void;
  openFileDialog: () => Promise<string[]>;
  getPathForFile: (file: File) => string;
  onSetPanelVisibility: (callback: (visible: boolean) => void) => () => void;
  onSwitchTab: (callback: (tab: TabId) => void) => () => void;
  onWindowBlur: (callback: () => void) => () => void;
  storeGetAll: () => Promise<Record<string, unknown>>;
  storeSet: (key: string, value: unknown) => void;
}

declare global {
  interface Window {
    sideflow?: SideFlowElectronBridge;
    require?: (module: string) => {
      ipcRenderer?: {
        send: (channel: string, ...args: unknown[]) => void;
      };
    };
  }
}
