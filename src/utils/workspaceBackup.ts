import type {
  AppDrawer,
  AppItem,
  DockHoverEffect,
  DockIconSize,
  FlowchartState,
  FlowDiagramItem,
  FlowEdge,
  FlowNode,
  MonitorSettings,
  NoteItem,
  PanelEdge,
  ShortcutConfig,
} from '../types/sideflow';
import {
  adfToMarkdown,
  markdownToAdf,
  validateAndNormalizeAdfDoc,
} from './adf';
import { clampPanelWidthPercent, sanitizeMonitorSettings } from './defaults';

export const MAX_BACKUP_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface NormalizedWorkspaceBackup {
  drawers?: AppDrawer[];
  flowData?: FlowchartState;
  savedDiagrams?: FlowDiagramItem[];
  activeDiagramId?: string;
  notes?: NoteItem[];
  activeNoteId?: string;
  notesViewMode?: string;
  shortcut?: ShortcutConfig;
  isPinned?: boolean;
  showEdgeHandle?: boolean;
  openAtLogin?: boolean;
  strictOfflineMode?: boolean;
  panelEdge?: PanelEdge;
  panelWidthPercent?: number;
  monitorSettings?: MonitorSettings;
  dockEffect?: DockHoverEffect;
  dockIconSize?: DockIconSize;
  isDockLocked?: boolean;
  showDocklets?: boolean;
  showMinimap?: boolean;
  spellcheckEnabled?: boolean;
  customDictionary?: string[];
  sttSettings?: Record<string, unknown>;
}

function isClientUncPath(rawInput: string): boolean {
  const trimmed = rawInput.trim().replace(/^["']|["']$/g, '').trim();
  if (/^(\\\\|\/\/)/.test(trimmed)) return true;
  if (/^file:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname && parsed.hostname.toLowerCase() !== 'localhost') {
        return true;
      }
    } catch {
      return /^file:\/\/[^/\\]/i.test(trimmed);
    }
  }
  return false;
}

function isSafeImportedCommand(cmd: string): boolean {
  const trimmed = cmd.replace(/[\r\n\0]/g, '').trim();
  if (!trimmed) return false;
  if (isClientUncPath(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:')
  ) {
    return false;
  }
  if (lower.startsWith('shell:')) {
    return (
      /^shell:appsfolder\\[A-Za-z0-9._!+-]+$/i.test(trimmed) ||
      /^shell:(recyclebinfolder|downloads)$/i.test(trimmed)
    );
  }
  return true;
}

function isValidFlowNode(raw: unknown): raw is FlowNode {
  if (!raw || typeof raw !== 'object') return false;
  const n = raw as Record<string, unknown>;
  return (
    typeof n.id === 'string' &&
    n.id.trim().length > 0 &&
    typeof n.text === 'string' &&
    typeof n.x === 'number' &&
    Number.isFinite(n.x) &&
    typeof n.y === 'number' &&
    Number.isFinite(n.y)
  );
}

function isValidFlowEdge(raw: unknown): raw is FlowEdge {
  if (!raw || typeof raw !== 'object') return false;
  const e = raw as Record<string, unknown>;
  return (
    typeof e.from === 'string' &&
    e.from.trim().length > 0 &&
    typeof e.to === 'string' &&
    e.to.trim().length > 0
  );
}

export function sanitizeImportedFlowchartState(
  raw: unknown
): FlowchartState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) {
    return null;
  }
  const nodes = candidate.nodes.filter(isValidFlowNode);
  if (candidate.nodes.length > 0 && nodes.length !== candidate.nodes.length) {
    return null;
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = candidate.edges.filter(
    (e): e is FlowEdge =>
      isValidFlowEdge(e) && nodeIds.has(e.from) && nodeIds.has(e.to)
  );
  if (candidate.edges.length > 0 && edges.length !== candidate.edges.length) {
    return null;
  }
  return {
    ...(candidate as unknown as FlowchartState),
    nodes,
    edges,
  };
}

