import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search,
  X,
  GitBranch,
  FileText,
  Sliders,
  Grid,
  Pin,
  PanelLeft,
  PanelRight,
  Lock,
  Unlock,
  Download,
  RefreshCw,
  EyeOff,
  Plus,
  LayoutGrid,
  CornerDownLeft,
  Sparkles,
} from 'lucide-react';
import {
  AccentColor,
  AppDrawer,
  AppItem,
  FlowchartState,
  FlowDiagramItem,
  NoteItem,
  PanelEdge,
  TabId,
} from '../types/sideflow';
import { defaultFlowData } from '../utils/defaults';
import { extractFilenameFromPath, sortDrawerApps } from '../utils/fileMeta';
import { getMermaidTemplatePreset } from '../utils/mermaid';
import { DynamicIcon } from './DynamicIcon';
import { Modal } from './Modal';

export type CommandCategory = 'all' | 'apps' | 'flows' | 'notes' | 'actions';

type CommandSection = 'apps' | 'flows' | 'notes' | 'actions';

interface CommandItem {
  id: string;
  section: CommandSection;
  title: string;
  subtitle: string;
  rawBodyForSnippet?: string;
  keywords: string;
  badge?: string;
  shortcutHint?: string;
  accent?: AccentColor;
  iconName?: string;
  customIconUrl?: string;
  renderIcon?: () => React.ReactNode;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  drawers: AppDrawer[];
  notes: NoteItem[];
  activeNoteId: string;
  flowData: FlowchartState;
  activeTab: TabId;
  isPinned: boolean;
  panelEdge: PanelEdge;
  isDockLocked: boolean;
  shortcutLabel: string;
  onLaunchApp: (app: AppItem, drawerTitle: string) => void;
  onSelectDiagram: (diagram: FlowDiagramItem) => void;
  onCreateDiagram: () => void;
  onAutoLayoutFlow: () => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
  onSelectTab: (tab: TabId) => void;
  onTogglePin: () => void;
  onChangePanelEdge: (edge: PanelEdge) => void;
  onToggleDockLock: () => void;
  onExportBackup: () => void;
  onCheckForUpdates: () => void;
  onClosePanel: () => void;
}

const ACCENT_ICON_BADGE: Record<AccentColor, string> = {
  indigo: 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300',
  cyan: 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300',
  emerald: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300',
  amber: 'bg-amber-500/20 border-amber-400/40 text-amber-300',
  rose: 'bg-rose-500/20 border-rose-400/40 text-rose-300',
  purple: 'bg-purple-500/20 border-purple-400/40 text-purple-300',
};

const SECTION_LABELS: Record<CommandSection, string> = {
  apps: 'Applications',
  flows: 'Flowchart Studio',
  notes: 'Notes & Scratchpad',
  actions: 'Workspace & Settings',
};

const SECTION_ORDER: CommandSection[] = ['apps', 'flows', 'notes', 'actions'];

export function isSafeCustomIconUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('\\\\')) {
    return false;
  }
  if (
    /^data:image\/(?:png|jpeg|jpg|webp|gif|x-icon|vnd\.microsoft\.icon|svg\+xml)[;,]/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (/^blob:/i.test(trimmed)) {
    return true;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }
  return false;
}

function isSubsequenceMatch(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let ni = 0;
  for (let hi = 0; hi < haystack.length && ni < needle.length; hi++) {
    if (haystack[hi] === needle[ni]) {
      ni++;
    }
  }
  return ni === needle.length;
}

