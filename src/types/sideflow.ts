export type AccentColor = 'indigo' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'purple';

export type TabId = 'drawers' | 'flowchart' | 'notes' | 'settings';

export type DockHoverEffect = 'zoom' | 'swing' | 'glow' | 'none';

export type DockIconSize = 'compact' | 'normal' | 'large';

export type PanelEdge = 'left' | 'right';

export type DrawerSortMode = 'manual' | 'name' | 'type';

export interface AppItem {
  id: string;
  name: string;
  cmd: string;       // Full OS file path (C:\...\app.exe) or URI (vscode://)
  icon: string;      // Lucide icon name
  color: AccentColor;
  customIconUrl?: string;
  hotkey?: string;   // Optional custom shortcut (e.g. "Alt+1" or "Ctrl+Shift+V")
}

export interface SystemMetrics {
  cpuPercent: number;
  memPercent: number;
  memUsedGb: number;
  memTotalGb: number;
  uptimeHours: number;
}

export interface AppDrawer {
  id: string;
  title: string;
  collapsed: boolean;
  apps: AppItem[];
  folderPath?: string;
  sortBy?: DrawerSortMode;
}

export interface DirectoryEntryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  iconDataUrl?: string;
}

export type FlowNodeType =
  | 'process'
  | 'decision'
  | 'start'
  | 'database'
  | 'subroutine'
  | 'io'
  | 'circle'
  | 'hexagon'
  | 'asymmetric';

export type FlowEdgeStyle = 'solid' | 'dotted' | 'thick';

export type FlowEdgeCurve = 'bezier' | 'orthogonal' | 'straight';

export type FlowPortDirection = 'top' | 'right' | 'bottom' | 'left';

export type FlowEdgeArrow =
  | 'arrow'
  | 'none'
  | 'bidirectional'
  | 'circle'
  | 'cross';

export type FlowDirection = 'TD' | 'BT' | 'LR' | 'RL';

export type MermaidDiagramType =
  | 'flowchart'
  | 'stateDiagram-v2'
  | 'sequenceDiagram'
  | 'classDiagram'
  | 'erDiagram';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  text: string;
  x: number;
  y: number;
  color?: AccentColor;
  stereotype?: string;
  members?: string[];
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  style?: FlowEdgeStyle;
  arrow?: FlowEdgeArrow;
  cardinality?: string;
  curve?: FlowEdgeCurve;
}

export interface FlowSubgraph {
  id: string;
  title: string;
  nodeIds: string[];
}

export interface FlowchartState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  direction?: FlowDirection;
  subgraphs?: FlowSubgraph[];
  diagramType?: MermaidDiagramType;
  edgeCurve?: FlowEdgeCurve;
}

export interface FlowDiagramItem {
  id: string;
  title: string;
  flowData: FlowchartState;
  updatedAt: number;
}

export interface NoteItem {
  id: string;
  title: string;
  body: string;
  updatedAt?: number;
  pinned?: boolean;
  color?: AccentColor;
  tags?: string[];
}

export type SttEngineMode =
  | 'auto'
  | 'webgpu-whisper'
  | 'native-cuda'
  | 'native-cpu'
  | 'os-speech';

export type WhisperModelId =
  | 'moonshine-tiny'
  | 'moonshine-base'
  | 'tiny.en'
  | 'base.en'
  | 'distil-small.en'
  | 'distil-medium.en'
  | 'small.en'
  | 'tiny';

export interface SttSettings {
  lang: string;
  engineMode: SttEngineMode;
  modelSize: WhisperModelId;
  selectedMicId: string;
}

export interface LocalSttStatus {
  available: boolean;
  fasterWhisperAvailable: boolean;
  cudaAvailable: boolean;
  gpuName?: string;
  gpuVramMb?: number;
  cpuThreads?: number;
  windowsSapiAvailable: boolean;
  activeModel?: string;
}

export interface LocalTranscriptionResult {
  success: boolean;
  text?: string;
  engineUsed?: string;
  durationMs?: number;
  error?: string;
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

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  downloadPercent?: number;
  error?: string;
  lastCheckedAt?: number;
  canQuitAndInstall?: boolean;
}

export interface AutoLaunchState {
  enabled: boolean;
  isPackaged: boolean;
}

export interface SideFlowElectronBridge {
  isElectron: boolean;
  launchNativeApp: (command: string, args?: string[]) => Promise<{ success: boolean; error?: string }>;
  updateGlobalShortcut: (accelerator: string) => Promise<boolean>;
  setPanelVisibility: (visible: boolean) => void;
  setPanelEdge?: (edge: PanelEdge) => void;
  setPanelWidthPercent?: (widthPercent: number) => void;
  setIgnoreMouseEvents?: (ignore: boolean) => void;
  openFileDialog: () => Promise<string[]>;
  openDirectoryDialog?: () => Promise<string | null>;
  readDirectoryItems?: (dirPath: string) => Promise<DirectoryEntryItem[]>;
  extractFileIcon?: (filePath: string) => Promise<string | null>;
  resolveShortcutItem?: (rawPathOrName: string) => Promise<{
    name: string;
    cmd: string;
    args?: string;
    iconDataUrl: string | null;
  } | null>;
  getSystemMetrics?: () => Promise<SystemMetrics>;
  getRunningProcesses?: () => Promise<string[]>;
  getPathForFile: (file: File) => string;
  onSetPanelVisibility: (callback: (visible: boolean) => void) => () => void;
  onSwitchTab: (callback: (tab: TabId) => void) => () => void;
  onWindowBlur: (callback: () => void) => () => void;
  storeGetAll: () => Promise<Record<string, unknown>>;
  storeSet: (key: string, value: unknown) => void;
  getLocalSttStatus?: () => Promise<LocalSttStatus>;
  transcribeAudioLocal?: (payload: {
    pcm16Base64: string;
    sampleRate: number;
    lang: string;
    modelSize?: WhisperModelId;
    preferEngine?: SttEngineMode;
    promptContext?: string;
  }) => Promise<LocalTranscriptionResult>;
  getAutoLaunch?: () => Promise<AutoLaunchState>;
  setAutoLaunch?: (enabled: boolean) => Promise<AutoLaunchState>;
  getUpdateStatus?: () => Promise<AppUpdateState>;
  checkForUpdates?: () => Promise<AppUpdateState>;
  installUpdateNow?: () => Promise<{ success: boolean; error?: string }>;
  onUpdateStatus?: (callback: (state: AppUpdateState) => void) => () => void;
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