export function isValidImportedShortcut(raw: unknown): raw is ShortcutConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const s = raw as Record<string, unknown>;
  if (typeof s.label !== 'string' || !s.label.trim()) return false;
  const hasModifier =
    s.ctrl === true ||
    s.alt === true ||
    s.shift === true ||
    (s as { meta?: boolean }).meta === true ||
    /\b(ctrl|control|alt|option|shift|cmd|command|super|meta)\b/i.test(s.label);
  const isFunctionKey =
    (typeof s.code === 'string' && /^F([1-9]|1[0-2])$/i.test(s.code)) ||
    /^F([1-9]|1[0-2])$/i.test(s.label.trim());
  return hasModifier || isFunctionKey;
}

function pickKey(
  obj: Record<string, unknown>,
  exportKey: string,
  storeKey: string
): unknown {
  if (Object.prototype.hasOwnProperty.call(obj, exportKey)) {
    return obj[exportKey];
  }
  if (Object.prototype.hasOwnProperty.call(obj, storeKey)) {
    return obj[storeKey];
  }
  return undefined;
}

/**
 * Validates and normalizes BOTH manual workspace JSON exports (`drawers`, `notes`, `flowData`, ...)
 * AND 7-day rolling store snapshots (`sideflow_drawers`, `sideflow_notes`, `sideflow_flow`, ...).
 */