function scoreCommandItem(
  rawQuery: string,
  title: string,
  subtitle: string,
  keywords: string
): number {
  const trimmed = rawQuery.trim().toLowerCase();
  if (!trimmed) return 1;

  const titleLower = title.toLowerCase();
  const subLower = subtitle.toLowerCase();
  const kwLower = keywords.toLowerCase();
  const tokens = trimmed.split(/\s+/).filter(Boolean);

  let totalScore = 0;
  for (const token of tokens) {
    if (titleLower === token) {
      totalScore += 140;
    } else if (titleLower.startsWith(token)) {
      totalScore += 100;
    } else if (
      titleLower.includes(` ${token}`) ||
      titleLower.includes(`-${token}`) ||
      titleLower.includes(`/${token}`)
    ) {
      totalScore += 80;
    } else if (titleLower.includes(token)) {
      totalScore += 60;
    } else if (kwLower.includes(token)) {
      totalScore += 35;
    } else if (subLower.includes(token)) {
      totalScore += 25;
    } else if (
      token.length >= 2 &&
      isSubsequenceMatch(
        token.replace(/[^a-z0-9]/g, ''),
        titleLower.replace(/[^a-z0-9]/g, '')
      )
    ) {
      totalScore += 14;
    } else {
      return 0;
    }
  }

  return totalScore;
}

