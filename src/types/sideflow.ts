export type AccentColor = 'indigo' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'purple';

export type TabId = 'drawers' | 'flowchart' | 'notes' | 'settings';

export type DockHoverEffect = 'zoom' | 'swing' | 'glow' | 'none';

export type DockIconSize = 'compact' | 'normal' | 'large';

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
  /** Selected display ID when mode === 'single' */
  targetDisplayId?: number | null;
  /** Enabled display IDs when mode === 'custom' */
  enabledDisplayIds?: number[];
  /** Optional per-monitor edge overrides keyed by String(displayId) */
  edgeOverrides?: Record<string, PanelEdge>;
}

export interface DisplayStatePayload {
  displays: MonitorDisplayInfo[];
  activeDisplayId: number;
  effectiveEdge: PanelEdge;
  monitorSettings: MonitorSettings;
}

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

export type NoteFormatMode = 'markdown' | 'adf';

export type AdfStatusColor =
  | 'neutral'
  | 'purple'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green';

export type AdfPanelType =
  | 'info'
  | 'note'
  | 'warning'
  | 'success'
  | 'error'
  | 'custom';

export type AdfMark =
  | { type: 'strong' }
  | { type: 'em' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'code' }
  | { type: 'subsup'; attrs: { type: 'sub' | 'sup' } }
  | { type: 'link'; attrs: { href: string; title?: string } }
  | { type: 'textColor'; attrs: { color: string } }
  | { type: 'backgroundColor'; attrs: { color: string } };

export type AdfBlockMark =
  | { type: 'alignment'; attrs: { align: 'center' | 'end' } }
  | { type: 'indentation'; attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 } };

export interface AdfTextNode {
  type: 'text';
  text: string;
  marks?: AdfMark[];
}

export interface AdfHardBreakNode {
  type: 'hardBreak';
  attrs?: { text?: '\n' };
}

export interface AdfStatusNode {
  type: 'status';
  attrs: {
    text: string;
    color: AdfStatusColor;
    localId?: string;
    style?: string;
  };
}

export interface AdfMentionNode {
  type: 'mention';
  attrs: {
    id: string;
    text?: string;
    accessLevel?: string;
    userType?: 'DEFAULT' | 'SPECIAL' | 'APP';
  };
}

export interface AdfEmojiNode {
  type: 'emoji';
  attrs: {
    shortName: string;
    id?: string;
    text?: string;
  };
}

export interface AdfDateNode {
  type: 'date';
  attrs: {
    timestamp: string;
  };
}

export interface AdfInlineCardNode {
  type: 'inlineCard';
  attrs: {
    url: string;
  };
}

export type AdfInlineNode =
  | AdfTextNode
  | AdfHardBreakNode
  | AdfStatusNode
  | AdfMentionNode
  | AdfEmojiNode
  | AdfDateNode
  | AdfInlineCardNode;

export interface AdfParagraphNode {
  type: 'paragraph';
  attrs?: { localId?: string };
  marks?: AdfBlockMark[];
  content?: AdfInlineNode[];
}

export interface AdfHeadingNode {
  type: 'heading';
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6; localId?: string };
  marks?: AdfBlockMark[];
  content?: AdfInlineNode[];
}

export interface AdfCodeBlockNode {
  type: 'codeBlock';
  attrs?: { language?: string; uniqueId?: string };
  content?: AdfTextNode[];
}

export interface AdfListItemNode {
  type: 'listItem';
  content: Array<
    AdfParagraphNode | AdfBulletListNode | AdfOrderedListNode | AdfCodeBlockNode
  >;
}

export interface AdfBulletListNode {
  type: 'bulletList';
  content: AdfListItemNode[];
}

export interface AdfOrderedListNode {
  type: 'orderedList';
  attrs?: { order?: number };
  content: AdfListItemNode[];
}

export interface AdfTaskItemNode {
  type: 'taskItem';
  attrs: { localId: string; state: 'TODO' | 'DONE' };
  content?: AdfInlineNode[];
}

export interface AdfTaskListNode {
  type: 'taskList';
  attrs: { localId: string };
  content: Array<AdfTaskItemNode | AdfTaskListNode>;
}

export interface AdfDecisionItemNode {
  type: 'decisionItem';
  attrs: { localId: string; state: 'DECIDED' | 'UNDECIDED' };
  content?: AdfInlineNode[];
}

export interface AdfDecisionListNode {
  type: 'decisionList';
  attrs: { localId: string };
  content: AdfDecisionItemNode[];
}