export function normalizeWorkspaceBackupPayload(
  rawInput: string | Record<string, unknown>
): NormalizedWorkspaceBackup {
  let parsed: unknown;
  if (typeof rawInput === 'string') {
    if (rawInput.length > MAX_BACKUP_FILE_BYTES) {
      throw new Error('Backup file exceeds maximum 25 MB limit');
    }
    parsed = JSON.parse(rawInput);
  } else {
    parsed = rawInput;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid backup object');
  }

  const obj = parsed as Record<string, unknown>;
  const out: NormalizedWorkspaceBackup = {};
  let restoredAny = false;

  // 1. Drawers (supports empty array [])
  const rawDrawers = pickKey(obj, 'drawers', 'sideflow_drawers');
  if (
    Array.isArray(rawDrawers) &&
    rawDrawers.every(
      (d: unknown) =>
        Boolean(d) &&
        typeof d === 'object' &&
        typeof (d as AppDrawer).id === 'string' &&
        Array.isArray((d as AppDrawer).apps)
    )
  ) {
    out.drawers = (rawDrawers as AppDrawer[]).map((drawer) => ({
      ...drawer,
      title:
        typeof drawer.title === 'string'
          ? drawer.title.slice(0, 120)
          : 'Drawer',
      apps: (drawer.apps || [])
        .filter(
          (a): a is AppItem =>
            Boolean(a) &&
            typeof a === 'object' &&
            typeof a.id === 'string' &&
            typeof a.name === 'string' &&
            typeof a.cmd === 'string'
        )
        .map((a) => ({
          ...a,
          name: a.name.slice(0, 120),
          cmd: a.cmd.replace(/[\r\n\0]/g, '').trim(),
          ...(typeof a.args === 'string' && a.args.trim()
            ? { args: a.args.replace(/[\r\n\0]/g, '').trim().slice(0, 1024) }
            : {}),
        }))
        .filter((a) => isSafeImportedCommand(a.cmd)),
    }));
    restoredAny = true;
  }

  // 2. Flowchart active canvas
  const rawFlow = pickKey(obj, 'flowData', 'sideflow_flow');
  if (rawFlow !== undefined) {
    const cleanFlow = sanitizeImportedFlowchartState(rawFlow);
    if (cleanFlow) {
      out.flowData = cleanFlow;
      restoredAny = true;
    }
  }

  // 3. Saved Flowchart Diagrams library (supports empty array [])
  const rawDiagrams = pickKey(
    obj,
    'savedDiagrams',
    'sideflow_flow_diagrams_v1'
  );
  if (Array.isArray(rawDiagrams)) {
    const validDiagrams: FlowDiagramItem[] = [];
    let allValid = true;
    for (const item of rawDiagrams) {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof (item as FlowDiagramItem).id !== 'string' ||
        typeof (item as FlowDiagramItem).title !== 'string'
      ) {
        allValid = false;
        break;
      }
      const cleanDiagramFlow = sanitizeImportedFlowchartState(
        (item as FlowDiagramItem).flowData
      );
      if (!cleanDiagramFlow) {
        allValid = false;
        break;
      }
      validDiagrams.push({
        ...(item as FlowDiagramItem),
        title: (item as FlowDiagramItem).title.slice(0, 160),
        flowData: cleanDiagramFlow,
      });
    }
    if (allValid) {
      out.savedDiagrams = validDiagrams;
      restoredAny = true;
    }
  }

  const rawActiveDiag = pickKey(
    obj,
    'activeDiagramId',
    'sideflow_active_diagram_id'
  );
  if (typeof rawActiveDiag === 'string' && rawActiveDiag.trim()) {
    out.activeDiagramId = rawActiveDiag.trim();
    restoredAny = true;
  }

  // 4. Notes (supports empty array [])
  const rawNotes = pickKey(obj, 'notes', 'sideflow_notes');
  if (
    Array.isArray(rawNotes) &&
    rawNotes.every(
      (n: unknown) =>
        Boolean(n) &&
        typeof n === 'object' &&
        typeof (n as NoteItem).id === 'string' &&
        typeof (n as NoteItem).body === 'string'
    )
  ) {
    out.notes = (rawNotes as NoteItem[]).map((rawNote) => {
      const safeTitle =
        typeof rawNote.title === 'string' ? rawNote.title : 'Untitled Note';
      const safeTags = Array.isArray(rawNote.tags)
        ? rawNote.tags.filter((t): t is string => typeof t === 'string')
        : undefined;
      if (rawNote.format === 'adf') {
        const validated = rawNote.adfDoc
          ? validateAndNormalizeAdfDoc(rawNote.adfDoc)
          : null;
        const resolvedDoc =
          validated && validated.valid
            ? validated.doc
            : markdownToAdf(rawNote.body);
        return {
          ...rawNote,
          title: safeTitle,
          tags: safeTags,
          format: 'adf',
          adfDoc: resolvedDoc,
          body: rawNote.body || adfToMarkdown(resolvedDoc),
        };
      }
      const { adfDoc: _discardedAdfDoc, ...restNote } = rawNote;
      void _discardedAdfDoc;
      return {
        ...restNote,
        title: safeTitle,
        tags: safeTags,
        format: rawNote.format === 'markdown' ? 'markdown' : undefined,
      };
    });
    restoredAny = true;
  }

  const rawActiveNoteId = pickKey(
    obj,
    'activeNoteId',
    'sideflow_active_note_id'
  );
  if (typeof rawActiveNoteId === 'string' && rawActiveNoteId.trim()) {
    out.activeNoteId = rawActiveNoteId.trim();
    restoredAny = true;
  }

  const rawNotesViewMode = pickKey(
    obj,
    'notesViewMode',
    'sideflow_notes_view_mode'
  );
  if (typeof rawNotesViewMode === 'string' && rawNotesViewMode.trim()) {
    out.notesViewMode = rawNotesViewMode.trim();
    restoredAny = true;
  }

  // 5. Shortcut (requires modifier or F-key)
  const rawShortcut = pickKey(obj, 'shortcut', 'sideflow_shortcut');
  if (isValidImportedShortcut(rawShortcut)) {
    out.shortcut = rawShortcut;
    restoredAny = true;
  }

  // 6. Booleans, layout & preferences
  const rawPinned = pickKey(obj, 'isPinned', 'sideflow_pinned');
  if (typeof rawPinned === 'boolean') {
    out.isPinned = rawPinned;
    restoredAny = true;
  }

  const rawEdgeHandle = pickKey(obj, 'showEdgeHandle', 'sideflow_edge_handle');
  if (typeof rawEdgeHandle === 'boolean') {
    out.showEdgeHandle = rawEdgeHandle;
    restoredAny = true;
  }

  const rawOpenAtLogin = pickKey(obj, 'openAtLogin', 'sideflow_open_at_login');
  if (typeof rawOpenAtLogin === 'boolean') {
    out.openAtLogin = rawOpenAtLogin;
    restoredAny = true;
  }

  const rawStrictOffline = pickKey(
    obj,
    'strictOfflineMode',
    'sideflow_strict_offline'
  );
  if (typeof rawStrictOffline === 'boolean') {
    out.strictOfflineMode = rawStrictOffline;
    restoredAny = true;
  }

  const rawPanelEdge = pickKey(obj, 'panelEdge', 'sideflow_panel_edge');
  if (rawPanelEdge === 'left' || rawPanelEdge === 'right') {
    out.panelEdge = rawPanelEdge;
    restoredAny = true;
  }

  const rawPanelWidth = pickKey(
    obj,
    'panelWidthPercent',
    'sideflow_panel_width_percent'
  );
  if (typeof rawPanelWidth === 'number' && Number.isFinite(rawPanelWidth)) {
    out.panelWidthPercent = clampPanelWidthPercent(rawPanelWidth);
    restoredAny = true;
  }

  const rawMonitors = pickKey(
    obj,
    'monitorSettings',
    'sideflow_monitor_settings'
  );
  if (rawMonitors && typeof rawMonitors === 'object' && !Array.isArray(rawMonitors)) {
    out.monitorSettings = sanitizeMonitorSettings(
      rawMonitors as MonitorSettings
    );
    restoredAny = true;
  }

  const rawDockEffect = pickKey(obj, 'dockEffect', 'sideflow_dock_effect');
  if (
    rawDockEffect === 'zoom' ||
    rawDockEffect === 'swing' ||
    rawDockEffect === 'glow' ||
    rawDockEffect === 'none'
  ) {
    out.dockEffect = rawDockEffect;
    restoredAny = true;
  }

  const rawDockSize = pickKey(obj, 'dockIconSize', 'sideflow_dock_size');
  if (
    rawDockSize === 'compact' ||
    rawDockSize === 'normal' ||
    rawDockSize === 'large'
  ) {
    out.dockIconSize = rawDockSize;
    restoredAny = true;
  }

  const rawDockLocked = pickKey(obj, 'isDockLocked', 'sideflow_lock_icons');
  if (typeof rawDockLocked === 'boolean') {
    out.isDockLocked = rawDockLocked;
    restoredAny = true;
  }

  const rawShowDocklets = pickKey(
    obj,
    'showDocklets',
    'sideflow_show_docklets'
  );
  if (typeof rawShowDocklets === 'boolean') {
    out.showDocklets = rawShowDocklets;
    restoredAny = true;
  }

  const rawShowMinimap = pickKey(obj, 'showMinimap', 'sideflow_flow_minimap');
  if (typeof rawShowMinimap === 'boolean') {
    out.showMinimap = rawShowMinimap;
    restoredAny = true;
  }

  const rawSpellcheck = pickKey(
    obj,
    'spellcheckEnabled',
    'sideflow_spellcheck_enabled'
  );
  if (typeof rawSpellcheck === 'boolean') {
    out.spellcheckEnabled = rawSpellcheck;
    restoredAny = true;
  }

  const rawCustomDict = pickKey(
    obj,
    'customDictionary',
    'sideflow_custom_dictionary'
  );
  if (Array.isArray(rawCustomDict)) {
    out.customDictionary = rawCustomDict
      .filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
      .map((w) => w.trim().slice(0, 80));
    restoredAny = true;
  }

  const rawSttSettings = pickKey(obj, 'sttSettings', 'sideflow_stt_settings');
  if (
    rawSttSettings &&
    typeof rawSttSettings === 'object' &&
    !Array.isArray(rawSttSettings)
  ) {
    out.sttSettings = rawSttSettings as Record<string, unknown>;
    restoredAny = true;
  }

  if (!restoredAny) {
    throw new Error('No SideFlow workspace keys found');
  }

  return out;
}