function buildNoteSnippet(body: string, rawQuery: string): string {
  const clean = body
    .replace(/```[\s\S]*?```/g, '[Mermaid/Code Block]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'Empty scratchpad note';
  const queryToken = rawQuery.trim().toLowerCase().split(/\s+/)[0] || '';
  if (queryToken) {
    const matchIdx = clean.toLowerCase().indexOf(queryToken);
    if (matchIdx > 28) {
      const start = Math.max(0, matchIdx - 20);
      return `…${clean.slice(start, start + 76)}${
        start + 76 < clean.length ? '…' : ''
      }`;
    }
  }
  return clean.length > 78 ? `${clean.slice(0, 78)}…` : clean;
}

function extractNoteTags(note: NoteItem, safeBody: string): string[] {
  const tagSet = new Set<string>();
  if (Array.isArray(note.tags)) {
    for (const raw of note.tags) {
      if (typeof raw === 'string' && raw.trim()) {
        const clean = raw.trim();
        tagSet.add(clean.startsWith('#') ? clean : `#${clean}`);
      }
    }
  }
  const matches = safeBody.match(/(?:^|\s)(#[a-zA-Z0-9_-]+)/g);
  if (matches) {
    for (const m of matches) {
      tagSet.add(m.trim());
    }
  }
  return Array.from(tagSet);
}

function isValidSavedDiagram(candidate: unknown): candidate is FlowDiagramItem {
  if (!candidate || typeof candidate !== 'object') return false;
  const item = candidate as Partial<FlowDiagramItem>;
  if (typeof item.id !== 'string' || !item.id) return false;
  if (typeof item.title !== 'string' || !item.title) return false;
  if (!item.flowData || typeof item.flowData !== 'object') return false;
  return (
    Array.isArray(item.flowData.nodes) && Array.isArray(item.flowData.edges)
  );
}

function readSavedDiagramsSnapshot(
  activeFlowData: FlowchartState
): { diagrams: FlowDiagramItem[]; activeDiagramId: string } {
  let activeDiagramId = 'flow-1';
  try {
    const rawActive = window.localStorage.getItem('sideflow_active_diagram_id');
    if (rawActive) {
      const parsedId = JSON.parse(rawActive);
      if (typeof parsedId === 'string' && parsedId) {
        activeDiagramId = parsedId;
      }
    }
  } catch {
    // ignore
  }

  try {
    const rawDiagrams = window.localStorage.getItem('sideflow_flow_diagrams_v1');
    if (rawDiagrams) {
      const parsed = JSON.parse(rawDiagrams);
      if (Array.isArray(parsed)) {
        const validDiagrams = parsed.filter(isValidSavedDiagram);
        if (validDiagrams.length > 0) {
          return { diagrams: validDiagrams, activeDiagramId };
        }
      }
    }
  } catch {
    // ignore
  }

  const fallbackDiagrams: FlowDiagramItem[] = [
    {
      id: 'flow-1',
      title: 'Hotkey Launch Flow',
      flowData: activeFlowData || defaultFlowData,
      updatedAt: Date.now(),
    },
    {
      id: 'flow-2',
      title: 'CI/CD Deployment Pipeline',
      flowData: getMermaidTemplatePreset('ci-cd') || defaultFlowData,
      updatedAt: Date.now() - 60000,
    },
  ];
  return { diagrams: fallbackDiagrams, activeDiagramId };
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  drawers,
  notes,
  activeNoteId,
  flowData,
  activeTab,
  isPinned,
  panelEdge,
  isDockLocked,
  shortcutLabel,
  onLaunchApp,
  onSelectDiagram,
  onCreateDiagram,
  onAutoLayoutFlow,
  onSelectNote,
  onCreateNote,
  onSelectTab,
  onTogglePin,
  onChangePanelEdge,
  onToggleDockLock,
  onExportBackup,
  onCheckForUpdates,
  onClosePanel,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CommandCategory>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const lastPointerPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setCategory('all');
      setActiveIndex(0);
      lastPointerPosRef.current = null;
    }
  }, [isOpen]);

  // Read saved diagrams once per palette open / flowData update rather than per keystroke
  const savedDiagramsSnapshot = useMemo(
    () =>
      isOpen
        ? readSavedDiagramsSnapshot(flowData)
        : { diagrams: [], activeDiagramId: 'flow-1' },
    [isOpen, flowData]
  );

  const allItems = useMemo<CommandItem[]>(() => {
    if (!isOpen) return [];

    const items: CommandItem[] = [];

    // 1. Applications across all Dock Drawers (respecting drawer sortBy for Alt+1..9 parity)
    let visibleIdx = 0;
    for (const drawer of drawers) {
      const sortedApps = sortDrawerApps(drawer.apps, drawer.sortBy);
      for (const app of sortedApps) {
        const quickBadge =
          app.hotkey?.trim() ||
          (!drawer.collapsed && visibleIdx < 9
            ? `Alt+${visibleIdx + 1}`
            : undefined);
        if (!drawer.collapsed) {
          visibleIdx++;
        }
        items.push({
          id: `app-${drawer.id}-${app.id}`,
          section: 'apps',
          title: app.name,
          subtitle: `${drawer.title} • ${extractFilenameFromPath(app.cmd)}`,
          keywords: `launch open run app ${drawer.title} ${app.cmd} ${
            quickBadge || ''
          }`,
          shortcutHint: quickBadge,
          accent: app.color || 'indigo',
          iconName: app.icon || 'rocket',
          customIconUrl: isSafeCustomIconUrl(app.customIconUrl)
            ? app.customIconUrl
            : undefined,
          onSelect: () => {
            onClose();
            onLaunchApp(app, drawer.title);
          },
        });
      }
    }

    // 2. Saved Flowchart Diagrams + Studio Actions
    const { diagrams, activeDiagramId } = savedDiagramsSnapshot;
    for (const diag of diagrams) {
      const isCurrent = diag.id === activeDiagramId;
      const nodeCount = diag.flowData.nodes.length;
      const diagType = diag.flowData.diagramType || 'flowchart';
      items.push({
        id: `flow-diag-${diag.id}`,
        section: 'flows',
        title: diag.title,
        subtitle: `${nodeCount} nodes • ${diagType}`,
        keywords: `flowchart diagram mermaid graph architecture switch ${diagType} ${diag.title}`,
        badge: isCurrent ? 'Active Flow' : 'Saved Flow',
        accent: isCurrent ? 'cyan' : 'indigo',
        renderIcon: () => <GitBranch className="w-4 h-4" aria-hidden="true" />,
        onSelect: () => {
          onClose();
          onSelectDiagram(diag);
        },
      });
    }

    items.push({
      id: 'flow-action-new',
      section: 'flows',
      title: 'New Blank Flowchart Diagram',
      subtitle: 'Create a fresh Mermaid diagram in Flowchart Studio',
      keywords: 'create add new flowchart diagram canvas mermaid',
      accent: 'emerald',
      renderIcon: () => <Plus className="w-4 h-4" aria-hidden="true" />,
      onSelect: () => {
        onClose();
        onCreateDiagram();
      },
    });

    items.push({
      id: 'flow-action-autolayout',
      section: 'flows',
      title: 'Auto-Layout Active Flowchart (DAG)',
      subtitle: `Tidy ${flowData.nodes.length} nodes along ${
        flowData.direction || 'TD'
      } hierarchy`,
      keywords: 'auto layout arrange tidy dag align flowchart nodes',
      accent: 'purple',
      renderIcon: () => <LayoutGrid className="w-4 h-4" aria-hidden="true" />,
      onSelect: () => {
        onClose();
        onAutoLayoutFlow();
      },
    });

    // 3. Notes & Scratchpad Items
    const sortedNotes = [...notes].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });

    for (const note of sortedNotes) {
      const safeBody = typeof note.body === 'string' ? note.body : '';
      const tags = extractNoteTags(note, safeBody);
      const isCurrentNote = note.id === activeNoteId;
      items.push({
        id: `note-${note.id}`,
        section: 'notes',
        title: note.title || 'Untitled Note',
        subtitle: buildNoteSnippet(safeBody, ''),
        rawBodyForSnippet: safeBody,
        keywords: `note markdown scratchpad ${tags.join(' ')} ${safeBody.slice(
          0,
          600
        )}`,
        badge: note.pinned
          ? 'Pinned Note'
          : tags[0] || (isCurrentNote ? 'Active' : undefined),
        accent: note.pinned ? 'amber' : 'cyan',
        renderIcon: () => <FileText className="w-4 h-4" aria-hidden="true" />,
        onSelect: () => {
          onClose();
          onSelectNote(note.id);
        },
      });
    }

    items.push({
      id: 'note-action-new',
      section: 'notes',
      title: 'Create New Scratchpad Note',
      subtitle: 'Open Notes tab with a fresh Markdown scratchpad',
      keywords: 'new create add note scratchpad markdown voice memo',
      accent: 'emerald',
      renderIcon: () => <Plus className="w-4 h-4" aria-hidden="true" />,
      onSelect: () => {
        onClose();
        onCreateNote();
      },
    });

    // 4. Workspace Navigation & System Settings Actions
    items.push(
      {
        id: 'action-tab-drawers',
        section: 'actions',
        title: 'Switch to App Drawers Dock',
        subtitle: 'Browse application drawers and live system telemetry',
        keywords: 'tab dock drawers apps launcher home',
        badge: activeTab === 'drawers' ? 'Current' : undefined,
        shortcutHint: 'Ctrl+1',
        accent: 'indigo',
        renderIcon: () => <Grid className="w-4 h-4" aria-hidden="true" />,
        onSelect: () => {
          onClose();
          onSelectTab('drawers');
        },
      },
      {
        id: 'action-tab-flowchart',
        section: 'actions',
        title: 'Switch to Flowchart Studio',
        subtitle: 'Visual Mermaid diagram editor, minimap, and PNG/SVG export',
        keywords: 'tab flow flowchart mermaid diagram canvas',
        badge: activeTab === 'flowchart' ? 'Current' : undefined,
        shortcutHint: 'Ctrl+2',
        accent: 'cyan',
        renderIcon: () => <GitBranch className="w-4 h-4" aria-hidden="true" />,
        onSelect: () => {
          onClose();
          onSelectTab('flowchart');
        },
      },
      {
        id: 'action-tab-notes',
        section: 'actions',
        title: 'Switch to Quick Notes & Voice',
        subtitle: 'Markdown scratchpad with offline Whisper & Web Speech dictation',
        keywords: 'tab notes voice dictation markdown whisper',
        badge: activeTab === 'notes' ? 'Current' : undefined,
        shortcutHint: 'Ctrl+3',
        accent: 'amber',
        renderIcon: () => <FileText className="w-4 h-4" aria-hidden="true" />,
        onSelect: () => {
          onClose();
          onSelectTab('notes');
        },
      },
      {
        id: 'action-tab-settings',
        section: 'actions',
        title: 'Open Config & Workspace Settings',
        subtitle: 'Configure global hotkeys, multi-monitor rules, and backups',
        keywords: 'tab config settings preferences hotkey monitor backup',
        badge: activeTab === 'settings' ? 'Current' : undefined,
        shortcutHint: 'Ctrl+4',
        accent: 'purple',
        renderIcon: () => <Sliders className="w-4 h-4" aria-hidden="true" />,
        onSelect: () => {
          onClose();
          onSelectTab('settings');
        },
      },
      {
        id: 'action-toggle-pin',
        section: 'actions',
        title: isPinned
          ? 'Switch Panel to Auto-Hide Mode'
          : 'Pin Panel Open on Desktop',
        subtitle: isPinned
          ? 'Currently Pinned — auto-collapse when clicking outside'
          : 'Currently Auto-Hide — keep SideFlow anchored open',
        keywords: 'pin unpin autohide auto-hide stay open collapse',
        badge: isPinned ? 'Pinned' : 'Auto-Hide',
        accent: isPinned ? 'amber' : 'indigo',
        renderIcon: () => <Pin className="w-4 h-4" aria-hidden="true" />,
        onSelect: () => {
          onClose();
          onTogglePin();
        },
      },
      {
        id: 'action-dock-left',
        section: 'actions',
        title: 'Dock Panel to Left Screen Edge',
        subtitle: 'Anchor SideFlow slide-out drawer on the left bezel',
        keywords: 'dock left edge screen position bezel anchor',
        badge: panelEdge === 'left' ? 'Active Edge' : undefined,
        accent: 'cyan',
        renderIcon: () => <PanelLeft className="w-4 h-4" aria-hidden="true" />,
        onSelect: () => {
          onClose();
          onChangePanelEdge('left');
        },
      },
      {
        id: 'action-dock-right',
        section: 'actions',
        title: 'Dock Panel to Right Screen Edge',
        subtitle: 'Anchor SideFlow slide-out drawer on the right bezel',
        keywords: 'dock right edge screen position bezel anchor',
        badge: panelEdge === 'right' ? 'Active Edge' : undefined,
        accent: 'cyan',
        renderIcon: () => <PanelRight className="w-4 h-4" aria-hidden="true" />,
        onSelect: () => {
          onClose();
          onChangePanelEdge('right');
        },
      },
      {
        id: 'action-toggle-dock-lock',
        section: 'actions',
        title: isDockLocked ? 'Unlock Dock App Tiles' : 'Lock Dock App Tiles',
        subtitle: isDockLocked
          ? 'Re-enable drag-and-drop reordering and tile edits'
          : 'Prevent accidental drag reordering or tile deletion',
        keywords: 'lock unlock dock icons tiles drag',
        badge: isDockLocked ? 'Locked' : 'Unlocked',
        accent: 'rose',
        renderIcon: () =>
          isDockLocked ? (
            <Unlock className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Lock className="w-4 h-4" aria-hidden="true" />
          ),
        onSelect: () => {
          onClose();
          onToggleDockLock();
        },
      },
      {
        id: 'action-export-backup',
        section: 'actions',
        title: 'Export Workspace Backup (.json)',
        subtitle: 'Download all drawers, saved flowcharts, notes, and settings',
        keywords: 'export save download backup json configuration',
        accent: 'emerald',
        renderIcon: () => <Download className="w-4 h-4" aria-hidden="true" />,
        onSelect: () => {
          onClose();
          onExportBackup();
        },
      },
      {
        id: 'action-check-updates',
        section: 'actions',
        title: 'Check for SideFlow Updates',
        subtitle: 'Query GitHub Releases for newer desktop builds',
        keywords: 'update upgrade version release github check',
        accent: 'indigo',
        renderIcon: () => <RefreshCw className="w-4 h-4" aria-hidden="true" />,
        onSelect: () => {
          onClose();
          onCheckForUpdates();
        },
      },
      {
        id: 'action-hide-panel',
        section: 'actions',
        title: 'Hide Panel to System Tray',
        subtitle: 'Collapse SideFlow off-screen until summoned again',
        keywords: 'hide close minimize collapse system tray',
        shortcutHint: shortcutLabel,
        accent: 'purple',
        renderIcon: () => <EyeOff className="w-4 h-4" aria-hidden="true" />,
        onSelect: () => {
          onClose();
          onClosePanel();
        },
      }
    );

    return items;
  }, [
    isOpen,
    drawers,
    notes,
    activeNoteId,
    flowData,
    savedDiagramsSnapshot,
    activeTab,
    isPinned,
    panelEdge,
    isDockLocked,
    shortcutLabel,
    onClose,
    onLaunchApp,
    onSelectDiagram,
    onCreateDiagram,
    onAutoLayoutFlow,
    onSelectNote,
    onCreateNote,
    onSelectTab,
    onTogglePin,
    onChangePanelEdge,
    onToggleDockLock,
    onExportBackup,
    onCheckForUpdates,
    onClosePanel,
  ]);

  const { orderedItems, groupedSections, categoryCounts } = useMemo(() => {
    const counts: Record<CommandCategory, number> = {
      all: 0,
      apps: 0,
      flows: 0,
      notes: 0,
      actions: 0,
    };

    const hasQuery = query.trim().length > 0;
    const scoredAll: Array<{ item: CommandItem; score: number }> = [];
    for (const item of allItems) {
      const score = scoreCommandItem(
        query,
        item.title,
        item.subtitle,
        item.keywords
      );
      if (score > 0) {
        const displayItem =
          hasQuery && item.rawBodyForSnippet !== undefined
            ? {
                ...item,
                subtitle: buildNoteSnippet(item.rawBodyForSnippet, query),
              }
            : item;
        scoredAll.push({ item: displayItem, score });
        counts.all += 1;
        counts[item.section] += 1;
      }
    }

    const filtered = scoredAll.filter(
      ({ item }) => category === 'all' || item.section === category
    );

    if (hasQuery) {
      filtered.sort((a, b) => b.score - a.score);
    }

    const sectionsMap = new Map<
      CommandSection,
      Array<{ item: CommandItem; flatIndex: number }>
    >();

    const activeSectionOrder = hasQuery
      ? [...SECTION_ORDER].sort((secA, secB) => {
          const bestA =
            filtered.find((entry) => entry.item.section === secA)?.score ?? 0;
          const bestB =
            filtered.find((entry) => entry.item.section === secB)?.score ?? 0;
          return bestB - bestA;
        })
      : SECTION_ORDER;

    const flat: CommandItem[] = [];
    for (const sec of activeSectionOrder) {
      const matchingInSec = filtered.filter(
        (entry) => entry.item.section === sec
      );
      if (matchingInSec.length === 0) continue;
      const bucket: Array<{ item: CommandItem; flatIndex: number }> = [];
      for (const entry of matchingInSec) {
        const flatIndex = flat.length;
        flat.push(entry.item);
        bucket.push({ item: entry.item, flatIndex });
      }
      sectionsMap.set(sec, bucket);
    }

    return {
      orderedItems: flat,
      groupedSections: Array.from(sectionsMap.entries()),
      categoryCounts: counts,
    };
  }, [allItems, query, category]);

  const safeActiveIndex =
    orderedItems.length === 0
      ? -1
      : Math.min(Math.max(0, activeIndex), orderedItems.length - 1);

  const activeItem =
    safeActiveIndex >= 0 ? orderedItems[safeActiveIndex] : undefined;

  useEffect(() => {
    if (!isOpen || !activeItem) return;
    const optionEl = document.getElementById(`cmd-option-${activeItem.id}`);
    optionEl?.scrollIntoView?.({ block: 'nearest' });
  }, [isOpen, activeItem]);

  const handleNavigationKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.target !== inputRef.current) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (orderedItems.length > 0) {
          setActiveIndex((prev) => (prev + 1) % orderedItems.length);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (orderedItems.length > 0) {
          setActiveIndex(
            (prev) => (prev - 1 + orderedItems.length) % orderedItems.length
          );
        }
      } else if (e.key === 'Home' && e.ctrlKey) {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End' && e.ctrlKey) {
        e.preventDefault();
        if (orderedItems.length > 0) {
          setActiveIndex(orderedItems.length - 1);
        }
      } else if (e.key === 'Enter') {
        if (activeItem) {
          e.preventDefault();
          activeItem.onSelect();
        }
      }
    },
    [orderedItems.length, activeItem]
  );

  const filterTabs: Array<{ id: CommandCategory; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'apps', label: 'Apps' },
    { id: 'flows', label: 'Flows' },
    { id: 'notes', label: 'Notes' },
    { id: 'actions', label: 'Commands' },
  ];

  const hasResults = groupedSections.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="SideFlow Command Palette"
      id="command-palette-modal"
      dataTestId="command-palette-modal"
      maxWidthClass="max-w-xl"
      panelClassName="border-indigo-500/40 bg-slate-900/95 backdrop-blur-xl !p-0 overflow-hidden shadow-[0_24px_64px_rgba(2,6,23,0.85)]"
      initialFocusRef={inputRef}
    >
      <div
        onKeyDown={handleNavigationKeyDown}
        className="flex flex-col max-h-[min(78vh,540px)]"
      >
        {/* Top Combobox Search Bar */}
        <div className="px-4 py-3 border-b border-slate-800/90 bg-slate-950/70 flex items-center gap-2.5">
          <Search
            className="w-4 h-4 text-indigo-400 shrink-0"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            id="command-palette-input"
            data-testid="command-palette-input"
            type="text"
            role="combobox"
            aria-expanded={hasResults}
            aria-autocomplete="list"
            aria-controls="command-palette-listbox"
            aria-activedescendant={
              activeItem ? `cmd-option-${activeItem.id}` : undefined
            }
            aria-label="Search apps, flowcharts, notes, and workspace commands"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search apps, saved flowcharts, notes, #tags, or commands..."
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-slate-400 px-1.5 py-1 rounded-lg focus:outline-none"
          />
          {query && (
            <button
              type="button"
              data-testid="command-palette-clear-btn"
              aria-label="Clear search query"
              onClick={() => {
                setQuery('');
                setActiveIndex(0);
                inputRef.current?.focus();
              }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            data-testid="command-palette-close-btn"
            aria-label="Close Command Palette (Esc)"
            onClick={onClose}
            className="min-h-[26px] px-2 py-0.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-[10px] font-mono text-slate-300 hover:text-white transition shrink-0"
          >
            Esc
          </button>
        </div>

        {/* Category Filter Pills */}
        <div
          role="group"
          aria-label="Filter command palette categories"
          onWheel={(e) => {
            if (e.deltaY !== 0) {
              e.currentTarget.scrollLeft += e.deltaY;
            }
          }}
          className="px-4 py-2 border-b border-slate-800/80 bg-slate-900/80 flex items-center gap-1.5 overflow-x-auto"
        >
          {filterTabs.map((tab) => {
            const isSelected = category === tab.id;
            const count = categoryCounts[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`cmd-filter-${tab.id}`}
                aria-label={`${tab.label} (${count})`}
                aria-pressed={isSelected}
                onClick={() => {
                  setCategory(tab.id);
                  setActiveIndex(0);
                  inputRef.current?.focus();
                }}
                className={`min-h-[26px] px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1.5 transition shrink-0 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-950/70 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  aria-hidden="true"
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    isSelected
                      ? 'bg-indigo-950/60 text-indigo-100'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Polite Screen-Reader Result Count */}
        <div role="status" aria-live="polite" className="sr-only">
          {`${orderedItems.length} ${
            orderedItems.length === 1 ? 'command' : 'commands'
          } available`}
        </div>

        {/* Scrollable Results & Empty-State Container (Empty state kept outside role="listbox" per WAI-ARIA 1.2) */}
        <div className="flex-1 overflow-y-auto p-2">
          {!hasResults && (
            <div
              data-testid="command-palette-empty"
              className="py-10 px-4 text-center space-y-2.5"
            >
              <div className="w-10 h-10 rounded-2xl bg-slate-800/80 border border-slate-700 mx-auto flex items-center justify-center text-indigo-400">
                <Sparkles className="w-5 h-5" aria-hidden="true" />
              </div>
              <p className="text-xs font-semibold text-white">
                No matching apps, flows, notes, or commands
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                Try a different keyword or reset the active category filter.
              </p>
              {(query || category !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setCategory('all');
                    setActiveIndex(0);
                    inputRef.current?.focus();
                  }}
                  className="min-h-[28px] px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition"
                >
                  Reset Search &amp; Filters
                </button>
              )}
            </div>
          )}

          <div
            ref={listboxRef}
            id="command-palette-listbox"
            data-testid="command-palette-listbox"
            role="listbox"
            aria-label="Command palette results"
            hidden={!hasResults}
            onMouseDown={(e) => e.preventDefault()}
            className="space-y-2.5"
          >
            {groupedSections.map(([sectionKey, entries]) => {
              const groupHeadingId = `cmd-group-heading-${sectionKey}`;
              return (
                <div
                  key={sectionKey}
                  role="group"
                  aria-labelledby={groupHeadingId}
                  className="space-y-1"
                >
                  <div
                    id={groupHeadingId}
                    role="presentation"
                    className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between"
                  >
                    <span>{SECTION_LABELS[sectionKey]}</span>
                    <span className="font-mono text-slate-400">{` (${entries.length})`}</span>
                  </div>

                  {entries.map(({ item, flatIndex }) => {
                    const isActive = flatIndex === safeActiveIndex;
                    const accentStyle =
                      ACCENT_ICON_BADGE[item.accent || 'indigo'];
                    const optionAriaLabel = `${item.title}${
                      item.badge ? `, ${item.badge}` : ''
                    } — ${item.subtitle}${
                      item.shortcutHint ? ` (${item.shortcutHint})` : ''
                    }`;
                    return (
                      <div
                        key={item.id}
                        id={`cmd-option-${item.id}`}
                        data-testid={`cmd-option-${item.id}`}
                        role="option"
                        aria-selected={isActive}
                        aria-label={optionAriaLabel}
                        tabIndex={-1}
                        onMouseMove={(e) => {
                          const prev = lastPointerPosRef.current;
                          if (
                            prev &&
                            prev.x === e.clientX &&
                            prev.y === e.clientY
                          ) {
                            return;
                          }
                          lastPointerPosRef.current = {
                            x: e.clientX,
                            y: e.clientY,
                          };
                          if (activeIndex !== flatIndex) {
                            setActiveIndex(flatIndex);
                          }
                        }}
                        onClick={() => item.onSelect()}
                        className={`min-h-[44px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition border ${
                          isActive
                            ? 'bg-indigo-600/25 border-indigo-400/60 text-white shadow-sm'
                            : 'bg-transparent border-transparent text-slate-200 hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            aria-hidden="true"
                            className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 overflow-hidden ${accentStyle}`}
                          >
                            {item.customIconUrl ? (
                              <img
                                src={item.customIconUrl}
                                alt=""
                                aria-hidden="true"
                                className="w-5 h-5 object-contain"
                              />
                            ) : item.renderIcon ? (
                              item.renderIcon()
                            ) : (
                              <DynamicIcon
                                name={item.iconName || 'rocket'}
                                className="w-4 h-4"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-white truncate">
                                {item.title}
                              </span>
                              {item.badge && (
                                <span className="max-w-[110px] truncate px-1.5 py-0.5 rounded-md bg-slate-800/90 border border-slate-700/80 text-[10px] font-medium text-slate-300 shrink-0">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              {item.subtitle}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.shortcutHint && (
                            <kbd className="max-w-[96px] truncate px-1.5 py-0.5 rounded-md bg-slate-950/90 border border-slate-700/80 font-mono text-[10px] text-slate-300">
                              {item.shortcutHint}
                            </kbd>
                          )}
                          {isActive && (
                            <span
                              aria-hidden="true"
                              className="w-6 h-6 rounded-lg bg-indigo-500/30 border border-indigo-400/50 text-indigo-200 flex items-center justify-center"
                            >
                              <CornerDownLeft className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Keyboard Legend */}
        <div className="px-4 py-2 border-t border-slate-800/90 bg-slate-950/80 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-slate-300">
                ↑↓
              </kbd>
              <span>Navigate</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-slate-300">
                ↵
              </kbd>
              <span>Run / Open</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-slate-300">
                Esc
              </kbd>
              <span>Close</span>
            </span>
          </div>
          <span className="hidden sm:inline font-mono text-slate-300">
            Ctrl+K Palette
          </span>
        </div>
      </div>
    </Modal>
  );
};