export interface AdfPanelNode {
  type: 'panel';
  attrs: {
    panelType: AdfPanelType;
    panelIcon?: string;
    panelColor?: string;
  };
  content: AdfBlockNode[];
}

export interface AdfBlockquoteNode {
  type: 'blockquote';
  content: AdfBlockNode[];
}

export interface AdfRuleNode {
  type: 'rule';
}

export interface AdfExpandNode {
  type: 'expand' | 'nestedExpand';
  attrs: { title?: string };
  content: AdfBlockNode[];
}

export interface AdfTableCellNode {
  type: 'tableCell' | 'tableHeader';
  attrs?: {
    colspan?: number;
    rowspan?: number;
    colwidth?: number[];
    background?: string;
  };
  content: AdfBlockNode[];
}

export interface AdfTableRowNode {
  type: 'tableRow';
  content: AdfTableCellNode[];
}

export interface AdfTableNode {
  type: 'table';
  attrs?: {
    isNumberColumnEnabled?: boolean;
    layout?: 'default' | 'wide' | 'full-width';
    localId?: string;
  };
  content: AdfTableRowNode[];
}

export interface AdfLayoutColumnNode {
  type: 'layoutColumn';
  attrs: { width: number };
  content: AdfBlockNode[];
}

export interface AdfLayoutSectionNode {
  type: 'layoutSection';
  content: AdfLayoutColumnNode[];
}

export interface AdfMediaNode {
  type: 'media';
  attrs: {
    type: 'external' | 'file' | 'link';
    url?: string;
    id?: string;
    collection?: string;
    alt?: string;
    width?: number;
    height?: number;
  };
}

export interface AdfMediaSingleNode {
  type: 'mediaSingle';
  attrs?: {
    layout?: 'center' | 'align-start' | 'align-end' | 'wide' | 'full-width';
    width?: number;
  };
  content: [AdfMediaNode];
}

export interface AdfBlockCardNode {
  type: 'blockCard';
  attrs: { url: string };
}

export type AdfBlockNode =
  | AdfParagraphNode
  | AdfHeadingNode
  | AdfBulletListNode
  | AdfOrderedListNode
  | AdfTaskListNode
  | AdfDecisionListNode
  | AdfPanelNode
  | AdfBlockquoteNode
  | AdfCodeBlockNode
  | AdfRuleNode
  | AdfExpandNode
  | AdfTableNode
  | AdfLayoutSectionNode
  | AdfMediaSingleNode
  | AdfBlockCardNode;

export interface AdfDocNode {
  version: 1;
  type: 'doc';
  content: AdfBlockNode[];
}

export interface NoteItem {
  id: string;
  title: string;
  body: string;
  format?: NoteFormatMode;
  adfDoc?: AdfDocNode;
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
  instantMode?: boolean;
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

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface NotifyOptions {
  variant?: ToastVariant;
  undoLabel?: string;
  onUndo?: () => void;
  durationMs?: number;
}

export type NotifyFn = (
  title: string,
  icon?: string,
  subtitle?: string,
  options?: NotifyOptions
) => void;

export interface ToastMessage {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  variant?: ToastVariant;
  undoLabel?: string;
  onUndo?: () => void;
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
  getDisplayState?: () => Promise<DisplayStatePayload>;
  setMonitorSettings?: (settings: MonitorSettings) => Promise<DisplayStatePayload>;
  activateDisplay?: (displayId: number, openPanel?: boolean) => Promise<DisplayStatePayload>;
  setEdgeHandleState?: (state: {
    showEdgeHandle: boolean;
    isDictating: boolean;
    shortcutLabel: string;
  }) => void;
  onDisplayStateChanged?: (
    callback: (state: DisplayStatePayload) => void
  ) => () => void;
  clickEdgeTab?: (displayId: number) => void;
  prepareEdgeTabClick?: () => void;
  setCompanionIgnoreMouse?: (displayId: number, ignore: boolean) => void;
  onEdgeTabUpdate?: (
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
  warmupLocalStt?: (payload?: {
    lang?: string;
    modelSize?: WhisperModelId;
    preferEngine?: SttEngineMode;
  }) => Promise<{
    success: boolean;
    engineUsed?: string;
    durationMs?: number;
    error?: string;
  }>;
  transcribeAudioLocal?: (payload: {
    pcm16Base64: string;
    sampleRate: number;
    lang: string;
    modelSize?: WhisperModelId;
    preferEngine?: SttEngineMode;
    promptContext?: string;
    lowLatency?: boolean;
    isPartial?: boolean;
    preTrimmed?: boolean;
    preNormalized?: boolean;
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

